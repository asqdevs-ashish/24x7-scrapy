import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { triggerWorkerRun } from '@/lib/github';
import type { CreateJobsResponse, DuplicateConflict, DuplicateJob, JobPair, JobStatus } from '@/lib/types';
import { createJobSchema, MAX_JOBS_PER_REQUEST, MAX_LOCATIONS_PER_REQUEST, splitLocations } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIVE: JobStatus[] = ['pending', 'running', 'paused'];
const JOB_STATUSES: JobStatus[] = ['pending', 'running', 'paused', 'completed', 'failed'];

const pairKey = (location: string, category: string) => `${location.toLowerCase()}\u0000${category.toLowerCase()}`;

// Most recent job per location × category (case-insensitive) among the requested ones.
async function findExistingJobs(categories: string[], locations: string[]): Promise<Map<string, DuplicateJob>> {
  const rows = await prisma.$queryRaw<
    { id: number; location: string; category: string; status: JobStatus; created_at: Date; leads: number }[]
  >`
    SELECT DISTINCT ON (lower(j.location), lower(j.category))
           j.id, j.location, j.category, j.status::text AS status, j.created_at,
           (SELECT count(*)::int FROM realtor_leads l WHERE l.job_id = j.id) AS leads
    FROM scraping_jobs j
    WHERE lower(j.category) = ANY(${categories.map((c) => c.toLowerCase())}::text[])
      AND lower(j.location) = ANY(${locations.map((l) => l.toLowerCase())}::text[])
    ORDER BY lower(j.location), lower(j.category), j.created_at DESC`;

  return new Map(
    rows.map((r) => [
      pairKey(r.location, r.category),
      {
        location: r.location,
        category: r.category,
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
// { location: "Delhi\nMumbai", categories: ["plumber", "electrician", "broker"],
//   target_leads: 50 | null, is_priority: true, on_duplicate: "ask" | "fresh" | "skip" }
//
// One job per location line × category (2 locations × 3 categories = 6 jobs).
// A single `category` string is still accepted. If a pair already has a finished
// job, on_duplicate="ask" returns 409 with the list so the UI can ask the user.
// Pairs with a pending/running/paused job are always skipped.
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

  const { categories, target_leads, is_priority, on_duplicate } = parsed.data;
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
  if (locations.length * categories.length > MAX_JOBS_PER_REQUEST) {
    return NextResponse.json(
      {
        error: `At most ${MAX_JOBS_PER_REQUEST} jobs per request (${locations.length} locations × ${categories.length} categories = ${locations.length * categories.length})`,
      },
      { status: 400 },
    );
  }

  // Location-major order: all categories of the first location queue first.
  const pairs: JobPair[] = locations.flatMap((location) => categories.map((category) => ({ location, category })));

  const existing = await findExistingJobs(categories, locations);
  const newJobs = pairs.filter((p) => !existing.has(pairKey(p.location, p.category)));
  const duplicates = pairs.flatMap((p) => existing.get(pairKey(p.location, p.category)) ?? []);
  const finishedDuplicates = duplicates.filter((d) => !d.active);

  if (on_duplicate === 'ask' && finishedDuplicates.length) {
    const conflict: DuplicateConflict = {
      code: 'DUPLICATE',
      error: 'This combination already exists.',
      duplicates,
      newJobs,
    };
    return NextResponse.json(conflict, { status: 409 });
  }

  // Keep the typed spelling for new pairs; re-runs reuse the stored job's spelling.
  const rows = [
    ...newJobs.map((p) => ({ ...p, refresh_existing: false })),
    ...(on_duplicate === 'fresh'
      ? finishedDuplicates.map((d) => ({ location: d.location, category: d.category, refresh_existing: true }))
      : []),
  ];

  const created = rows.length
    ? await prisma.scrapingJob.createManyAndReturn({
        data: rows.map((r) => ({ ...r, target_leads, is_priority })),
        select: { id: true, location: true, category: true, status: true, is_priority: true, target_leads: true },
      })
    : [];

  // One dispatch wakes the worker; it then drains the queue (priority first).
  const trigger =
    is_priority && created.length
      ? await triggerWorkerRun({ maxJobs: created.length, reason: `priority job #${created[0].id}` })
      : null;

  const toPair = (d: DuplicateJob): JobPair => ({ location: d.location, category: d.category });
  const response: CreateJobsResponse = {
    created,
    skippedActive: duplicates.filter((d) => d.active).map(toPair),
    skippedExisting: on_duplicate === 'skip' ? finishedDuplicates.map(toPair) : [],
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
