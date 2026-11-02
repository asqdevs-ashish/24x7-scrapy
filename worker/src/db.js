'use strict';

// Plain SQL over node-postgres. The tables are created by Prisma migrations
// (web/prisma/schema.prisma); the table and column names there are the contract.
//
// Every status change the worker makes is conditional on status = 'running', so
// a Pause clicked in the dashboard is never overwritten by the worker.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 60_000,
  connectionTimeoutMillis: 20_000,
});

// An idle connection dropped by Neon must not crash the worker; the pool reconnects.
pool.on('error', (error) => console.error(`⚠️  Postgres idle client error: ${error.message}`));

const query = (text, params) => pool.query(text, params);

/* ------------------------------- jobs -------------------------------- */

async function reclaimStaleJobs(staleMinutes, maxAttempts) {
  const message = 'Previous worker run died while this job was running';

  const failed = await query(
    `UPDATE scraping_jobs
     SET status = 'failed', finished_at = NOW(), error = $3
     WHERE status = 'running'
       AND started_at < NOW() - make_interval(mins => $1)
       AND attempts >= $2`,
    [staleMinutes, maxAttempts, `${message}; gave up after ${maxAttempts} attempts`],
  );
  const requeued = await query(
    `UPDATE scraping_jobs
     SET status = 'pending', error = $2
     WHERE status = 'running'
       AND started_at < NOW() - make_interval(mins => $1)`,
    [staleMinutes, message],
  );
  return { failed: failed.rowCount, requeued: requeued.rowCount };
}

// Priority queue: VIP jobs first, then oldest first. Atomic: two workers can
// never claim the same row (FOR UPDATE SKIP LOCKED).
async function claimJob() {
  const { rows } = await query(
    `UPDATE scraping_jobs
     SET status = 'running', started_at = NOW(), finished_at = NULL, attempts = attempts + 1
     WHERE id = (
       SELECT id FROM scraping_jobs
       WHERE status = 'pending'
       ORDER BY is_priority DESC, created_at ASC, id ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING id, location, category, attempts, target_leads, is_priority, refresh_existing`,
  );
  return rows[0] || null;
}

// Heartbeat: the job's current status (did the user press Pause?), how many
// leads it really has, and whether a priority job is waiting in the queue.
async function heartbeat(id) {
  const { rows } = await query(
    `SELECT j.status::text AS status,
            (SELECT count(*)::int FROM realtor_leads WHERE job_id = j.id) AS leads,
            EXISTS (SELECT 1 FROM scraping_jobs p WHERE p.status = 'pending' AND p.is_priority) AS priority_waiting
     FROM scraping_jobs j
     WHERE j.id = $1`,
    [id],
  );
  return rows[0] || { status: null, leads: 0, priority_waiting: false };
}

async function countJobLeads(id) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM realtor_leads WHERE job_id = $1`, [id]);
  return rows[0].n;
}

// Progress for the dashboard (whatever the status is).
async function syncProgress(id, cardsSeen) {
  await query(
    `UPDATE scraping_jobs
     SET cards_seen = GREATEST(cards_seen, $2),
         leads_saved = (SELECT count(*) FROM realtor_leads WHERE job_id = $1)
     WHERE id = $1`,
    [id, cardsSeen],
  );
}

// Returns false if the job is no longer "running" (the user paused it meanwhile).
async function completeJob(id, note) {
  const { rowCount } = await query(
    `UPDATE scraping_jobs SET status = 'completed', finished_at = NOW(), error = $2
     WHERE id = $1 AND status = 'running'`,
    [id, note],
  );
  return rowCount === 1;
}

async function releaseJob(id, { status, attempts, error }) {
  const { rowCount } = await query(
    `UPDATE scraping_jobs
     SET status = $2::"JobStatus",
         attempts = $3,
         error = $4,
         finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END
     WHERE id = $1 AND status = 'running'`,
    [id, status, attempts, error],
  );
  return rowCount === 1;
}

// The worker saw the user's Pause: record where it stopped. A pause is not a
// failed attempt, so the attempt counted at claim time is given back.
async function acknowledgePause(id, note) {
  await query(
    `UPDATE scraping_jobs
     SET attempts = GREATEST(attempts - 1, 0), error = $2
     WHERE id = $1 AND status = 'paused'`,
    [id, note],
  );
}

/* ------------------------------- leads ------------------------------- */

// place_key → job_id (null if the owning job was deleted) for keys already stored.
async function knownPlaces(keys) {
  if (!keys.length) return new Map();
  const { rows } = await query(
    `SELECT place_key, job_id FROM realtor_leads WHERE place_key = ANY($1::text[])`,
    [keys],
  );
  return new Map(rows.map((r) => [r.place_key, r.job_id]));
}

const LEAD_COLUMNS = [
  'business_name', 'category', 'google_category', 'phone', 'rating', 'reviews_count',
  'has_website', 'website_url', 'social_url', 'address', 'latitude', 'longitude',
  'place_key', 'maps_url', 'search_location', 'job_id',
];
const UPDATE_COLUMNS = LEAD_COLUMNS.filter((c) => c !== 'place_key');

const PLACEHOLDERS = LEAD_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
const INSERT_SQL = `INSERT INTO realtor_leads (${LEAD_COLUMNS.join(', ')}) VALUES (${PLACEHOLDERS})`;

// Normal jobs: insert, or do nothing if the place (or phone) is already stored.
// refresh=true ("extract fresh data anyway"): update the stored place with the
// fresh values and move it to this job.
// Returns 'inserted' | 'refreshed' | 'duplicate'.
async function saveLead(lead, { refresh = false } = {}) {
  const values = LEAD_COLUMNS.map((column) => lead[column]);

  if (!refresh) {
    const { rowCount } = await query(`${INSERT_SQL} ON CONFLICT DO NOTHING`, values);
    return rowCount === 1 ? 'inserted' : 'duplicate';
  }

  try {
    const { rows } = await query(
      `${INSERT_SQL}
       ON CONFLICT (place_key) DO UPDATE SET
         ${UPDATE_COLUMNS.map((c) => `${c} = EXCLUDED.${c}`).join(',\n         ')}
       RETURNING (xmax = 0) AS inserted`,
      values,
    );
    return rows[0].inserted ? 'inserted' : 'refreshed';
  } catch (error) {
    // The fresh phone number already belongs to a different place.
    if (error.code === '23505') return 'duplicate';
    throw error;
  }
}

const close = () => pool.end();

module.exports = {
  query,
  reclaimStaleJobs,
  claimJob,
  heartbeat,
  countJobLeads,
  syncProgress,
  completeJob,
  releaseJob,
  acknowledgePause,
  knownPlaces,
  saveLead,
  close,
};
