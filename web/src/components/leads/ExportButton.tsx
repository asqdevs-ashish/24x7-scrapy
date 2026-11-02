'use client';

import { motion } from 'framer-motion';
import { Check, Download } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

const MAX_EXPORT_ROWS = 50_000;

// A plain link to the streaming CSV endpoint: the browser downloads it with the
// session cookie, and nothing is buffered in page memory. `params` must be the
// exact filters + sort the grid is showing.
export function ExportButton({
  params,
  count,
  label = 'Export CSV',
  scope,
  className,
}: {
  params: URLSearchParams;
  count: number | null;
  label?: string;
  scope?: string; // e.g. "Karnataka" → toast says "12 Karnataka leads" instead of "current filters"
  className?: string;
}) {
  const { toast } = useToast();
  const [started, setStarted] = useState(false);
  const exportParams = new URLSearchParams(params);
  exportParams.delete('page');
  exportParams.delete('pageSize');
  const href = `/api/leads/export?${exportParams.toString()}`;
  const disabled = count === 0;

  return (
    <motion.a
      href={disabled ? undefined : href}
      download
      aria-disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      onClick={(e) => {
        e.stopPropagation(); // e.g. inside a clickable accordion header
        if (disabled) {
          e.preventDefault();
          return;
        }
        setStarted(true);
        setTimeout(() => setStarted(false), 2200);
        toast({
          kind: 'info',
          title: 'Export started',
          description: scope
            ? count && count > MAX_EXPORT_ROWS
              ? `First ${formatNumber(MAX_EXPORT_ROWS)} of ${formatNumber(count)} ${scope} leads.`
              : `${count === null ? 'All' : formatNumber(count)} ${scope} leads in one CSV.`
            : count && count > MAX_EXPORT_ROWS
              ? `First ${formatNumber(MAX_EXPORT_ROWS)} of ${formatNumber(count)} leads (current filters & sort).`
              : `${count === null ? 'All matching' : formatNumber(count)} leads with the current filters.`,
        });
      }}
      className={cn(
        'group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-semibold text-white',
        'border border-emerald-400/40 bg-[linear-gradient(120deg,rgb(16_185_129/0.25),rgb(56_217_245/0.2))]',
        'shadow-[0_0_24px_-8px_rgb(52_211_153/0.8)] transition-[box-shadow,border-color] hover:border-emerald-300/70 hover:shadow-[0_0_32px_-6px_rgb(52_211_153/0.95)]',
        disabled && 'pointer-events-none opacity-40',
        className,
      )}
    >
      <span className="absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgb(255_255_255/0.18),transparent)] transition-transform duration-700 group-hover:translate-x-full" />
      {started ? <Check className="relative size-4" /> : <Download className="relative size-4" />}
      <span className="relative truncate">{label}</span>
      {count !== null && (
        <span className="relative rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] tabular-nums text-emerald-100">
          {formatNumber(Math.min(count, MAX_EXPORT_ROWS))}
        </span>
      )}
    </motion.a>
  );
}
