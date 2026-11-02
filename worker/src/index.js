'use strict';

// Worker entry point (GitHub Actions: cron every 3h + instant dispatch for priority jobs):
//   1. hand back jobs left "running" by a killed run
//   2. claim the next job: priority jobs first, then oldest (FOR UPDATE SKIP LOCKED)
//   3. stream the Google Maps result feed, scrolling only as far as needed
//   4. skip places this job already saved (resume), open the rest, save leads
//   5. heartbeat every N places: honour Pause, yield to waiting priority jobs
//   6. finish: completed (end of list / target reached), paused, or back to pending

const { CONFIG, SPEED, RUNTIME } = require('./config');
const P = require('./parse');
const maps = require('./maps');
const db = require('./db');

const log = (...args) => console.log(new Date().toISOString(), ...args);

let stopRequested = false;
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (stopRequested) process.exit(130);
    stopRequested = true;
    log(`⏸️  ${signal} received — finishing the current place, then handing the job back.`);
  });
}

const runDeadline = Date.now() + RUNTIME.runBudgetMinutes * 60_000;
const outOfTime = () => stopRequested || Date.now() >= runDeadline;

/* ----------------------------- job queue ----------------------------- */

async function reclaimStaleJobs() {
  const { failed, requeued } = await db.reclaimStaleJobs(RUNTIME.staleJobMinutes, RUNTIME.maxJobAttempts);
  if (failed || requeued) log(`♻️  Stale jobs: ${requeued} requeued, ${failed} marked failed`);
}

// Back to "pending", or "failed" once the attempt limit is used up.
// countAttempt=false for interruptions that are not the job's fault.
async function releaseJob(job, message, { countAttempt = true } = {}) {
  const attempts = countAttempt ? job.attempts : Math.max(0, job.attempts - 1);
  const status = countAttempt && attempts >= RUNTIME.maxJobAttempts ? 'failed' : 'pending';
  const error = (status === 'failed' ? `Gave up after ${attempts} attempts: ${message}` : message).slice(0, 1000);

  const updated = await db.releaseJob(job.id, { status, attempts, error });
  return updated ? status : 'unchanged (job was paused)';
}

/* ------------------------------ browser ------------------------------ */

async function openBrowser(ctx) {
  ctx.browser = await maps.launchBrowser();
  ctx.listPage = await maps.newPage(ctx.browser);
  ctx.detailPage = await maps.newPage(ctx.browser);
  ctx.recoveries = 0;
  log(`🌐 Chrome started: ${await ctx.browser.version()}`);
}

async function closeBrowser(ctx) {
  if (!ctx.browser) return;
  try {
    await ctx.browser.close();
  } catch { }
  ctx.browser = ctx.listPage = ctx.detailPage = null;
}

async function recoverDetailPage(ctx) {
  if (ctx.recoveries >= SPEED.maxPageRecoveries) {
    const error = new Error(`Detail tab died ${ctx.recoveries} times; restarting the browser`);
    error.kind = 'PAGE_RECOVERY_LIMIT';
    throw error;
  }
  ctx.recoveries++;
  ctx.detailPage = await maps.replacePage(ctx.browser, ctx.detailPage);
  log('  🔁 Detail tab was detached — opened a fresh one');
}

/* ------------------------------ scraping ----------------------------- */

