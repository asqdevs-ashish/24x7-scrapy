import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { RATING_TIERS, type RatingTier } from './filters';
import { stateKey, stateOfLocation } from './job-groups';
import { prisma } from './prisma';

// Server-side parsing of the lead filter query string (see lib/filters.ts for
// the client side). Used by /api/leads, /api/leads/stats and /api/leads/export.

const int = z.coerce.number().int();
const text = z.string().trim().max(100).optional();

export const leadFilterSchema = z
  .object({
    minReviews: int.min(0).optional(),
    maxReviews: int.min(0).optional(),
    ratings: z
      .string()
      .regex(/^[0-5u](,[0-5u])*$/, 'ratings must look like "4,5,u"')
      .optional()
      .transform((v) => (v ? ([...new Set(v.split(','))] as RatingTier[]) : [])),
    website: z.enum(['all', 'yes', 'no']).default('all'),
    category: text,
    name: text,
    phone: text,
    jobId: int.positive().optional(),
    // "Karnataka" → only leads of jobs whose location groups under that state
    // (same parser as the Jobs grid folders, see lib/job-groups.ts).
    stateGrouping: text,
  })
  .refine((v) => v.minReviews === undefined || v.maxReviews === undefined || v.minReviews <= v.maxReviews, {
    message: 'minReviews cannot be greater than maxReviews',
    path: ['minReviews'],
  });

export const leadListSchema = leadFilterSchema.and(
  z.object({
    page: int.min(1).default(1),
    pageSize: int.min(1).max(200).default(50),
    sort: z.enum(['created_at', 'rating', 'reviews_count', 'business_name', 'category']).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
);

export type LeadFilterQuery = z.infer<typeof leadFilterSchema>;
export type LeadListQuery = z.infer<typeof leadListSchema>;

// URLSearchParams → plain object, dropping empty values so "" never coerces to 0.
export function paramsToObject(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of params) if (value.trim() !== '') out[key] = value;
  return out;
}

// Bucket N = rating in [N, N+1); bucket 5 = 5.0; "u" = no rating yet.
export function tierWhere(tier: RatingTier): Prisma.RealtorLeadWhereInput {
  if (tier === 'u') return { rating: null };
  if (tier === '5') return { rating: { gte: 5 } };
  const n = Number(tier);
  return { rating: { gte: n, lt: n + 1 } };
}

export function buildLeadWhere(f: LeadFilterQuery): Prisma.RealtorLeadWhereInput {
  const and: Prisma.RealtorLeadWhereInput[] = [];

  if (f.minReviews !== undefined || f.maxReviews !== undefined) {
    and.push({ reviews_count: { gte: f.minReviews, lte: f.maxReviews } });
  }

  if (f.ratings.length && f.ratings.length < RATING_TIERS.length) {
    and.push({ OR: f.ratings.map(tierWhere) });
  }

  if (f.website === 'yes') and.push({ has_website: true });
  if (f.website === 'no') and.push({ has_website: false });

  if (f.category) and.push({ category: { contains: f.category, mode: 'insensitive' } });
  if (f.name) and.push({ business_name: { contains: f.name, mode: 'insensitive' } });

  if (f.phone) {
    const digits = f.phone.replace(/\D/g, '');
    if (digits) and.push({ phone: { contains: digits } });
  }

  if (f.jobId) and.push({ job_id: f.jobId });

  return and.length ? { AND: and } : {};
}

// The job ids whose location groups under `state`. Resolved in JS with the
// shared parser (not a SQL LIKE), so "…, Karnataka, India" and
// "…, Karnataka 560066" land in the same group as the Jobs grid shows.
export async function jobIdsForState(state: string): Promise<number[]> {
  const key = stateKey(state);
  const jobs = await prisma.scrapingJob.findMany({ select: { id: true, location: true } });
  return jobs.filter((j) => stateKey(stateOfLocation(j.location)) === key).map((j) => j.id);
}

// buildLeadWhere + the optional state scope (needs a DB lookup, hence async).
export async function resolveLeadWhere(f: LeadFilterQuery): Promise<Prisma.RealtorLeadWhereInput> {
  const where = buildLeadWhere(f);
  if (!f.stateGrouping) return where;
  const scope: Prisma.RealtorLeadWhereInput = { job_id: { in: await jobIdsForState(f.stateGrouping) } };
  return Object.keys(where).length ? { AND: [where, scope] } : scope;
}

export function buildLeadOrderBy(q: Pick<LeadListQuery, 'sort' | 'order'>): Prisma.RealtorLeadOrderByWithRelationInput[] {
  if (q.sort === 'rating') return [{ rating: { sort: q.order, nulls: 'last' } }, { id: 'desc' }];
  return [{ [q.sort]: q.order } as Prisma.RealtorLeadOrderByWithRelationInput, { id: 'desc' }];
}

export const LEAD_SELECT = {
  id: true,
  business_name: true,
  category: true,
  google_category: true,
  phone: true,
  rating: true,
  reviews_count: true,
  has_website: true,
  website_url: true,
  social_url: true,
  address: true,
  latitude: true,
  longitude: true,
  maps_url: true,
  search_location: true,
  job_id: true,
  created_at: true,
} satisfies Prisma.RealtorLeadSelect;
