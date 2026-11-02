// State/region grouping for jobs. Shared by the Jobs grid (client) and the CSV
// export (server), so a group's "Download all" file contains exactly the leads
// of the jobs shown under that group.
//
//   "Whitefield, Bengaluru, Karnataka"          → Karnataka
//   "Whitefield, Bengaluru, Karnataka 560066"   → Karnataka   (PIN code dropped)
//   "Koramangala, Bengaluru, Karnataka, India"  → Karnataka   (country dropped)
//   "Marathahalli"                              → Others      (no comma)

export const OTHERS_GROUP = 'Others';

const COUNTRY_SUFFIXES = new Set(['india', 'bharat']);

function cleanPart(part: string): string {
  return part
    .replace(/\b\d{5,6}\b/g, '') // PIN / ZIP codes
    .replace(/\s+/g, ' ')
    .trim();
}

function displayName(name: string): string {
  // Keep the user's casing ("NCR", "Tamil Nadu"); title-case all-lowercase input.
  if (name !== name.toLowerCase()) return name;
  return name.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

export function stateOfLocation(location: string): string {
  const parts = location.split(',').map(cleanPart).filter(Boolean);
  while (parts.length > 1 && COUNTRY_SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  if (parts.length < 2) return OTHERS_GROUP;
  return displayName(parts[parts.length - 1]);
}

// Case-insensitive key: "karnataka" and "Karnataka" are one group.
export const stateKey = (state: string) => state.trim().toLowerCase();

export interface JobGroup<T> {
  key: string;
  name: string;
  jobs: T[];
}

// Groups in alphabetical order, "Others" last. Jobs keep their input order.
export function groupJobsByState<T extends { location: string }>(jobs: T[]): JobGroup<T>[] {
  const groups = new Map<string, JobGroup<T>>();
  for (const job of jobs) {
    const name = stateOfLocation(job.location);
    const key = stateKey(name);
    const group = groups.get(key);
    if (group) group.jobs.push(job);
    else groups.set(key, { key, name, jobs: [job] });
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === stateKey(OTHERS_GROUP)) return 1;
    if (b.key === stateKey(OTHERS_GROUP)) return -1;
    return a.name.localeCompare(b.name);
  });
}
