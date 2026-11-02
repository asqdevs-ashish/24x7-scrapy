// JSON shapes returned by the API routes (dates arrive as ISO strings).
import type { RatingTier } from './filters';

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface JobDTO {
  id: number;
  location: string;
  category: string;
  status: JobStatus;
  target_leads: number | null;
  is_priority: boolean;
  refresh_existing: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  attempts: number;
  error: string | null;
  cards_seen: number;
  leads_saved: number;
}

export interface JobsResponse {
  data: JobDTO[];
  counts: Partial<Record<JobStatus, number>>;
}

// One location that already has a job for the requested category.
export interface DuplicateJob {
  location: string;
  job_id: number;
  status: JobStatus;
  created_at: string;
  leads: number;
  active: boolean; // pending/running/paused → always skipped, never duplicated
}

export interface DuplicateConflict {
  code: 'DUPLICATE';
  error: string;
  duplicates: DuplicateJob[];
  newLocations: string[];
}

export interface TriggerInfo {
  ok: boolean;
  configured?: boolean;
  error?: string;
}

export interface CreateJobsResponse {
  created: Pick<JobDTO, 'id' | 'location' | 'category' | 'status' | 'is_priority' | 'target_leads'>[];
  skippedActive: string[];
  skippedExisting: string[];
  trigger: TriggerInfo | null;
}

export interface LeadDTO {
  id: number;
  business_name: string;
  category: string;
  google_category: string | null;
  phone: string | null;
  rating: number | null;
  reviews_count: number;
  has_website: boolean;
  website_url: string | null;
  social_url: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  search_location: string | null;
  job_id: number | null;
  created_at: string;
}

export interface LeadsResponse {
  data: LeadDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LeadSegment {
  total: number;
  tiers: Record<RatingTier, number>;
}

export interface LeadStats {
  total: number;
  withWebsite: LeadSegment;
  withoutWebsite: LeadSegment;
}
