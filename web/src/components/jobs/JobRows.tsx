'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, RefreshCcw, Trash2, Zap } from 'lucide-react';
import { JobControlButton } from '@/components/jobs/JobControlButton';
import { StatusPill } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDate, formatNumber, timeAgo } from '@/lib/format';
import type { JobDTO } from '@/lib/types';

function JobDeleteButton({ job, onDelete, size = 'md' }: { job: JobDTO; onDelete: (job: JobDTO) => void; size?: 'sm' | 'md' }) {
  const running = job.status === 'running';
  const label = running ? 'Pause the job before deleting it' : `Delete job #${job.id}`;
  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation(); // the row itself opens the leads modal
        if (!running) onDelete(job);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      aria-disabled={running}
      whileTap={running ? undefined : { scale: 0.88 }}
      whileHover={running ? undefined : { scale: 1.06 }}
      aria-label={label}
      title={label}
      className={cn(
        'grid shrink-0 place-items-center rounded-xl border transition-[background,border-color,box-shadow,color]',
        size === 'sm' ? 'size-8' : 'size-9',
        running
          ? 'cursor-not-allowed border-white/[0.06] text-slate-700'
          : 'border-white/[0.08] text-slate-500 hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-300 hover:shadow-[0_0_18px_-4px_rgb(251_113_133/0.8)]',
      )}
    >
      <Trash2 className="size-4" />
    </motion.button>
  );
}

export function JobBadges({ job }: { job: JobDTO }) {
  return (
    <>
      {job.is_priority && (
        <span className="inline-flex items-center gap-0.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-amber-300 shadow-[0_0_12px_-4px_rgb(251_191_36/0.8)]">
          <Zap className="size-2.5 fill-current" />
          Priority
        </span>
      )}
      {job.refresh_existing && (
        <span
          title="Re-run: refreshes leads already stored by earlier jobs"
          className="inline-flex items-center gap-0.5 rounded-md border border-sky-400/30 bg-sky-400/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sky-300"
        >
          <RefreshCcw className="size-2.5" />
          Fresh
        </span>
      )}
    </>
  );
}

function LeadsProgress({ job }: { job: JobDTO }) {
  const pct = job.target_leads ? Math.min(100, (job.leads_saved / job.target_leads) * 100) : null;
  return (
    <div className="ml-auto w-28 text-right">
      <p className="tabular-nums">
        <span className="font-semibold text-white">{formatNumber(job.leads_saved)}</span>
        <span className="text-slate-500"> / {job.target_leads ? formatNumber(job.target_leads) : '∞'}</span>
      </p>
      {pct !== null ? (
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.span
            className="block h-full rounded-full bg-linear-to-r from-neon-blue to-neon-violet"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.6 }}
          />
        </span>
      ) : (
        <p className="text-[11px] text-slate-500">{formatNumber(job.cards_seen)} results</p>
      )}
    </div>
  );
}

interface Props {
  rows: JobDTO[]; // already newest first
  onOpen: (job: JobDTO) => void;
  onChanged: () => void;
  onDelete: (job: JobDTO) => void;
}

// The individual job rows (newest first): a table on desktop, cards on phones.
export function JobRows({ rows, onOpen, onChanged, onDelete }: Props) {
  return (
    <>
      {/* Desktop grid */}
      <div className="scrollbar-thin hidden overflow-x-auto rounded-xl border border-white/[0.06] md:block">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-24 px-4 py-3 font-medium">
                <span className="sr-only">Play / pause / delete</span>
              </th>
              <th className="px-4 py-3 font-medium">Job</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Leads / target</th>
              <th className="px-4 py-3 font-medium" aria-sort="descending">
                Created ↓
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((j, i) => (
                <motion.tr
                  key={j.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i * 0.02, 0.3) } }}
                  exit={{ opacity: 0 }}
                  tabIndex={0}
                  onClick={() => onOpen(j)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(j))}
                  className={cn(
                    'group cursor-pointer border-t border-white/[0.05] outline-none transition-colors hover:bg-neon-blue/[0.05] focus-visible:bg-neon-blue/[0.08]',
                    j.is_priority && j.status === 'pending' && 'bg-amber-400/[0.03]',
                  )}
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <JobControlButton job={j} onChanged={onChanged} />
                      <JobDeleteButton job={j} onDelete={onDelete} />
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">#{j.id}</td>
                  <td className="max-w-[320px] px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate font-medium text-slate-100">{j.location}</p>
                      <JobBadges job={j} />
                    </div>
                    {j.error && (
                      <p
                        className={cn('mt-0.5 truncate text-xs', j.status === 'failed' ? 'text-rose-400/90' : 'text-slate-500')}
                        title={j.error}
                      >
                        {j.error}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400">{j.category}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusPill status={j.status} />
                    {j.attempts > 1 && <span className="ml-2 text-xs text-slate-500">try {j.attempts}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <LeadsProgress job={j} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-400" title={formatDate(j.created_at)}>
                    {timeAgo(j.created_at)}
                  </td>
                  <td className="px-3 py-3 text-slate-600 transition-colors group-hover:text-neon-blue">
                    <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-2 md:hidden">
        {rows.map((j) => (
          <li key={j.id} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-col gap-1.5">
              <JobControlButton job={j} onChanged={onChanged} size="sm" />
              <JobDeleteButton job={j} onDelete={onDelete} size="sm" />
            </div>
            <button onClick={() => onOpen(j)} className="min-w-0 flex-1 text-left">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-medium text-slate-100">{j.location}</p>
                <StatusPill status={j.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                #{j.id} · {j.category} · {timeAgo(j.created_at)} <JobBadges job={j} />
              </div>
              <p className="mt-2 text-sm text-slate-300">
                <span className="font-semibold text-white">{formatNumber(j.leads_saved)}</span>
                {j.target_leads ? ` of ${formatNumber(j.target_leads)} target` : ' leads · unlimited'} ·{' '}
                {formatNumber(j.cards_seen)} results
              </p>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
