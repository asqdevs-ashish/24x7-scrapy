'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Filter, Globe, GlobeLock, MapPin, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { JobControlButton } from '@/components/jobs/JobControlButton';
import { ExportButton } from '@/components/leads/ExportButton';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { RatingTierSummary } from '@/components/leads/RatingTierSummary';
import { useLeadFilters } from '@/components/providers/FiltersProvider';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, StatusPill } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import {
  activeFilterCount,
  EMPTY_FILTERS,
  filtersToParams,
  scopeFilters,
  TIER_LABEL,
  type RatingTier,
  type SortKey,
  type SortOrder,
} from '@/lib/filters';
import { formatNumber, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { JobDTO, LeadsResponse, LeadStats } from '@/lib/types';

type Tab = 'yes' | 'no';
const PAGE_SIZE = 25;

export function JobLeadsModal({ job, onClose, onChanged }: { job: JobDTO | null; onClose: () => void; onChanged: () => void }) {
  return (
    <Modal
      open={!!job}
      onClose={onClose}
      headerExtra={job ? <JobControlButton job={job} onChanged={onChanged} /> : null}
      title={
        job ? (
          <span className="flex items-center gap-2">
            <MapPin className="size-5 shrink-0 text-neon-blue" />
            <span className="truncate">{job.location}</span>
          </span>
        ) : null
      }
      subtitle={
        job && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusPill status={job.status} />
            {job.is_priority && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                <Zap className="size-3 fill-current" /> Priority
              </span>
            )}
            <span>{job.category}</span>
            <span className="text-slate-600">·</span>
            <span>Target {job.target_leads ? formatNumber(job.target_leads) : '∞'}</span>
            <span className="text-slate-600">·</span>
            <span>
              Job #{job.id} · {timeAgo(job.created_at)}
            </span>
            <span className="text-slate-600">·</span>
            <span>
              {formatNumber(job.leads_saved)} saved from {formatNumber(job.cards_seen)} results
            </span>
          </span>
        )
      }
    >
      {job && <JobLeadsBody key={job.id} job={job} />}
    </Modal>
  );
}

