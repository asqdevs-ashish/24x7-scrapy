// Jobs are always listed newest first (created_at desc, then id desc for jobs
// created in the same instant, e.g. one multi-location batch).
export function newestFirst<T extends { created_at: string; id: number }>(a: T, b: T): number {
  return b.created_at.localeCompare(a.created_at) || b.id - a.id;
}
