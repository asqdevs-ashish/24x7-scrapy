'use strict';

// Job-queue tests against a real Postgres: priority claiming, target limits,
// heartbeat pause, resume fast-forward, priority yield, fresh re-runs.
// The browser is stubbed; the SQL is real.
//
//   TEST_DATABASE_URL=postgresql://...@localhost:5432/leads_test npm test
//
// The database must have the migrations applied (cd web && npx prisma migrate deploy).
// Every test TRUNCATEs both tables, so only localhost URLs are accepted.

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');

const TEST_URL = process.env.TEST_DATABASE_URL;
const isLocal = !!TEST_URL && /@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(TEST_URL);

if (isLocal) process.env.DATABASE_URL = TEST_URL;
process.env.ADDRESS_MUST_CONTAIN = '';

const { SPEED, RUNTIME } = require('../src/config');
const maps = require('../src/maps');
const db = require('../src/db');
const { runJob } = require('../src/index');

SPEED.placePauseMs = [0, 1];
RUNTIME.heartbeatEvery = 5;
RUNTIME.heartbeatMaxSeconds = 3600;

const skip = isLocal ? false : 'set TEST_DATABASE_URL to a localhost Postgres with the migrations applied';
// Same pool as the worker (one connection at a time is enough, and works with
// single-connection test servers such as PGlite).
const sql = db;

const href = (i) => `https://www.google.com/maps/place/Agency+${i}/data=!4m7!3m6!1s0x3bae:0x${i.toString(16)}!8m2!3d12.9!4d77.6`;
const card = (i) => ({ href: href(i), name: `Agency ${i}`, starLabel: '4.5 stars 30 Reviews', text: '' });

// Fake Maps: `count` places, delivered in feed batches of 20.
function fakeMaps(count, { rating = '4.5', onOpen = () => { } } = {}) {
  const opened = [];
  maps.streamFeed = async function* () {
    for (let start = 0; start < count; start += 20) {
      const end = Math.min(count, start + 20);
      yield { cards: Array.from({ length: end - start }, (_, k) => card(start + k)), total: end, end: end === count };
    }
  };
  maps.openPlace = async (_page, url) => {
    const i = parseInt(url.match(/0x3bae:0x([0-9a-f]+)/)[1], 16);
    opened.push(i);
    await onOpen(opened.length, i);
    return {
      name: `Agency ${i}`,
      ratingText: rating,
      reviewsText: '30 reviews',
      category: 'Real estate agency',
      address: `${i}, MG Road, Bengaluru, Karnataka`,
      website: i % 2 ? `https://agency${i}.example.in/` : '',
      phoneRaw: `+9198${String(i).padStart(8, '0')}`,
      phoneShown: '',
      operatingStatus: 'open_or_unknown',
      finalUrl: url,
    };
  };
  maps.isPageDead = () => false;
  return opened;
}

const ctx = { browser: null, listPage: {}, detailPage: {}, recoveries: 0 };

async function addJob(fields = {}) {
  const f = { location: 'Koramangala', category: 'real estate agency', status: 'pending', minutesAgo: 0, ...fields };
  const { rows } = await sql.query(
    `INSERT INTO scraping_jobs (location, category, status, is_priority, target_leads, refresh_existing, created_at)
     VALUES ($1, $2, $3::"JobStatus", $4, $5, $6, NOW() - make_interval(mins => $7))
     RETURNING id`,
    [f.location, f.category, f.status, !!f.is_priority, f.target_leads ?? null, !!f.refresh_existing, f.minutesAgo],
  );
  return rows[0].id;
}

// Claims a specific job the way the worker would, returning the claimed row.
async function claim(id) {
  await sql.query(`UPDATE scraping_jobs SET status = 'pending' WHERE id = $1`, [id]);
  const job = await db.claimJob();
  assert.equal(job.id, id);
  return job;
}

const jobStatus = async (id) => (await sql.query(`SELECT status::text, attempts FROM scraping_jobs WHERE id = $1`, [id])).rows[0];
const leadsOf = async (id) => (await sql.query(`SELECT count(*)::int AS n FROM realtor_leads WHERE job_id = $1`, [id])).rows[0].n;

beforeEach(async () => {
  if (!skip) await sql.query('TRUNCATE realtor_leads, scraping_jobs RESTART IDENTITY CASCADE');
});
after(async () => {
  await db.close();
});

test('claims priority jobs first, then the oldest; never a paused job', { skip }, async () => {
  const oldNormal = await addJob({ location: 'A', minutesAgo: 180 });
  await addJob({ location: 'P', status: 'paused', minutesAgo: 300 });
  const vip1 = await addJob({ location: 'B', is_priority: true, minutesAgo: 60 });
  const vip2 = await addJob({ location: 'C', is_priority: true, minutesAgo: 1 });

  assert.deepEqual(
    [(await db.claimJob()).id, (await db.claimJob()).id, (await db.claimJob()).id, await db.claimJob()],
    [vip1, vip2, oldNormal, null],
  );
  assert.deepEqual(await jobStatus(vip1), { status: 'running', attempts: 1 });
});

test('custom target: stops after exactly target_leads leads', { skip }, async () => {
  const id = await addJob({ target_leads: 7 });
  const opened = fakeMaps(40);
  const job = await db.claimJob();

  const { outcome, jobLeads } = await runJob(ctx, job);
  assert.equal(outcome, 'target_reached');
  assert.equal(jobLeads, 7);
  assert.equal(await leadsOf(id), 7);
  assert.equal(opened.length, 7, 'no place opened beyond the target');
});

