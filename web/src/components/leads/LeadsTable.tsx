'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  SearchX,
  Star,
} from 'lucide-react';
import { useToast } from '@/components/providers/ToastProvider';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { SortKey, SortOrder } from '@/lib/filters';
import { formatDate, formatNumber, formatPhone, hostOf, timeAgo } from '@/lib/format';
import type { LeadDTO, LeadsResponse } from '@/lib/types';

interface Props {
  result: LeadsResponse | null;
  loading: boolean;
  error?: string | null;
  sort: SortKey;
  order: SortOrder;
  onSort: (key: SortKey) => void;
  onPage: (page: number) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

function ratingTone(r: number | null) {
  if (r === null) return 'text-slate-500';
  if (r >= 4.5) return 'text-emerald-300';
  if (r >= 4) return 'text-lime-300';
  if (r >= 3) return 'text-amber-300';
  return 'text-rose-300';
}

function RatingCell({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-slate-500">Unrated</span>;
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold tabular-nums', ratingTone(rating))}>
      <Star className="size-3.5 fill-current" />
      {rating.toFixed(1)}
    </span>
  );
}

function PhoneCell({ phone }: { phone: string | null }) {
  const { toast } = useToast();
  if (!phone) return <span className="text-slate-600">—</span>;
  const pretty = formatPhone(phone);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone!);
      toast({ kind: 'success', title: 'Phone copied', description: pretty });
    } catch {
      toast({ kind: 'error', title: 'Clipboard unavailable' });
    }
  }

  return (
    <span className="group/phone inline-flex items-center gap-1.5 whitespace-nowrap">
      <a href={`tel:${phone}`} className="font-mono text-[13px] tracking-tight text-slate-100 hover:text-neon-cyan">
        {pretty}
      </a>
      <button
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
        aria-label={`Copy ${pretty}`}
        className="rounded p-1 text-slate-600 opacity-0 transition hover:bg-white/5 hover:text-slate-200 focus:opacity-100 group-hover/phone:opacity-100"
      >
        <Copy className="size-3.5" />
      </button>
    </span>
  );
}

function WebsiteCell({ lead }: { lead: LeadDTO }) {
  if (lead.website_url) {
    return (
      <a
        href={lead.website_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex max-w-[200px] items-center gap-1.5 rounded-lg border border-neon-blue/25 bg-neon-blue/10 px-2 py-1 text-xs font-medium text-sky-200 transition hover:border-neon-blue/60 hover:shadow-glow-blue"
      >
        <Globe className="size-3.5 shrink-0" />
        <span className="truncate">{hostOf(lead.website_url)}</span>
        <ExternalLink className="size-3 shrink-0 opacity-60" />
      </a>
    );
  }
  if (lead.social_url) {
    return (
      <a
        href={lead.social_url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
        title={lead.social_url}
      >
        {hostOf(lead.social_url).split('.')[0]} page
        <ExternalLink className="size-3 opacity-60" />
      </a>
    );
  }
  return <span className="whitespace-nowrap rounded-lg bg-white/[0.03] px-2 py-1 text-xs text-slate-500">No website</span>;
}

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'business_name', label: 'Business' },
  { key: 'category', label: 'Category' },
  { key: null, label: 'Phone' },
  { key: 'rating', label: 'Rating' },
  { key: 'reviews_count', label: 'Reviews', className: 'text-right' },
  { key: null, label: 'Website' },
  { key: null, label: 'Address' },
  { key: 'created_at', label: 'Added' },
];

