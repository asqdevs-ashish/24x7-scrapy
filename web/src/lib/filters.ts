// Client-safe filter model shared by the filter panel, the leads grid, the job
// modal, the stats endpoint and the CSV export – one source of truth for the
// URL query string the API understands.

export const RATING_TIERS = ['5', '4', '3', '2', '1', '0', 'u'] as const;
export type RatingTier = (typeof RATING_TIERS)[number];

export const TIER_LABEL: Record<RatingTier, string> = {
  '5': '5.0 ★',
  '4': '4 – 4.9 ★',
  '3': '3 – 3.9 ★',
  '2': '2 – 2.9 ★',
  '1': '1 – 1.9 ★',
  '0': '0 – 0.9 ★',
  u: 'Unrated',
};

export type WebsiteFilter = 'all' | 'yes' | 'no';
export type SortKey = 'created_at' | 'rating' | 'reviews_count' | 'business_name' | 'category';
export type SortOrder = 'asc' | 'desc';

export interface LeadFilters {
  minReviews: string;
  maxReviews: string;
  ratings: RatingTier[]; // empty = any rating
  website: WebsiteFilter;
  category: string;
  name: string;
  phone: string;
}

export const EMPTY_FILTERS: LeadFilters = {
  minReviews: '',
  maxReviews: '',
  ratings: [],
  website: 'all',
  category: '',
  name: '',
  phone: '',
};

export const REVIEW_PRESETS = [
  { id: 'any', label: 'Any', min: '', max: '' },
  { id: '1-10', label: '1 – 10', min: '1', max: '10' },
  { id: '10-100', label: '10 – 100', min: '10', max: '100' },
  { id: '1-100', label: '1 – 100', min: '1', max: '100' },
  { id: '100-500', label: '100 – 500', min: '100', max: '500' },
  { id: '500+', label: '500+', min: '500', max: '' },
] as const;

export function activeFilterCount(f: LeadFilters): number {
  return (
    (f.minReviews || f.maxReviews ? 1 : 0) +
    (f.ratings.length ? 1 : 0) +
    (f.website !== 'all' ? 1 : 0) +
    (f.category.trim() ? 1 : 0) +
    (f.name.trim() ? 1 : 0) +
    (f.phone.trim() ? 1 : 0)
  );
}

export interface QueryExtras {
  jobId?: number;
  page?: number;
  pageSize?: number;
  sort?: SortKey;
  order?: SortOrder;
}

export function filtersToParams(f: LeadFilters, extras: QueryExtras = {}): URLSearchParams {
  const p = new URLSearchParams();
  if (f.minReviews.trim()) p.set('minReviews', f.minReviews.trim());
  if (f.maxReviews.trim()) p.set('maxReviews', f.maxReviews.trim());
  if (f.ratings.length) p.set('ratings', f.ratings.join(','));
  if (f.website !== 'all') p.set('website', f.website);
  if (f.category.trim()) p.set('category', f.category.trim());
  if (f.name.trim()) p.set('name', f.name.trim());
  if (f.phone.trim()) p.set('phone', f.phone.trim());
  if (extras.jobId) p.set('jobId', String(extras.jobId));
  if (extras.page) p.set('page', String(extras.page));
  if (extras.pageSize) p.set('pageSize', String(extras.pageSize));
  if (extras.sort) p.set('sort', extras.sort);
  if (extras.order) p.set('order', extras.order);
  return p;
}

// Combines the master filters with a job-modal view (website tab + rating tier).
// Returns null when the combination can never match (e.g. master says
// "no website" but the tab is "with website"), so the caller can skip the fetch.
export function scopeFilters(
  master: LeadFilters,
  scope: { website: 'yes' | 'no'; tier: RatingTier | null },
): LeadFilters | null {
  if (master.website !== 'all' && master.website !== scope.website) return null;

  let ratings = master.ratings;
  if (scope.tier) {
    if (ratings.length && !ratings.includes(scope.tier)) return null;
    ratings = [scope.tier];
  }
  return { ...master, website: scope.website, ratings };
}
