'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EMPTY_FILTERS, type LeadFilters } from '@/lib/filters';
import { useDebouncedValue } from '@/lib/hooks';

// The master lead filters live in the dashboard layout, so they survive moving
// between Overview and Leads and are applied inside the job modal and exports.

interface FiltersApi {
  filters: LeadFilters; // live (what the inputs show)
  applied: LeadFilters; // debounced (what queries use)
  setFilters: (update: Partial<LeadFilters>) => void;
  reset: () => void;
}

const FiltersContext = createContext<FiltersApi | null>(null);
const STORAGE_KEY = 'leads.masterFilters.v1';

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setState] = useState<LeadFilters>(EMPTY_FILTERS);

  // Restore per-tab (sessionStorage is a convenience; failure is harmless).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setState({ ...EMPTY_FILTERS, ...JSON.parse(saved) });
    } catch {
      /* private mode / blocked storage */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  const applied = useDebouncedValue(filters, 350);
  const setFilters = useCallback((update: Partial<LeadFilters>) => setState((f) => ({ ...f, ...update })), []);
  const reset = useCallback(() => setState(EMPTY_FILTERS), []);

  const api = useMemo(() => ({ filters, applied, setFilters, reset }), [filters, applied, setFilters, reset]);
  return <FiltersContext.Provider value={api}>{children}</FiltersContext.Provider>;
}

export function useLeadFilters(): FiltersApi {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useLeadFilters must be used inside <FiltersProvider>');
  return ctx;
}
