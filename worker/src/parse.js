'use strict';

// Pure helpers: no browser, no database. Ported from the local scraper.

const { CONFIG } = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function randomBetween([min, max]) {
  return Math.floor(min + Math.random() * (max - min));
}

function normalizeWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Whole-word (phrase) match, tolerant of simple plurals: "broker" matches "Brokers".
function keywordMatches(text, keyword) {
  const words = normalizeWords(text).split(' ').filter(Boolean);
  const target = normalizeWords(keyword).split(' ').filter(Boolean);
  if (!target.length) return false;

  for (let i = 0; i <= words.length - target.length; i++) {
    const chunk = words.slice(i, i + target.length);
    if (chunk.every((word, idx) => word === target[idx] || word === `${target[idx]}s` || word === `${target[idx]}es`)) {
      return true;
    }
  }
  return false;
}

const nameExcluded = (name) => CONFIG.excludeNameKeywords.some((k) => keywordMatches(name, k));

const categoryExcluded = (googleCategory) =>
  CONFIG.excludeCategoryKeywords.some((k) => keywordMatches(String(googleCategory || ''), k));

function mapCategory(googleCategory, name) {
  for (const rule of CONFIG.categories) {
    if (rule.nameKeywords.some((k) => keywordMatches(name, k))) return rule.name;
  }
  for (const rule of CONFIG.categories) {
    if (rule.googleCategory.some((k) => keywordMatches(googleCategory, k))) return rule.name;
  }
  return '';
}

function addressCheck(address) {
  if (!CONFIG.addressMustContainAny.length) return '';
  if (!address) return 'address_missing';
  const text = normalizeWords(address);
  return CONFIG.addressMustContainAny.some((word) => text.includes(normalizeWords(word)))
    ? ''
    : 'address_outside_region';
}

function rangeFilter(value, min, max, policy, label) {
  if (min === null && max === null) return { pass: true };
  if (value === null || value === undefined) {
    return policy === 'EXCLUDE' ? { pass: false, reason: `${label}_missing` } : { pass: true };
  }
  if (min !== null && value < min) return { pass: false, reason: `${label}_below_min` };
  if (max !== null && value > max) return { pass: false, reason: `${label}_above_max` };
  return { pass: true };
}

function cardOutOfRange(value, min, max) {
  if (value === null || value === undefined) return false;
  return (min !== null && value < min) || (max !== null && value > max);
}

function parseRating(text) {
  if (text === null || text === undefined) return null;
  const m = String(text).match(/(\d(?:[.,]\d)?)/);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  return value >= 0 && value <= 5 ? value : null;
}

function parseCount(text) {
  if (text === null || text === undefined) return null;
  const m = String(text).match(/(\d[\d,.]*)\s*([KkMm])?/);
  if (!m) return null;
  let value = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  if (m[2]) value *= /k/i.test(m[2]) ? 1000 : 1000000;
  return Math.round(value);
}

// Rating / review count from a search-result card (before opening the place).
function parseCard(card) {
  let rating = null;
  let reviews = null;

  if (card.starLabel) {
    const r = card.starLabel.match(/(\d(?:[.,]\d)?)\s*star/i);
    if (r) rating = parseRating(r[1]);
    const v = card.starLabel.match(/(\d[\d,.]*\s*[KkMm]?)\s*review/i);
    if (v) reviews = parseCount(v[1]);
  }

  if (rating === null || reviews === null) {
    const m = String(card.text || '').match(/(\d(?:[.,]\d)?)\s*\(\s*(\d[\d,.]*\s*[KkMm]?)\s*\)/);
    if (m) {
      if (rating === null) rating = parseRating(m[1]);
      if (reviews === null) reviews = parseCount(m[2]);
    }
  }

  return { rating, reviews };
}

