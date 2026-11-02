'use strict';

const envInt = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

const envList = (name) =>
  String(process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// What qualifies as a lead. Rating / review RANGES are filtered in the
// dashboard (database level), so they are off here: every valid lead is stored.
const CONFIG = {
  categories: [
    { name: 'Plot Dealer', nameKeywords: ['plot', 'layout', 'site'], googleCategory: [] },
    { name: 'Land Broker', nameKeywords: ['land'], googleCategory: ['land agent', 'land broker'] },
    { name: 'Property Broker', nameKeywords: ['broker', 'brokerage'], googleCategory: ['property broker', 'broker'] },
    { name: 'Property Advisor', nameKeywords: ['advisor', 'adviser', 'advisory'], googleCategory: [] },
    { name: 'Real Estate Consultant', nameKeywords: ['consultant', 'consultancy', 'consulting'], googleCategory: ['real estate consultant'] },
    { name: 'Property Dealer', nameKeywords: ['dealer'], googleCategory: ['property dealer'] },
    { name: 'Commercial Real Estate Agency', nameKeywords: ['commercial'], googleCategory: ['commercial real estate'] },
    { name: 'Residential Property Dealer', nameKeywords: ['residential', 'flat', 'rental'], googleCategory: [] },
    { name: 'Real Estate Office', nameKeywords: ['real estate office'], googleCategory: [] },
    { name: 'Real Estate Agent', nameKeywords: ['realtor', 'agent'], googleCategory: ['real estate agent', 'estate agent', 'realtor'] },
    { name: 'Real Estate Agency', nameKeywords: [], googleCategory: ['real estate agency', 'real estate'] },
  ],

  excludeCategoryKeywords: [
    'developer', 'builder', 'construction', 'apartment complex', 'housing society',
    'condominium', 'hotel', 'hostel', 'coworking', 'interior', 'loan', 'bank',
  ],

  excludeNameKeywords: [
    'developer', 'construction', 'builder', 'infrastructure', 'township', 'tower',
    'residency', 'enclave', 'heights', 'apartment', 'workspace', 'coworking', 'cowork',
    'loan', 'finance', 'holiday', 'hotel', 'hostel', 'pg', 'interior',
  ],

  treatSocialLinksAsWebsite: false,

  // null = no scrape-time range filter (store everything, filter in the dashboard)
  minRating: null,
  maxRating: null,
  minReviews: null,
  maxReviews: null,
  missingRatingPolicy: 'EXCLUDE', // only applies when minRating/maxRating is set
  missingReviewPolicy: 'EXCLUDE', // only applies when minReviews/maxReviews is set

  requirePhone: true,
  excludeClosedBusinesses: true,

  // Free-text job locations can't carry a structured state, so the address check
  // comes from env: ADDRESS_MUST_CONTAIN="Karnataka,Karnātaka". Empty = off.
  addressMustContainAny: envList('ADDRESS_MUST_CONTAIN'),

  phone: { countryCode: '91', localLength: 10 },

  socialDomains: [
    'facebook.com', 'fb.com', 'instagram.com', 'linktr.ee', 'wa.me',
    'whatsapp.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
    'linkedin.com', 'justdial.com', 'sulekha.com', 'indiamart.com',
    'magicbricks.com', '99acres.com', 'housing.com', 'nobroker.in',
    'google.com', 'goo.gl', 'g.page', 'bit.ly', 'business.site',
  ],

  language: 'en',
};

const SPEED = {
  // Safety cap on result cards per search. Google Maps itself ends most lists
  // at roughly 120 places, so in practice "unlimited" stops at its end-of-list.
  maxFeedCards: envInt('MAX_FEED_CARDS', 500),
  // How long one scroll step waits for new cards before counting a stall.
  feedGrowthTimeoutMs: envInt('FEED_GROWTH_TIMEOUT_MS', 8000),
  // Consecutive stalls (no new cards, no end marker) before giving up on the feed.
  maxFeedStalls: envInt('MAX_FEED_STALLS', 4),
  scrollPauseMs: [800, 1600],
  placePauseMs: [1500, 3000],
  navigationTimeoutMs: 45000,
  placeAttempts: 2,
  retryAttempts: 3,
  maxPageRecoveries: 3,
};

const RUNTIME = {
  // The task spec is "one job per run"; raise this if your Actions minutes allow.
  maxJobsPerRun: envInt('MAX_JOBS_PER_RUN', 1),
  // Stop claiming / scraping after this many minutes (keep below the workflow timeout).
  runBudgetMinutes: envInt('RUN_BUDGET_MINUTES', 150),
  // A job "running" longer than this belonged to a worker that was killed.
  staleJobMinutes: envInt('STALE_JOB_MINUTES', 200),
  maxJobAttempts: envInt('MAX_JOB_ATTEMPTS', 3),
  // Re-read the job row (pause button, waiting priority jobs) after this many
  // places have been read, or after heartbeatMaxSeconds, whichever comes first.
  heartbeatEvery: envInt('HEARTBEAT_EVERY', 20),
  heartbeatMaxSeconds: envInt('HEARTBEAT_MAX_SECONDS', 90),
  headless: process.env.HEADLESS !== 'false',
};

module.exports = { CONFIG, SPEED, RUNTIME };