function JobLeadsBody({ job }: { job: JobDTO }) {
  const { applied } = useLeadFilters();
  const [useMaster, setUseMaster] = useState(true);
  const [tab, setTab] = useState<Tab>('yes');
  const [tier, setTier] = useState<RatingTier | null>(null);
  const [sort, setSort] = useState<SortKey>('rating');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);

  const base = useMaster ? applied : EMPTY_FILTERS;
  const masterCount = activeFilterCount(applied);
  const live = job.status === 'running' || job.status === 'pending';

  const statsUrl = `/api/leads/stats?${filtersToParams(base, { jobId: job.id })}`;
  const stats = useApi<LeadStats>(statsUrl, { refreshMs: live ? 20_000 : undefined });

  // Open on the segment that actually has leads.
  const [autoTabbed, setAutoTabbed] = useState(false);
  useEffect(() => {
    if (autoTabbed || !stats.data) return;
    setAutoTabbed(true);
    if (stats.data.withWebsite.total === 0 && stats.data.withoutWebsite.total > 0) setTab('no');
  }, [stats.data, autoTabbed]);

  useEffect(() => setPage(1), [tab, tier, sort, order, statsUrl]);

  const scoped = useMemo(() => scopeFilters(base, { website: tab, tier }), [base, tab, tier]);
  const params = scoped ? filtersToParams(scoped, { jobId: job.id, page, pageSize: PAGE_SIZE, sort, order }) : null;
  const leads = useApi<LeadsResponse>(params ? `/api/leads?${params}` : null, { refreshMs: live ? 20_000 : undefined });

  const segment = stats.data ? (tab === 'yes' ? stats.data.withWebsite : stats.data.withoutWebsite) : null;

  function onSort(key: SortKey) {
    if (key === sort) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setOrder(key === 'business_name' || key === 'category' ? 'asc' : 'desc');
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Globe; count: number | null; glow: string }[] = [
    { id: 'yes', label: 'With website', icon: Globe, count: stats.data?.withWebsite.total ?? null, glow: 'rgb(77 141 255' },
    { id: 'no', label: 'Without website', icon: GlobeLock, count: stats.data?.withoutWebsite.total ?? null, glow: 'rgb(155 107 255' },
  ];

  return (
    <div className="space-y-5 p-5 sm:p-7">
      {/* Tabs + controls */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
        <div role="tablist" aria-label="Website segment" className="grid flex-1 grid-cols-2 gap-2 sm:max-w-xl">
          {tabs.map((t) => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(t.id);
                  setTier(null);
                }}
                className={cn(
                  'relative flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 text-left transition-colors',
                  active ? 'border-transparent' : 'border-white/[0.07] hover:border-white/15',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="job-tab"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="absolute inset-0 rounded-2xl border"
                    style={{
                      borderColor: `${t.glow} / 0.55)`,
                      background: `linear-gradient(120deg, ${t.glow} / 0.18), transparent 70%)`,
                      boxShadow: `0 0 34px -12px ${t.glow} / 0.9)`,
                    }}
                  />
                )}
                <Icon className={cn('relative size-5', active ? 'text-white' : 'text-slate-500')} />
                <span className="relative min-w-0">
                  <span className={cn('block text-sm font-medium', active ? 'text-white' : 'text-slate-400')}>{t.label}</span>
                  <span className="block text-xl font-semibold tabular-nums text-white">
                    {t.count === null ? '…' : formatNumber(t.count)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:ml-auto">
          <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
            <button
              type="button"
              role="switch"
              aria-checked={useMaster}
              onClick={() => setUseMaster((v) => !v)}
              className={cn(
                'relative h-6 w-11 rounded-full border transition-colors',
                useMaster ? 'border-neon-blue/60 bg-neon-blue/30' : 'border-white/15 bg-white/[0.04]',
              )}
            >
              <motion.span
                layout
                transition={{ type: 'spring', stiffness: 600, damping: 32 }}
                className={cn('absolute top-0.5 size-[18px] rounded-full bg-white shadow', useMaster ? 'right-0.5' : 'left-0.5')}
              />
            </button>
            <span className="inline-flex items-center gap-1.5">
              <Filter className="size-3.5 text-slate-500" />
              Master filters
              {masterCount > 0 && (
                <span className="rounded-full bg-neon-blue/20 px-1.5 text-[11px] font-semibold text-sky-200">{masterCount}</span>
              )}
            </span>
          </label>
          {params && <ExportButton params={params} count={leads.data?.total ?? null} />}
        </div>
      </div>

      {/* Tier summary for the active segment */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: tab === 'yes' ? -16 : 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: tab === 'yes' ? 16 : -16 }}
          transition={{ duration: 0.22 }}
          className="space-y-5"
        >
          <div>
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Rating tiers · {tab === 'yes' ? 'with website' : 'without website'}
              {tier && <span className="ml-2 normal-case tracking-normal text-sky-300">showing {TIER_LABEL[tier]}</span>}
            </p>
            {stats.error ? (
              <p className="text-sm text-rose-400">{stats.error}</p>
            ) : (
              <RatingTierSummary segment={segment} active={tier} onSelect={setTier} />
            )}
          </div>

          {scoped ? (
            <LeadsTable
              result={leads.data}
              loading={leads.loading}
              error={leads.error}
              sort={sort}
              order={order}
              onSort={onSort}
              onPage={setPage}
              emptyTitle={live ? 'No leads here yet' : 'No leads in this segment'}
              emptyDescription={live ? 'This job is still in the queue or running — leads stream in as they are scraped.' : undefined}
            />
          ) : (
            <EmptyState
              icon={<Filter className="size-5" />}
              title="Excluded by master filters"
              description="Your master filters rule out this segment. Turn off “Master filters” above to see everything for this job."
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
