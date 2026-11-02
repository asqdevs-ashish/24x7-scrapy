'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { RATING_TIERS, TIER_LABEL, type RatingTier } from '@/lib/filters';
import { formatNumber } from '@/lib/format';
import type { LeadSegment } from '@/lib/types';

const TIER_COLOR: Record<RatingTier, string> = {
  '5': 'from-emerald-400 to-teal-300',
  '4': 'from-lime-400 to-emerald-400',
  '3': 'from-amber-300 to-yellow-300',
  '2': 'from-orange-400 to-amber-400',
  '1': 'from-rose-400 to-orange-400',
  '0': 'from-rose-500 to-rose-400',
  u: 'from-slate-500 to-slate-400',
};

// Clickable tier cards. Clicking one narrows the grid below to that tier;
// clicking it again (or "All") clears it.
export function RatingTierSummary({
  segment,
  active,
  onSelect,
}: {
  segment: LeadSegment | null;
  active: RatingTier | null;
  onSelect: (tier: RatingTier | null) => void;
}) {
  if (!segment) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[74px]" />
        ))}
      </div>
    );
  }

  const max = Math.max(1, ...RATING_TIERS.map((t) => segment.tiers[t]));

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <TierCard
        label="All tiers"
        count={segment.total}
        ratio={1}
        color="from-neon-blue to-neon-violet"
        active={active === null}
        onClick={() => onSelect(null)}
      />
      {RATING_TIERS.map((tier, i) => (
        <TierCard
          key={tier}
          index={i}
          label={TIER_LABEL[tier]}
          count={segment.tiers[tier]}
          ratio={segment.tiers[tier] / max}
          color={TIER_COLOR[tier]}
          active={active === tier}
          disabled={segment.tiers[tier] === 0}
          onClick={() => onSelect(active === tier ? null : tier)}
        />
      ))}
    </div>
  );
}

function TierCard({
  label,
  count,
  ratio,
  color,
  active,
  disabled,
  onClick,
  index = 0,
}: {
  label: string;
  count: number;
  ratio: number;
  color: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  index?: number;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { delay: index * 0.03 } }}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'relative overflow-hidden rounded-xl border p-3 text-left transition-[border-color,background,box-shadow]',
        active
          ? 'border-neon-blue/60 bg-neon-blue/10 shadow-[0_0_24px_-10px_rgb(77_141_255/0.9)]'
          : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
        {label !== 'All tiers' && label !== 'Unrated' && <Star className="size-3 fill-current text-amber-300/80" />}
        {label.replace(' ★', '')}
      </span>
      <span className="mt-1 block text-lg font-semibold tabular-nums text-white">
        {formatNumber(count)}
        <span className="ml-1 text-xs font-normal text-slate-500">leads</span>
      </span>
      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.span
          className={cn('block h-full rounded-full bg-linear-to-r', color)}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(ratio * 100, count ? 4 : 0)}%` }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </span>
    </motion.button>
  );
}
