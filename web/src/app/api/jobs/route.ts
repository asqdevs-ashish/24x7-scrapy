import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { triggerWorkerRun } from '@/lib/github';
import type { CreateJobsResponse, DuplicateConflict, DuplicateJob, JobStatus } from '@/lib/types';
import { createJobSchema, MAX_LOCATIONS_PER_REQUEST, splitLocations } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE: JobStatus[] = ['pending', 'running', 'paused'];
const JOB_STATUSES: JobStatus[] = ['pending', 'running', 'paused', 'completed', 'failed'];

// Most recent job per location (case-insensitive) for this category.
async function findExistingJobs(category: string, locations: string[]): Promise<Map<string, DuplicateJob>> {
  const lowered = locations.map((l) => l.toLowerCase());
  const rows = await prisma.$queryRaw<
    { id: number; location: string; status: JobStatus; created_at: Date; leads: number }[]
  >`
    SELECT DISTINCT ON (lower(j.location))
           j.id, j.location, j.status::text AS status, j.created_at,
           (SELECT count(*)::int FROM realtor_leads l WHERE l.job_id = j.id) AS leads
    FROM scraping_jobs j
    WHERE lower(j.category) = lower(${category})
      AND lower(j.location) = ANY(${lowered}::text[])
    ORDER BY lower(j.location), j.created_at DESC`;

  return new Map(
    rows.map((r) => [
      r.location.toLowerCase(),
      {
        location: r.location,
        job_id: r.id,
        status: r.status,
        created_at: r.created_at.toISOString(),
        leads: r.leads,
        active: ACTIVE.includes(r.status),
      },
    ]),
  );
}

// POST /api/jobs
// { location: "Koramangala, Bengaluru\nHSR Layout, Bengaluru", category: "real estate agency",
//   target_leads: 50 | null, is_priority: true, on_duplicate: "ask" | "fresh" | "skip" }
//
// One job per location line. If a location+category already has a finished job,
// on_duplicate="ask" returns 409 with the list so the UI can ask the user.
// Locations with a pending/running/paused job are always skipped.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const parsed = createJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { category, target_leads, is_priority, on_duplicate } = parsed.data;
  const locations = splitLocations(parsed.data.location);

  if (!locations.length) {
    return NextResponse.json({ error: 'No valid location given' }, { status: 400 });
  }
  if (locations.length > MAX_LOCATIONS_PER_REQUEST) {
    return NextResponse.json(
      { error: `At most ${MAX_LOCATIONS_PER_REQUEST} locations per request (got ${locations.length})` },
      { status: 400 },
    );
  }

  const existing = await findExistingJobs(category, locations);
  const newLocations = locations.filter((l) => !existing.has(l.toLowerCase()));
  const duplicates = locations.filter((l) => existing.has(l.toLowerCase())).map((l) => existing.get(l.toLowerCase())!);
  const finishedDuplicates = duplicates.filter((d) => !d.active);

  if (on_duplicate === 'ask' && finishedDuplicates.length) {
    const conflict: DuplicateConflict = {
      code: 'DUPLICATE',
      error: 'This combination already exists.',
      duplicates,
      newLocations,
    };
    return NextResponse.json(conflict, { status: 409 });
  }

  const rows = [
    ...newLocations.map((location) => ({ location, refresh_existing: false })),
    ...(on_duplicate === 'fresh'
      ? finishedDuplicates.map((d) => ({ location: d.location, refresh_existing: true }))
      : []),
  ];

  const created = rows.length
    ? await prisma.scrapingJob.createManyAndReturn({
        data: rows.map((r) => ({ ...r, category, target_leads, is_priority })),
        select: { id: true, location: true, category: true, status: true, is_priority: true, target_leads: true },
      })
    : [];

  const trigger =
    is_priority && created.length
      ? await triggerWorkerRun({ maxJobs: created.length, reason: `priority job #${created[0].id}` })
      : null;

  const response: CreateJobsResponse = {
    created,
    skippedActive: duplicates.filter((d) => d.active).map((d) => d.location),
    skippedExisting: on_duplicate === 'skip' ? finishedDuplicates.map((d) => d.location) : [],
    trigger,
  };
  return NextResponse.json(response, { status: created.length ? 201 : 200 });
}

// GET /api/jobs?status=paused&limit=50 – most recent jobs first (limit ≤ 2000,
// enough for the grouped Jobs view to see every job of a statewide run).
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const status = params.get('status') as JobStatus | null;
  const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 2000);

  if (status && !JOB_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const [jobs, counts] = await Promise.all([
    prisma.scrapingJob.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }], // newest first, stable for same-instant batches
      take: limit,
      include: { _count: { select: { leads: true } } },
    }),
    prisma.scrapingJob.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    // leads_saved = live count of leads attributed to the job (a "fresh" re-run
    // moves refreshed leads to the newer job).
    data: jobs.map(({ _count, ...job }) => ({ ...job, leads_saved: _count.leads })),
    counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
}
