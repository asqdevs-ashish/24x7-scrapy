import { z } from 'zod';

export const MAX_LOCATIONS_PER_REQUEST = 500;
export const MAX_TARGET_LEADS = 10_000;

// One request may create many jobs: one per non-empty line in `location`.
export const createJobSchema = z.object({
  location: z.string().trim().min(2, 'Location is required').max(20_000),
  category: z.string().trim().min(2, 'Category is required').max(100),
  // null = unlimited (scrape until Google's end of list)
  target_leads: z
    .number()
    .int('Target must be a whole number')
    .min(1, 'Target must be at least 1')
    .max(MAX_TARGET_LEADS, `Target can be at most ${MAX_TARGET_LEADS}`)
    .nullable()
    .default(null),
  is_priority: z.boolean().default(false),
  // What to do with locations that already have a finished job for this category:
  // ask = return 409 with the list, fresh = re-run and refresh stored leads, skip = only new ones
  on_duplicate: z.enum(['ask', 'fresh', 'skip']).default('ask'),
});

export const jobActionSchema = z.object({
  action: z.enum(['pause', 'resume']),
});

export function splitLocations(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const location = line.trim().replace(/\s+/g, ' ');
    const key = location.toLowerCase();
    if (location.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(location);
  }
  return out;
}
