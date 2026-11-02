'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Globe, Hash, MessageSquareText, Phone, RotateCcw, Search, SlidersHorizontal, Star, Tag } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLeadFilters } from '@/components/providers/FiltersProvider';
import { FloatingInput } from '@/components/ui/FloatingField';
import { Card, Chip, Segmented } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { activeFilterCount, RATING_TIERS, REVIEW_PRESETS, TIER_LABEL, type RatingTier, type WebsiteFilter } from '@/lib/filters';

function Section({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-white/[0.06] bg-obsidian-900/40 p-4', className)}>
      <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span className="text-neon-blue">{icon}</span>
        {title}
      </p>
      {children}
    </div>
  );
}

const numberInput =
  'h-9 w-full rounded-lg border border-white/[0.08] bg-obsidian-900/80 px-3 text-sm tabular-nums text-white outline-none ' +
  'placeholder:text-slate-600 focus:border-neon-blue/60 focus:shadow-[0_0_0_3px_rgb(77_141_255/0.15)]';

export function FilterPanel() {
  const { filters, setFilters, reset } = useLeadFilters();
  const presetId =
    REVIEW_PRESETS.find((p) => p.min === filters.minReviews && p.max === filters.maxReviews)?.id ?? 'custom';
  const [customOpen, setCustomOpen] = useState(presetId === 'custom');
  const active = activeFilterCount(filters);

  const minN = filters.minReviews === '' ? null : Number(filters.minReviews);
  const maxN = filters.maxReviews === '' ? null : Number(filters.maxReviews);
  const rangeError = minN !== null && maxN !== null && minN > maxN ? 'Min is greater than max' : null;

  function toggleTier(tier: RatingTier) {
    const has = filters.ratings.includes(tier);
    setFilters({
      ratings: has ? filters.ratings.filter((t) => t !== tier) : RATING_TIERS.filter((t) => t === tier || filters.ratings.includes(t)),
    });
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Master filters
          <AnimatePresence>
            {active > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="rounded-full bg-neon-blue/20 px-2 py-0.5 text-xs font-semibold text-sky-200"
              >
                {active} active
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      }
      subtitle="Applied instantly in the database — also used by job views and CSV export."
      icon={<SlidersHorizontal className="size-5" />}
      actions={
        <button
          onClick={() => {
            reset();
            setCustomOpen(false);
          }}
          disabled={!active}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 px-3 text-sm text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
        >
          <RotateCcw className="size-3.5" />
          Reset all
        </button>
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2 2xl:grid-cols-4">
        {/* Reviews */}
        <Section icon={<MessageSquareText className="size-3.5" />} title="Review count">
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_PRESETS.map((p) => (
              <Chip
                key={p.id}
                role="radio"
                active={presetId === p.id && !customOpen}
                onClick={() => {
                  setCustomOpen(false);
                  setFilters({ minReviews: p.min, maxReviews: p.max });
                }}
              >
                {p.label}
              </Chip>
            ))}
            <Chip role="radio" active={customOpen || presetId === 'custom'} onClick={() => setCustomOpen(true)}>
              Custom
            </Chip>
          </div>
          <AnimatePresence initial={false}>
            {(customOpen || presetId === 'custom') && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-2 pt-3">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="Min"
                    aria-label="Minimum reviews"
                    value={filters.minReviews}
                    onChange={(e) => setFilters({ minReviews: e.target.value })}
                    className={numberInput}
                  />
                  <span className="text-slate-600">–</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="Max"
                    aria-label="Maximum reviews"
                    value={filters.maxReviews}
                    onChange={(e) => setFilters({ maxReviews: e.target.value })}
                    className={numberInput}
                  />
                </div>
                {rangeError && <p className="pt-1.5 text-xs text-rose-400">{rangeError}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* Rating */}
        <Section icon={<Star className="size-3.5" />} title="Star rating">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {(['0', '1', '2', '3', '4', '5', 'u'] as RatingTier[]).map((tier) => {
              const on = filters.ratings.includes(tier);
              return (
                <motion.label
                  key={tier}
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    'flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                    on
                      ? 'border-neon-violet/60 bg-neon-violet/15 text-white shadow-[0_0_16px_-6px_rgb(155_107_255/0.9)]'
                      : 'border-white/[0.08] text-slate-400 hover:border-white/20 hover:text-slate-200',
                  )}
                >
                  <input type="checkbox" checked={on} onChange={() => toggleTier(tier)} className="peer sr-only" />
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-neon-violet/60',
                      on ? 'border-neon-violet bg-neon-violet' : 'border-white/20',
                    )}
                  >
                    <AnimatePresence>
                      {on && (
                        <motion.svg
                          viewBox="0 0 12 12"
                          className="size-2.5 text-white"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <motion.path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </motion.svg>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    {tier !== 'u' && <Star className="size-3 fill-amber-300/80 text-amber-300/80" />}
                    {TIER_LABEL[tier].replace(' ★', '').replace(' – ', '–')}
                  </span>
                </motion.label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-500">None checked = every rating</p>
        </Section>

        {/* Website */}
        <Section icon={<Globe className="size-3.5" />} title="Website">
          <Segmented<WebsiteFilter>
            layoutId="master-website"
            className="w-full"
            value={filters.website}
            onChange={(website) => setFilters({ website })}
            options={[
              { value: 'all', label: 'All' },
              { value: 'yes', label: 'Has website' },
              { value: 'no', label: 'No website' },
            ]}
          />
          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500">
            Facebook, JustDial, 99acres etc. count as <span className="text-slate-400">no website</span>.
          </p>
        </Section>

        {/* Search */}
        <Section icon={<Search className="size-3.5" />} title="Search">
          <div className="-mb-5 space-y-0">
            <FloatingInput
              label="Category"
              icon={<Tag className="size-4" />}
              value={filters.category}
              onChange={(e) => setFilters({ category: e.target.value })}
              maxLength={100}
            />
            <FloatingInput
              label="Business name"
              icon={<Hash className="size-4" />}
              value={filters.name}
              onChange={(e) => setFilters({ name: e.target.value })}
              maxLength={100}
            />
            <FloatingInput
              label="Phone"
              icon={<Phone className="size-4" />}
              inputMode="tel"
              value={filters.phone}
              onChange={(e) => setFilters({ phone: e.target.value })}
              maxLength={20}
            />
          </div>
        </Section>
      </div>
    </Card>
  );
}
