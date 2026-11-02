'use client';

import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ExportButton } from '@/components/leads/ExportButton';
import { FilterPanel } from '@/components/leads/FilterPanel';
import { LeadsTable } from '@/components/leads/LeadsTable';
import { useLeadFilters } from '@/components/providers/FiltersProvider';
import { Card } from '@/components/ui/primitives';
import { filtersToParams, type SortKey, type SortOrder } from '@/lib/filters';
import { formatNumber } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { LeadsResponse } from '@/lib/types';

const PAGE_SIZE = 50;

export function LeadsView() {
  const { applied } = useLeadFilters();
  const [sort, setSort] = useState<SortKey>('created_at');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);

  const filterKey = filtersToParams(applied).toString();
  useEffect(() => setPage(1), [filterKey, sort, order]);

  const params = filtersToParams(applied, { page, pageSize: PAGE_SIZE, sort, order });
  const leads = useApi<LeadsResponse>(`/api/leads?${params}`);

  function onSort(key: SortKey) {
    if (key === sort) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setOrder(key === 'business_name' || key === 'category' ? 'asc' : 'desc');
    }
  }

  return (
    <div className="space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-gradient text-2xl font-semibold tracking-tight sm:text-3xl">Leads</h1>
          <p className="mt-1 text-sm text-slate-400">
            {leads.data ? (
              <>
                <span className="font-semibold text-white">{formatNumber(leads.data.total)}</span> leads match your filters
              </>
            ) : (
              'Loading…'
            )}
          </p>
        </div>
        <ExportButton params={params} count={leads.data?.total ?? null} className="h-11 px-5" />
      </motion.header>

      <FilterPanel />

      <Card title="All leads" subtitle="Sorted and paged in the database." icon={<Users className="size-5" />} delay={0.1}>
        <LeadsTable
          result={leads.data}
          loading={leads.loading}
          error={leads.error}
          sort={sort}
          order={order}
          onSort={onSort}
          onPage={setPage}
        />
      </Card>
    </div>
  );
}
