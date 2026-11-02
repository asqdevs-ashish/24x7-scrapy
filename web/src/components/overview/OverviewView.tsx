'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import { JobLeadsModal } from '@/components/jobs/JobLeadsModal';
import { JobsGrid } from '@/components/jobs/JobsGrid';
import { NewJobForm } from '@/components/jobs/NewJobForm';
import { StatCards } from '@/components/overview/StatCards';
import { useApi } from '@/lib/hooks';
import type { JobDTO, JobsResponse, LeadStats } from '@/lib/types';

export function OverviewView() {
  // Grouped view needs every job of a state for correct folder totals.
  const jobs = useApi<JobsResponse>('/api/jobs?limit=2000', { refreshMs: 15_000 });
  const stats = useApi<LeadStats>('/api/leads/stats', { refreshMs: 60_000 });
  const [openJobId, setOpenJobId] = useState<number | null>(null);

  // Look the job up from the live list so the modal header updates while it runs.
  const openJob: JobDTO | null = openJobId ? (jobs.data?.data.find((j) => j.id === openJobId) ?? null) : null;

  // Drop the deleted job from local state right away (no reload), fix the status
  // counts, then refresh the lead totals in the background.
  function removeJob(id: number) {
    jobs.mutate((prev) => {
      if (!prev) return prev;
      const gone = prev.data.find((j) => j.id === id);
      if (!gone) return prev;
      return {
        data: prev.data.filter((j) => j.id !== id),
        counts: { ...prev.counts, [gone.status]: Math.max(0, (prev.counts[gone.status] ?? 1) - 1) },
      };
    });
    if (openJobId === id) setOpenJobId(null);
    stats.reload(true);
  }

  return (
    <div className="space-y-6">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-1">
        <h1 className="text-gradient text-2xl font-semibold tracking-tight sm:text-3xl">Overview</h1>
        <p className="text-sm text-slate-400">
          Queue locations, watch the worker, and drill into each job&apos;s leads.
        </p>
      </motion.header>

      <StatCards stats={stats.data} counts={jobs.data?.counts ?? null} />

      {/* minmax(0,…) lets the wide jobs table scroll inside its card instead of stretching the page */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 2xl:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
        <NewJobForm onCreated={() => jobs.reload(true)} />
        <JobsGrid
          jobs={jobs.data?.data ?? null}
          counts={jobs.data?.counts ?? {}}
          loading={jobs.loading}
          onRefresh={() => {
            jobs.reload();
            stats.reload(true);
          }}
          onChanged={() => jobs.reload(true)}
          onOpen={(job) => setOpenJobId(job.id)}
          onDeleted={removeJob}
        />
      </div>

      {jobs.error && <p className="text-sm text-rose-400">Jobs: {jobs.error}</p>}

      <JobLeadsModal job={openJob} onClose={() => setOpenJobId(null)} onChanged={() => jobs.reload(true)} />
    </div>
  );
}
