'use client';

import { ChevronsDownUp, ChevronsUpDown, FolderTree, Info, ListChecks, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DeleteJobDialog } from '@/components/jobs/DeleteJobDialog';
import { JobGroupCard } from '@/components/jobs/JobGroupCard';
import { Card, EmptyState, Segmented, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { groupJobsByState } from '@/lib/job-groups';
import { newestFirst } from '@/lib/job-order';
import type { JobDTO, JobStatus } from '@/lib/types';

type StatusFilter = 'all' | JobStatus;

const EXPANDED_KEY = 'jobs.expandedGroups.v1';

// Which folders are open: remembered per browser (a convenience; failures are harmless).
function useExpandedGroups() {
  const [expanded, setExpanded] = useState<Set<string> | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EXPANDED_KEY);
      if (saved) setExpanded(new Set(JSON.parse(saved) as string[]));
    } catch {
      /* blocked storage */
    }
  }, []);

  const update = useCallback((next: Set<string>) => {
    setExpanded(next);
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }, []);

  return [expanded, update] as const;
}

interface Props {
  jobs: JobDTO[] | null;
  counts: Partial<Record<JobStatus, number>>;
  loading: boolean;
  onRefresh: () => void;
  onChanged: () => void;
  onOpen: (job: JobDTO) => void;
  onDeleted: (id: number) => void;
}

export function JobsGrid({ jobs, counts, loading, onRefresh, onChanged, onOpen, onDeleted }: Props) {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [toDelete, setToDelete] = useState<JobDTO | null>(null);
  const [storedExpanded, setExpanded] = useExpandedGroups();

  const groups = useMemo(() => groupJobsByState(jobs ?? []), [jobs]);

  const q = query.trim().toLowerCase();
  const filtering = status !== 'all' || q !== '';

  const visible = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          rows: group.jobs
            .filter((j) => status === 'all' || j.status === status)
            .filter(
              (j) =>
                !q ||
                j.location.toLowerCase().includes(q) ||
                j.category.toLowerCase().includes(q) ||
                group.name.toLowerCase().includes(q) ||
                String(j.id) === q.replace(/^#/, ''),
            )
            .sort(newestFirst), // strictly newest first inside every folder
        }))
        .filter(({ rows }) => !filtering || rows.length > 0),
    [groups, status, q, filtering],
  );

  // First visit: open the first folder so the jobs are one glance away.
  const expanded = storedExpanded ?? new Set(groups[0] ? [groups[0].key] : []);
  const isOpen = (key: string) => expanded.has(key) || q !== ''; // searching opens matching folders

  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpanded(next);
  };
  const allOpen = visible.length > 0 && visible.every(({ group }) => expanded.has(group.key));
  const setAll = (open: boolean) => setExpanded(open ? new Set(visible.map(({ group }) => group.key)) : new Set());

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const truncated = jobs !== null && jobs.length < total;

  return (
    <Card
      title="Jobs overview"
      subtitle="Grouped by state (the part after the last comma) · newest jobs first."
      icon={<FolderTree className="size-5" />}
      delay={0.12}
      actions={
        <>
          {groups.length > 1 && (
            <button
              onClick={() => setAll(!allOpen)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {allOpen ? <ChevronsDownUp className="size-4" /> : <ChevronsUpDown className="size-4" />}
              {allOpen ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          <button
            onClick={onRefresh}
            aria-label="Refresh jobs"
            className="grid size-9 place-items-center rounded-xl border border-white/10 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          </button>
        </>
      }
    >
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="scrollbar-thin -mx-1 overflow-x-auto px-1">
          <Segmented<StatusFilter>
            layoutId="job-status-filter"
            size="sm"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'all', label: <>All <Count n={total} /></> },
              { value: 'pending', label: <>Pending <Count n={counts.pending} /></> },
              { value: 'running', label: <>Running <Count n={counts.running} /></> },
              { value: 'paused', label: <>Paused <Count n={counts.paused} /></> },
              { value: 'completed', label: <>Completed <Count n={counts.completed} /></> },
              { value: 'failed', label: <>Failed <Count n={counts.failed} /></> },
            ]}
          />
        </div>
        <label className="relative xl:ml-auto xl:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search state, location, category, #id"
            aria-label="Search jobs"
            className="h-9 w-full rounded-xl border border-white/[0.08] bg-obsidian-900/80 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-neon-blue/60 focus:shadow-[0_0_0_3px_rgb(77_141_255/0.15)]"
          />
        </label>
      </div>

      {truncated && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-xs text-amber-200/90">
          <Info className="mt-px size-3.5 shrink-0" />
          Showing the newest {formatNumber(jobs.length)} of {formatNumber(total)} jobs, so folder totals cover those only. Each
          “Download All” file still includes every job in that state.
        </p>
      )}

      {jobs === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-5" />}
          title={jobs.length ? 'No jobs match' : 'No jobs yet'}
          description={jobs.length ? 'Try another status or search term.' : 'Queue your first location above.'}
        />
      ) : (
        <div className="space-y-3">
          {visible.map(({ group, rows }, i) => (
            <JobGroupCard
              key={group.key}
              group={group}
              rows={rows}
              filtering={filtering}
              expanded={isOpen(group.key)}
              onToggle={() => toggle(group.key)}
              index={i}
              onOpen={onOpen}
              onChanged={onChanged}
              onDelete={setToDelete}
            />
          ))}
        </div>
      )}

      <DeleteJobDialog job={toDelete} onClose={() => setToDelete(null)} onDeleted={onDeleted} />
    </Card>
  );
}

function Count({ n }: { n?: number }) {
  return <span className="rounded-md bg-white/[0.06] px-1.5 text-[10px] tabular-nums text-slate-300">{n ?? 0}</span>;
}