// Applies every quality rule to one opened place. Returns the DB row or null.
function buildLead(raw, card, cardNums, cardKey, job, reject) {
  const name = raw.name || card.name;

  if (P.nameExcluded(name)) return reject('name_excluded');
  if (CONFIG.excludeClosedBusinesses && raw.operatingStatus !== 'open_or_unknown') return reject('business_closed');
  if (P.categoryExcluded(raw.category)) return reject('category_excluded');

  const category = P.mapCategory(raw.category, name);
  if (!category) return reject('category_not_mapped');

  const addressProblem = P.addressCheck(raw.address);
  if (addressProblem) return reject(addressProblem);

  let rating = P.parseRating(raw.ratingText);
  let reviews = P.parseCount(raw.reviewsText);
  if (rating === null) rating = cardNums.rating;
  if (reviews === null) reviews = cardNums.reviews;

  const ratingCheck = P.rangeFilter(rating, CONFIG.minRating, CONFIG.maxRating, CONFIG.missingRatingPolicy, 'rating');
  if (!ratingCheck.pass) return reject(ratingCheck.reason);
  const reviewCheck = P.rangeFilter(reviews, CONFIG.minReviews, CONFIG.maxReviews, CONFIG.missingReviewPolicy, 'reviews');
  if (!reviewCheck.pass) return reject(reviewCheck.reason);

  const phone = P.normalizePhone(raw.phoneRaw) || P.normalizePhone(raw.phoneShown);
  if (CONFIG.requirePhone && !phone) return reject('phone_missing_or_invalid');

  const web = P.websiteInfo(raw.website);
  const coords = P.coordsFromUrl(raw.finalUrl);

  return {
    business_name: name,
    category,
    google_category: raw.category || null,
    phone: phone ? `+${CONFIG.phone.countryCode}${phone}` : null,
    rating,
    reviews_count: reviews ?? 0,
    has_website: Boolean(web.website),
    website_url: web.website || null,
    social_url: web.socialSource || null,
    address: raw.address || null,
    latitude: P.hasCoords(coords) ? coords.lat : null,
    longitude: P.hasCoords(coords) ? coords.lon : null,
    place_key: P.placeKeyFromUrl(raw.finalUrl) || cardKey,
    maps_url: raw.finalUrl,
    search_location: job.location,
    job_id: job.id,
  };
}

