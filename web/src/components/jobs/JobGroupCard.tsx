'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Folder, FolderOpen, Zap } from 'lucide-react';
import { useId, useMemo } from 'react';
import { JobRows } from '@/components/jobs/JobRows';
import { ExportButton } from '@/components/leads/ExportButton';
import { AnimatedNumber } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { OTHERS_GROUP, type JobGroup } from '@/lib/job-groups';
import type { JobDTO, JobStatus } from '@/lib/types';

const STATUS_DOTS: { status: JobStatus; label: string; dot: string }[] = [
  { status: 'running', label: 'running', dot: 'bg-sky-300 shadow-[0_0_8px_rgb(56_189_248/0.9)]' },
  { status: 'pending', label: 'queued', dot: 'bg-amber-300' },
  { status: 'paused', label: 'paused', dot: 'bg-violet-300' },
  { status: 'failed', label: 'failed', dot: 'bg-rose-300' },
  { status: 'completed', label: 'done', dot: 'bg-emerald-300' },
];

interface Props {
  group: JobGroup<JobDTO>; // every job of the state (header totals)
  rows: JobDTO[]; // the jobs to list (after status / search filter), newest first
  filtering: boolean;
  expanded: boolean;
  onToggle: () => void;
  index: number;
  onOpen: (job: JobDTO) => void;
  onChanged: () => void;
  onDelete: (job: JobDTO) => void;
}

// One state "folder": a header with totals + a bulk CSV download, expanding to
// the job rows. Clicking anywhere on the header toggles it, except the download.
export function JobGroupCard({ group, rows, filtering, expanded, onToggle, index, onOpen, onChanged, onDelete }: Props) {
  const bodyId = useId();

  const stats = useMemo(() => {
    const byStatus: Partial<Record<JobStatus, number>> = {};
    let leads = 0;
    let priority = 0;
    for (const j of group.jobs) {
      byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
      leads += j.leads_saved;
      if (j.is_priority && (j.status === 'pending' || j.status === 'running')) priority++;
    }
    return { byStatus, leads, priority, done: byStatus.completed ?? 0 };
  }, [group.jobs]);

  const total = group.jobs.length;
  const isOthers = group.name === OTHERS_GROUP;
  const downloadLabel = isOthers ? 'Download All Other Leads' : `Download All ${group.name} Leads`;
  const live = (stats.byStatus.running ?? 0) > 0;

  return (
    <motion.section
      layout="position"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-[border-color,box-shadow,background] duration-300',
        expanded
          ? 'border-neon-blue/30 bg-obsidian-900/60 shadow-[0_0_40px_-18px_rgb(77_141_255/0.7)]'
          : 'border-white/[0.07] bg-obsidian-900/40 hover:border-white/15',
      )}
    >
      {expanded && (
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(77_141_255/0.7),rgb(155_107_255/0.7),transparent)]" />
      )}

      {/* Header */}
      <div
        onClick={onToggle}
        className="group/header flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-3 p-4 transition-colors hover:bg-white/[0.02] sm:p-5"
      >
        <span
          className={cn(
            'relative grid size-12 shrink-0 place-items-center rounded-2xl border transition-colors',
            expanded
              ? 'border-neon-blue/40 bg-[linear-gradient(135deg,rgb(77_141_255/0.3),rgb(155_107_255/0.3))] text-white shadow-glow-blue'
              : 'border-white/10 bg-[linear-gradient(135deg,rgb(77_141_255/0.12),rgb(155_107_255/0.12))] text-neon-blue',
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={expanded ? 'open' : 'closed'}
              initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {expanded ? <FolderOpen className="size-5" /> : <Folder className="size-5" />}
            </motion.span>
          </AnimatePresence>
          {live && (
            <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-sky-300" />
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1 basis-56">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="flex max-w-full items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/60"
          >
            <h3 className="truncate text-lg font-semibold tracking-tight text-white">{group.name}</h3>
            {stats.priority > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-amber-400/40 bg-amber-400/10 px-1.5 py-px text-[10px] font-semibold text-amber-300">
                <Zap className="size-2.5 fill-current" />
                {stats.priority}
              </span>
            )}
            {filtering && (
              <span className="shrink-0 rounded-md bg-neon-blue/15 px-1.5 py-px text-[11px] text-sky-200">
                {rows.length} of {total} shown
              </span>
            )}
          </button>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span>
              <span className="font-semibold text-slate-200">{formatNumber(total)}</span> job{total === 1 ? '' : 's'}
            </span>
            {STATUS_DOTS.filter((s) => stats.byStatus[s.status]).map((s) => (
              <span key={s.status} className="inline-flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', s.dot)} />
                {stats.byStatus[s.status]} {s.label}
              </span>
            ))}
          </div>

          <div className="mt-2 h-1 max-w-sm overflow-hidden rounded-full bg-white/[0.06]" title={`${stats.done} of ${total} jobs completed`}>
            <motion.div
              className="h-full rounded-full bg-linear-to-r from-emerald-400 to-neon-cyan"
              initial={{ width: 0 }}
              animate={{ width: `${total ? (stats.done / total) * 100 : 0}%` }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>

        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="mr-1 text-right">
            <AnimatedNumber value={stats.leads} className="block text-2xl font-semibold leading-none tracking-tight text-white" />
            <span className="text-[11px] uppercase tracking-wider text-slate-500">leads</span>
          </div>
          <ExportButton
            params={new URLSearchParams({ stateGrouping: group.name })}
            count={stats.leads}
            label={downloadLabel}
            scope={isOthers ? 'ungrouped' : group.name}
            className="min-w-0 flex-1 sm:flex-none"
          />
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 text-slate-400 transition-colors group-hover/header:text-white"
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </div>
      </div>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/[0.06] p-3 sm:p-4">
              {rows.length ? (
                <JobRows rows={rows} onOpen={onOpen} onChanged={onChanged} onDelete={onDelete} />
              ) : (
                <p className="px-2 py-6 text-center text-sm text-slate-500">No jobs in {group.name} match the current filter.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