export function LeadsTable({ result, loading, error, sort, order, onSort, onPage, emptyTitle, emptyDescription }: Props) {
  if (error) {
    return <EmptyState icon={<SearchX className="size-5" />} title="Could not load leads" description={error} />;
  }

  if (!result) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const from = result.total ? (result.page - 1) * result.pageSize + 1 : 0;
  const to = Math.min(result.page * result.pageSize, result.total);

  return (
    <div className="relative">
      {/* top loading bar */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 0.85, transition: { duration: 1.2, ease: 'easeOut' } }}
            exit={{ scaleX: 1, opacity: 0, transition: { duration: 0.25 } }}
            className="absolute inset-x-0 -top-px z-10 h-0.5 origin-left rounded-full bg-[linear-gradient(90deg,#4d8dff,#9b6bff)]"
          />
        )}
      </AnimatePresence>

      {result.data.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title={emptyTitle ?? 'No leads match these filters'}
          description={emptyDescription ?? 'Loosen a filter or reset them to see more.'}
        />
      ) : (
        <>
          {/* Desktop */}
          <div className={cn('scrollbar-thin hidden overflow-x-auto rounded-xl border border-white/[0.06] transition-opacity lg:block', loading && 'opacity-60')}>
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-white/[0.02] text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.label}
                      className={cn('px-4 py-3 font-medium', c.className)}
                      aria-sort={c.key && sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {c.key ? (
                        <button
                          onClick={() => onSort(c.key!)}
                          className={cn(
                            'inline-flex items-center gap-1 uppercase transition-colors hover:text-slate-200',
                            sort === c.key && 'text-neon-blue',
                          )}
                        >
                          {c.label}
                          {sort === c.key ? (
                            order === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        c.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.data.map((lead, i) => (
                  <motion.tr
                    key={lead.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: Math.min(i * 0.012, 0.25) } }}
                    className="border-t border-white/[0.05] align-top transition-colors hover:bg-white/[0.025]"
                  >
                    <td className="max-w-[280px] px-4 py-3">
                      <div className="flex items-start gap-1.5">
                        <p className="font-medium leading-snug text-white">{lead.business_name}</p>
                        {lead.maps_url && (
                          <a
                            href={lead.maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${lead.business_name} in Google Maps`}
                            className="mt-0.5 shrink-0 text-slate-600 hover:text-neon-blue"
                          >
                            <MapPin className="size-3.5" />
                          </a>
                        )}
                      </div>
                      {lead.google_category && <p className="mt-0.5 text-xs text-slate-500">{lead.google_category}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap rounded-md border border-neon-violet/25 bg-neon-violet/10 px-2 py-0.5 text-xs text-violet-200">
                        {lead.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <PhoneCell phone={lead.phone} />
                    </td>
                    <td className="px-4 py-3">
                      <RatingCell rating={lead.rating} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">{formatNumber(lead.reviews_count)}</td>
                    <td className="px-4 py-3">
                      <WebsiteCell lead={lead} />
                    </td>
                    <td className="max-w-[300px] px-4 py-3">
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-400" title={lead.address ?? ''}>
                        {lead.address ?? '—'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500" title={formatDate(lead.created_at)}>
                      {timeAgo(lead.created_at)}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <ul className={cn('space-y-2 transition-opacity lg:hidden', loading && 'opacity-60')}>
            {result.data.map((lead) => (
              <li key={lead.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-white">{lead.business_name}</p>
                    <p className="mt-0.5 text-xs text-violet-300">{lead.category}</p>
                  </div>
                  <RatingCell rating={lead.rating} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3.5 text-slate-500" />
                    <PhoneCell phone={lead.phone} />
                  </span>
                  <span className="text-xs text-slate-400">{formatNumber(lead.reviews_count)} reviews</span>
                </div>
                <div className="mt-3">
                  <WebsiteCell lead={lead} />
                </div>
                {lead.address && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{lead.address}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {result.total > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
          <span>
            <span className="text-slate-200">{formatNumber(from)}–{formatNumber(to)}</span> of{' '}
            <span className="text-slate-200">{formatNumber(result.total)}</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPage(result.page - 1)}
              disabled={result.page <= 1 || loading}
              aria-label="Previous page"
              className="grid size-9 place-items-center rounded-xl border border-white/10 transition hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-20 text-center tabular-nums">
              {result.page} / {totalPages}
            </span>
            <button
              onClick={() => onPage(result.page + 1)}
              disabled={result.page >= totalPages || loading}
              aria-label="Next page"
              className="grid size-9 place-items-center rounded-xl border border-white/10 transition hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