// Outcomes:
//   exhausted       – reached the end of the Maps list
//   target_reached  – job.target_leads leads are saved for this job
//   paused          – the user pressed Pause (seen at a heartbeat)
//   stopped         – the job row is no longer "running" for another reason
//   yield           – a priority job is waiting and this job is not priority
//   interrupted     – run time budget / stop signal
async function runJob(ctx, job) {
  const queryText = `${job.category} in ${job.location}`;
  const target = job.target_leads; // null = unlimited
  const stats = {
    cardsSeen: 0,
    placesOpened: 0,
    placesExtracted: 0,
    placesFailed: 0,
    saved: 0,
    refreshed: 0,
    resumedSkip: 0,
    alreadyInDb: 0,
    rejected: {},
  };
  const reject = (reason) => {
    stats.rejected[reason] = (stats.rejected[reason] || 0) + 1;
    return null;
  };
  let jobLeads = await db.countJobLeads(job.id);
  const done = (outcome) => ({ stats, outcome, jobLeads });

  log(
    `🔎 Job #${job.id}${job.is_priority ? ' ⚡PRIORITY' : ''} (attempt ${job.attempts}/${RUNTIME.maxJobAttempts}): ` +
    `"${queryText}" | target: ${target ?? 'unlimited'}${job.refresh_existing ? ' | refresh existing' : ''}`,
  );
  if (jobLeads) log(`↪️  Resuming: ${jobLeads} lead(s) already saved for this job — fast-forwarding past them.`);
  if (target && jobLeads >= target) return done('target_reached');

  let sinceHeartbeat = 0;
  let lastHeartbeat = Date.now();
  const seenKeys = new Set();

  // Re-reads the job row. Returns an outcome to stop with, or null to continue.
  const checkHeartbeat = async () => {
    sinceHeartbeat = 0;
    lastHeartbeat = Date.now();
    const hb = await db.heartbeat(job.id);
    jobLeads = hb.leads; // authoritative count (self-corrects any local drift)
    await db.syncProgress(job.id, stats.cardsSeen);
    log(`  💓 heartbeat: status=${hb.status} leads=${hb.leads}${target ? `/${target}` : ''} priorityWaiting=${hb.priority_waiting}`);

    if (hb.status === 'paused') return 'paused';
    if (hb.status !== 'running') return 'stopped';
    if (!job.is_priority && hb.priority_waiting) return 'yield';
    if (target && jobLeads >= target) return 'target_reached';
    return null;
  };

  const feed = maps.streamFeed(ctx.listPage, queryText, { log });

  for await (const batch of feed) {
    stats.cardsSeen = batch.total;
    log(`📋 +${batch.cards.length} results (feed total ${batch.total}${batch.end ? ', end of list' : ''})`);

    const keyed = [];
    for (const card of batch.cards) {
      const key = P.placeKeyFromUrl(card.href);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        keyed.push({ card, key });
      }
    }
    const known = await db.knownPlaces(keyed.map((k) => k.key));

    for (const { card, key } of keyed) {
      if (outOfTime()) return done('interrupted');

      if (sinceHeartbeat >= RUNTIME.heartbeatEvery || Date.now() - lastHeartbeat >= RUNTIME.heartbeatMaxSeconds * 1000) {
        const stop = await checkHeartbeat();
        if (stop) return done(stop);
      }

      // Resume / dedupe: never re-open what is already stored, except to refresh
      // other jobs' leads when this job was created as "extract fresh data".
      if (known.has(key)) {
        if (known.get(key) === job.id) {
          stats.resumedSkip++;
          continue;
        }
        if (!job.refresh_existing) {
          stats.alreadyInDb++;
          continue;
        }
      }

      if (card.name && P.nameExcluded(card.name)) {
        reject('name_excluded');
        continue;
      }

      const cardNums = P.parseCard(card);
      if (P.cardOutOfRange(cardNums.rating, CONFIG.minRating, CONFIG.maxRating)) {
        reject('rating_out_of_range');
        continue;
      }
      if (P.cardOutOfRange(cardNums.reviews, CONFIG.minReviews, CONFIG.maxReviews)) {
        reject('reviews_out_of_range');
        continue;
      }

      let raw;
      stats.placesOpened++;
      try {
        raw = await maps.openPlace(ctx.detailPage, card.href);
        stats.placesExtracted++;
        sinceHeartbeat++;
      } catch (error) {
        const kind = P.classifyBrowserError(error);
        if (kind === 'BLOCKED' || kind === 'BROWSER_DISCONNECTED') throw error;

        stats.placesFailed++;
        log(`  ⚠️  ${card.name || key} could not be read [${kind}]: ${error.message}`);
        if (kind === 'PAGE_DEAD' || maps.isPageDead(ctx.detailPage)) await recoverDetailPage(ctx);
        continue;
      }

      const lead = buildLead(raw, card, cardNums, key, job, reject);
      if (lead) {
        const result = await db.saveLead(lead, { refresh: job.refresh_existing });

        if (result === 'duplicate') {
          reject('duplicate_phone_or_place');
        } else {
          if (result === 'inserted') stats.saved++;
          else stats.refreshed++;
          jobLeads++;
          log(
            `  ${result === 'inserted' ? '✅' : '🔄'} ${jobLeads}${target ? `/${target}` : ''} ` +
            `${lead.business_name} | ${lead.category} | ${lead.phone || 'no phone'} | ` +
            `${lead.rating ?? '-'}★ (${lead.reviews_count}) | ${lead.has_website ? 'website' : 'no website'}`,
          );
          if (target && jobLeads >= target) return done('target_reached');
        }
      }

      await P.sleep(P.randomBetween(SPEED.placePauseMs));
    }
  }

  return done('exhausted');
}

function logStats(job, stats, outcome) {
  const rejected = Object.entries(stats.rejected)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${reason}=${n}`)
    .join(', ');

  log(
    `📊 Job #${job.id} [${outcome}]: results=${stats.cardsSeen} opened=${stats.placesOpened} ` +
    `read=${stats.placesExtracted} failed=${stats.placesFailed} new=${stats.saved} refreshed=${stats.refreshed} ` +
    `resumeSkipped=${stats.resumedSkip} otherJobs=${stats.alreadyInDb}${rejected ? ` | rejected: ${rejected}` : ''}`,
  );
}