test('unlimited: runs to the end of the list', { skip }, async () => {
  const id = await addJob();
  fakeMaps(45);
  const { outcome } = await runJob(ctx, await db.claimJob());
  assert.equal(outcome, 'exhausted');
  assert.equal(await leadsOf(id), 45);
});

test('heartbeat honours Pause; resume fast-forwards without re-opening or duplicating', { skip }, async () => {
  const id = await addJob();
  // The user clicks Pause while the 8th place is being read.
  const opened = fakeMaps(30, {
    onOpen: (n) => n === 8 && sql.query(`UPDATE scraping_jobs SET status = 'paused' WHERE id = $1`, [id]),
  });

  const first = await runJob(ctx, await db.claimJob());
  assert.equal(first.outcome, 'paused');
  assert.equal(first.jobLeads, 10, 'stopped at the next heartbeat (every 5 places)');
  await db.acknowledgePause(id, 'paused');
  assert.deepEqual(await jobStatus(id), { status: 'paused', attempts: 0 });

  // Play → pending → claimed again.
  const reopened = fakeMaps(30);
  const second = await runJob(ctx, await claim(id));
  assert.equal(second.outcome, 'exhausted');
  assert.equal(second.stats.resumedSkip, 10, 'the 10 saved places are skipped');
  assert.deepEqual(reopened, Array.from({ length: 20 }, (_, k) => k + 10), 'only the remaining 20 are opened');
  assert.equal(await leadsOf(id), 30);
  assert.equal(opened.length, 10);
});

test('a normal job yields to a priority job that arrives while it runs', { skip }, async () => {
  const id = await addJob();
  fakeMaps(30, { onOpen: (n) => n === 3 && addJob({ location: 'VIP', is_priority: true }) });

  const { outcome, jobLeads } = await runJob(ctx, await db.claimJob());
  assert.equal(outcome, 'yield');
  assert.equal(jobLeads, 5);
  assert.equal(await leadsOf(id), 5);
  assert.equal((await db.claimJob()).location, 'VIP', 'the waiting priority job is claimed next');
});

test('normal re-run skips other jobs’ leads; "fresh" re-run refreshes and takes them over', { skip }, async () => {
  const first = await addJob();
  fakeMaps(10);
  await runJob(ctx, await db.claimJob());
  await db.completeJob(first, null);

  const normal = await addJob();
  const openedNormal = fakeMaps(15);
  const n = await runJob(ctx, await db.claimJob());
  assert.equal(n.stats.alreadyInDb, 10);
  assert.deepEqual(openedNormal, [10, 11, 12, 13, 14]);
  assert.equal(await leadsOf(normal), 5);

  const fresh = await addJob({ refresh_existing: true });
  const openedFresh = fakeMaps(5, { rating: '3.1' });
  const f = await runJob(ctx, await db.claimJob());
  assert.equal(f.stats.refreshed, 5);
  assert.equal(openedFresh.length, 5);
  assert.equal(await leadsOf(fresh), 5);
  assert.equal(await leadsOf(first), 5, 'refreshed leads moved to the fresh job');
  const { rows } = await sql.query(`SELECT DISTINCT rating FROM realtor_leads WHERE job_id = $1`, [fresh]);
  assert.deepEqual(rows, [{ rating: 3.1 }]);
});

test('worker status updates never overwrite a Pause', { skip }, async () => {
  const id = await addJob();
  await db.claimJob();
  await sql.query(`UPDATE scraping_jobs SET status = 'paused' WHERE id = $1`, [id]);

  assert.equal(await db.completeJob(id, null), false);
  assert.equal(await db.releaseJob(id, { status: 'pending', attempts: 0, error: 'x' }), false);
  assert.equal((await jobStatus(id)).status, 'paused');
});

test('phone already used by another place: refresh reports a duplicate instead of throwing', { skip }, async () => {
  const id = await addJob();
  const base = { business_name: 'X', category: 'Real Estate Agency', google_category: null, rating: 4, reviews_count: 1,
    has_website: false, website_url: null, social_url: null, address: null, latitude: null, longitude: null,
    maps_url: null, search_location: 'K', job_id: id };
  assert.equal(await db.saveLead({ ...base, place_key: 'a', phone: '+911111111111' }), 'inserted');
  assert.equal(await db.saveLead({ ...base, place_key: 'b', phone: '+912222222222' }), 'inserted');
  assert.equal(await db.saveLead({ ...base, place_key: 'b', phone: '+911111111111' }, { refresh: true }), 'duplicate');
  assert.equal(await db.saveLead({ ...base, place_key: 'c', phone: '+911111111111' }), 'duplicate');
});

test('stale running jobs are requeued, or failed after the attempt limit', { skip }, async () => {
  const a = await addJob({ location: 'A' });
  const b = await addJob({ location: 'B' });
  await sql.query(`UPDATE scraping_jobs SET status = 'running', started_at = NOW() - interval '5 hours', attempts = 1 WHERE id = $1`, [a]);
  await sql.query(`UPDATE scraping_jobs SET status = 'running', started_at = NOW() - interval '5 hours', attempts = 3 WHERE id = $1`, [b]);

  assert.deepEqual(await db.reclaimStaleJobs(175, 3), { failed: 1, requeued: 1 });
  assert.equal((await jobStatus(a)).status, 'pending');
  assert.equal((await jobStatus(b)).status, 'failed');
});
