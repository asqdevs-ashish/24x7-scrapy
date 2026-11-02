import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { triggerWorkerRun } from '@/lib/github';
import type { JobStatus } from '@/lib/types';
import { jobActionSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface UpdatedJob {
  id: number;
  status: JobStatus;
  is_priority: boolean;
}

// PATCH /api/jobs/:id  { action: "pause" | "resume" }
//   pause:  pending|running → paused. A running worker sees it at its next
//           heartbeat (≤ 20 places or 90 s), saves progress and exits.
//   resume: paused → pending (keeps progress; the worker fast-forwards past
//           leads already saved). failed → pending also resets the attempt count.
// Both transitions are single conditional UPDATEs, so they cannot race the worker.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }
  const parsed = jobActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'action must be "pause" or "resume"' }, { status: 400 });
  }
  const { action } = parsed.data;

  const rows =
    action === 'pause'
      ? await prisma.$queryRaw<UpdatedJob[]>`
          UPDATE scraping_jobs
          SET status = 'paused'
          WHERE id = ${id} AND status IN ('pending', 'running')
          RETURNING id, status::text AS status, is_priority`
      : await prisma.$queryRaw<UpdatedJob[]>`
          UPDATE scraping_jobs
          SET status = 'pending',
              finished_at = NULL,
              attempts = CASE WHEN status = 'failed' THEN 0 ELSE attempts END,
              error = CASE WHEN status = 'failed' THEN NULL ELSE error END
          WHERE id = ${id} AND status IN ('paused', 'failed')
          RETURNING id, status::text AS status, is_priority`;

  if (!rows.length) {
    const job = await prisma.scrapingJob.findUnique({ where: { id }, select: { status: true } });
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    return NextResponse.json(
      { error: `Job #${id} is ${job.status} — it can't be ${action === 'pause' ? 'paused' : 'resumed'}.`, status: job.status },
      { status: 409 },
    );
  }

  const job = rows[0];
  const trigger =
    action === 'resume' && job.is_priority
      ? await triggerWorkerRun({ maxJobs: 1, reason: `resume priority job #${id}` })
      : null;

  return NextResponse.json({ job, trigger });
}

// DELETE /api/jobs/:id – deletes the job; its leads go with it (ON DELETE CASCADE).
// A running job must be paused first: the worker would otherwise keep writing
// leads for a job that no longer exists.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const job = await prisma.scrapingJob.findUnique({
    where: { id },
    select: { status: true, _count: { select: { leads: true } } },
  });
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

  // Conditional delete: cannot race a worker claiming the job in between.
  const { count } = await prisma.scrapingJob.deleteMany({ where: { id, status: { not: 'running' } } });
  if (!count) {
    return NextResponse.json(
      { error: `Job #${id} is running — pause it first, then delete.`, status: 'running' },
      { status: 409 },
    );
  }

  return NextResponse.json({ deleted: id, leadsDeleted: job._count.leads });
}