// Returns the bare local number ("9876543210") or "" if it isn't a valid format.
function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  const cc = String(CONFIG.phone.countryCode);
  const len = CONFIG.phone.localLength;

  if (digits.startsWith(`00${cc}`) && digits.length === len + cc.length + 2) digits = digits.slice(cc.length + 2);
  else if (digits.startsWith(cc) && digits.length === len + cc.length) digits = digits.slice(cc.length);

  if (digits.length === len + 1 && digits.startsWith('0')) digits = digits.slice(1);

  return digits.length === len ? digits : '';
}

function urlHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isSocialUrl(url) {
  const host = urlHost(url);
  return !!host && CONFIG.socialDomains.some((d) => host === d || host.endsWith(`.${d}`));
}

function cleanGoogleRedirect(href) {
  try {
    const u = new URL(href);
    if (/(^|\.)google\./.test(u.hostname) && u.pathname === '/url') {
      return u.searchParams.get('q') || u.searchParams.get('url') || href;
    }
  } catch { }
  return href;
}

// Splits the listing's link into a real website vs a social/directory page.
function websiteInfo(rawUrl) {
  const url = rawUrl ? cleanGoogleRedirect(rawUrl) : '';
  let valid = '';

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') valid = parsed.toString();
    } catch { }
  }

  const social = !!valid && isSocialUrl(valid);
  return {
    website: valid && (!social || CONFIG.treatSocialLinksAsWebsite) ? valid : '',
    socialSource: social ? valid : '',
  };
}

function placeKeyFromUrl(url) {
  let s = String(url || '');
  try { s = decodeURIComponent(s); } catch { }

  let m = s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m) return m[1].toLowerCase();

  m = s.match(/!19s(ChIJ[^!?&/]+)/);
  if (m) return m[1];

  m = s.match(/\/maps\/place\/([^/?]+)/);
  if (m) return `name:${m[1].toLowerCase()}`;

  return '';
}

function coordsFromUrl(url) {
  const s = String(url || '');
  let m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]) };
  m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) return { lat: Number(m[1]), lon: Number(m[2]) };
  return { lat: null, lon: null };
}

const hasCoords = (c) => !!c && typeof c.lat === 'number' && typeof c.lon === 'number';

function withLanguage(url) {
  try {
    const u = new URL(url);
    u.searchParams.set('hl', CONFIG.language);
    return u.toString();
  } catch {
    return url;
  }
}

// Thrown when Google shows a CAPTCHA / "unusual traffic" / undismissable consent
// page. There is no human on a cloud runner, so the job is handed back to the queue.
class GoogleBlockedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GoogleBlockedError';
    this.kind = 'BLOCKED';
  }
}

const PAGE_DEAD_PATTERN = /detached frame|target closed|session closed|page has been closed|no target with given id/i;
const BROWSER_GONE_PATTERN = /connection closed|browser has disconnected|websocket is not open/i;

function classifyBrowserError(error) {
  if (error && error.kind) return error.kind;
  const text = String((error && error.message) || error || '');
  if (BROWSER_GONE_PATTERN.test(text)) return 'BROWSER_DISCONNECTED';
  if (PAGE_DEAD_PATTERN.test(text)) return 'PAGE_DEAD';
  if (/timeout|timed out/i.test(text)) return 'TIMEOUT';
  if (/HTTP \d{3}/.test(text)) return 'HTTP';
  if (/net::|socket|ECONN|ENOTFOUND|EAI_AGAIN/i.test(text)) return 'NETWORK';
  return 'OTHER';
}

const isFatalForPage = (kind) => kind === 'PAGE_DEAD' || kind === 'BROWSER_DISCONNECTED' || kind === 'BLOCKED';

module.exports = {
  sleep,
  randomBetween,
  normalizeWords,
  keywordMatches,
  nameExcluded,
  categoryExcluded,
  mapCategory,
  addressCheck,
  rangeFilter,
  cardOutOfRange,
  parseRating,
  parseCount,
  parseCard,
  normalizePhone,
  websiteInfo,
  placeKeyFromUrl,
  coordsFromUrl,
  hasCoords,
  withLanguage,
  GoogleBlockedError,
  classifyBrowserError,
  isFatalForPage,
};
