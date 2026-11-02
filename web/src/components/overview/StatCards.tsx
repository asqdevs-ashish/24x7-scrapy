'use client';

import { motion } from 'framer-motion';
import { Activity, Globe, GlobeLock, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { AnimatedNumber, Skeleton } from '@/components/ui/primitives';
import type { JobStatus, LeadStats } from '@/lib/types';

function Stat({
  label,
  value,
  icon,
  accent,
  footnote,
  index,
}: {
  label: string;
  value: number | null;
  icon: ReactNode;
  accent: string;
  footnote?: ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
      className="glass group relative min-w-0 overflow-hidden rounded-2xl p-4 sm:p-5"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: accent }}
      />
      <div className="relative flex items-center justify-between">
        <p className="truncate text-xs text-slate-400 sm:text-sm">{label}</p>
        <span className="hidden size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-200 sm:grid">
          {icon}
        </span>
      </div>
      <div className="relative mt-2 text-2xl font-semibold tracking-tight text-white sm:mt-3 sm:text-3xl">
        {value === null ? <Skeleton className="h-9 w-24" /> : <AnimatedNumber value={value} />}
      </div>
      {footnote && <div className="relative mt-1.5 text-xs text-slate-500">{footnote}</div>}
    </motion.div>
  );
}

export function StatCards({ stats, counts }: { stats: LeadStats | null; counts: Partial<Record<JobStatus, number>> | null }) {
  const pct = (n: number) => (stats && stats.total ? `${Math.round((n / stats.total) * 100)}% of all leads` : '—');
  const active = counts ? (counts.pending ?? 0) + (counts.running ?? 0) : null;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Stat index={0} label="Total leads" value={stats?.total ?? null} icon={<Users className="size-4" />} accent="#4d8dff" footnote="Across every job" />
      <Stat
        index={1}
        label="With website"
        value={stats?.withWebsite.total ?? null}
        icon={<Globe className="size-4" />}
        accent="#38d9f5"
        footnote={stats ? pct(stats.withWebsite.total) : null}
      />
      <Stat
        index={2}
        label="Without website"
        value={stats?.withoutWebsite.total ?? null}
        icon={<GlobeLock className="size-4" />}
        accent="#9b6bff"
        footnote={stats ? pct(stats.withoutWebsite.total) : null}
      />
      <Stat
        index={3}
        label="Active jobs"
        value={active}
        icon={<Activity className="size-4" />}
        accent="#f062c0"
        footnote={
          counts ? `${counts.running ?? 0} running · ${counts.pending ?? 0} queued · ${counts.paused ?? 0} paused` : null
        }
      />
    </div>
  );
}