/* -------------------------------- main ------------------------------- */

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set.');
    process.exitCode = 1;
    return;
  }

  await reclaimStaleJobs();

  const ctx = { browser: null, listPage: null, detailPage: null, recoveries: 0 };
  let processed = 0;
  let exitCode = 0;

  try {
    while (processed < RUNTIME.maxJobsPerRun && !outOfTime()) {
      const job = await db.claimJob();
      if (!job) {
        log(processed ? '✔️  Queue is empty.' : '💤 No pending jobs.');
        break;
      }
      processed++;

      try {
        if (!ctx.browser) await openBrowser(ctx);

        const { stats, outcome, jobLeads } = await runJob(ctx, job);
        logStats(job, stats, outcome);
        await db.syncProgress(job.id, stats.cardsSeen);

        if (outcome === 'paused') {
          await db.acknowledgePause(job.id, `Paused by user with ${jobLeads} lead(s) saved; Play resumes where it stopped`);
          log(`⏸️  Job #${job.id} paused from the dashboard. Progress saved — exiting.`);
          break;
        }

        if (outcome === 'stopped') {
          log(`⏹️  Job #${job.id} is no longer running (changed outside the worker). Exiting.`);
          break;
        }

        if (outcome === 'interrupted') {
          const why = stopRequested ? 'stop signal' : 'run time budget';
          await releaseJob(job, `Paused by ${why} with ${jobLeads} lead(s) saved; resumes automatically next run`, {
            countAttempt: false,
          });
          log(`⏸️  Job #${job.id} handed back to the queue (${why}).`);
          break;
        }

        if (outcome === 'yield') {
          await releaseJob(job, `Yielded to a priority job with ${jobLeads} lead(s) saved; resumes automatically`, {
            countAttempt: false,
          });
          log(`⚡ Job #${job.id} yielded to a priority job.`);
          processed--; // the priority job runs in this slot
          continue;
        }

        // Opening several places and reading none = Google served a block / limited view.
        if (stats.placesOpened >= 3 && stats.placesExtracted === 0) {
          throw new P.GoogleBlockedError(`Opened ${stats.placesOpened} places, could read none`);
        }

        const failRatio = stats.placesOpened ? stats.placesFailed / stats.placesOpened : 0;
        if (outcome === 'exhausted' && failRatio > 0.2 && job.attempts < RUNTIME.maxJobAttempts) {
          await releaseJob(job, `${stats.placesFailed}/${stats.placesOpened} places could not be read; retrying`);
          log(`↩️  Job #${job.id} requeued: too many unreadable places.`);
          continue;
        }

        const note = [
          outcome === 'target_reached' ? `Target of ${job.target_leads} leads reached` : null,
          stats.placesFailed ? `${stats.placesFailed} of ${stats.placesOpened} places could not be read` : null,
        ]
          .filter(Boolean)
          .join('; ');

        if (await db.completeJob(job.id, note || null)) {
          log(`🏁 Job #${job.id} completed (${outcome}): ${jobLeads} lead(s) for this job, ${stats.saved} new this run.`);
        } else {
          log(`⏸️  Job #${job.id} finished its work but was paused meanwhile; left as paused.`);
        }
      } catch (error) {
        const kind = P.classifyBrowserError(error);
        // A CAPTCHA says nothing about the job itself, so it does not use up an attempt.
        const outcome = await releaseJob(job, `[${kind}] ${error.message}`, { countAttempt: kind !== 'BLOCKED' });
        log(`❌ Job #${job.id} [${kind}] ${error.message} → ${outcome}`);
        exitCode = 1;

        if (kind === 'BLOCKED') {
          log('🛑 Google is blocking this runner. Stopping; the next run gets a new IP.');
          break;
        }
        await closeBrowser(ctx); // browser state is suspect; next job gets a fresh one
      }
    }
  } finally {
    await closeBrowser(ctx);
  }

  process.exitCode = exitCode;
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`❌ FATAL: ${error.stack || error.message}`);
      process.exitCode = 1;
    })
    .finally(() => db.close().catch(() => { }));
}

module.exports = { buildLead, runJob, main };
