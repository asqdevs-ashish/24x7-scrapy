'use strict';

// Browser layer: headless Chrome on Linux + Google Maps page extraction.

const puppeteer = require('puppeteer');
const { CONFIG, SPEED, RUNTIME } = require('./config');
const {
  sleep,
  randomBetween,
  withLanguage,
  classifyBrowserError,
  isFatalForPage,
  GoogleBlockedError,
} = require('./parse');

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

async function launchBrowser() {
  return puppeteer.launch({
    headless: RUNTIME.headless,
    defaultViewport: { width: 1366, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--lang=en-US',
      '--window-size=1366,900',
      // The list tab sits behind the detail tab. Without these, Chrome treats it
      // as hidden: no scroll events, no frames, so the feed never loads past 20.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Skip image downloads: saves RAM/bandwidth, the data we read is all text.
      '--blink-settings=imagesEnabled=false',
    ],
  });
}

async function newPage(browser) {
  const page = await browser.newPage();
  page.setDefaultTimeout(SPEED.navigationTimeoutMs);
  page.setDefaultNavigationTimeout(SPEED.navigationTimeoutMs);

  // Headless Chrome advertises "HeadlessChrome" in its UA, which Maps serves differently.
  const ua = (await browser.userAgent()).replace(/HeadlessChrome/g, 'Chrome');
  await page.setUserAgent(ua);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  return page;
}

function isPageDead(page) {
  try {
    if (!page || page.isClosed()) return true;
    const frame = page.mainFrame();
    if (typeof frame.detached === 'boolean') return frame.detached;
    if (typeof frame.isDetached === 'function') return frame.isDetached();
    return false;
  } catch {
    return true;
  }
}

async function replacePage(browser, oldPage) {
  try {
    if (oldPage && !oldPage.isClosed()) await oldPage.close();
  } catch { }
  return newPage(browser);
}

async function isCaptcha(page) {
  try {
    if (/\/sorry\//.test(page.url())) return true;
    return await page.evaluate(() => {
      if (document.querySelector('iframe[src*="recaptcha"]')) return true;
      const t = (document.body?.innerText || '').slice(0, 3000);
      return /unusual traffic|not a robot/i.test(t);
    });
  } catch {
    return false;
  }
}

// Consent page → click "Reject all". CAPTCHA → GoogleBlockedError (no human to solve it).
async function handleGoogleInterruptions(page) {
  for (let i = 0; i < 3; i++) {
    if (/consent\.google\./i.test(page.url())) {
      const clicked = await page
        .evaluate(() => {
          const btn = [...document.querySelectorAll('button, input[type="submit"]')].find((b) =>
            /reject all/i.test(b.innerText || b.value || ''),
          );
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        })
        .catch(() => false);

      if (!clicked) throw new GoogleBlockedError('Google consent page without a "Reject all" button');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => { });
      continue;
    }

    if (await isCaptcha(page)) {
      throw new GoogleBlockedError('Google CAPTCHA / "unusual traffic" page — runner IP is flagged');
    }
    return;
  }
  throw new GoogleBlockedError('Google consent page kept coming back');
}

async function gotoWithRetry(page, url, label) {
  let lastError;

  for (let attempt = 1; attempt <= SPEED.retryAttempts; attempt++) {
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: SPEED.navigationTimeoutMs,
      });
      const status = response ? response.status() : 0;

      if (status === 429) await handleGoogleInterruptions(page); // throws if it's a CAPTCHA

      if (RETRY_STATUS.has(status)) {
        const error = new Error(`${label}: HTTP ${status}`);
        error.retryable = true;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      error.kind = classifyBrowserError(error);
      if (isFatalForPage(error.kind)) throw error;

      const retryable = error.retryable || /timeout|net::|navigation|protocol error|socket/i.test(String(error.message));
      if (!retryable || attempt >= SPEED.retryAttempts) break;

      const waitMs = Math.min(30000, 3000 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 800);
      console.log(`  ⏳ ${label} failed (${error.message}); retry in ${Math.ceil(waitMs / 1000)}s`);
      await sleep(waitMs);
    }
  }

  throw lastError || new Error(`${label}: navigation failed`);
}

/* ---------- functions below run INSIDE the page (page.evaluate) ---------- */

function extractCardsInBrowser() {
  const out = [];
  const seen = new Set();

  for (const a of document.querySelectorAll('div[role="feed"] a[href*="/maps/place/"]')) {
    const href = a.href;
    if (!href || seen.has(href)) continue;
    seen.add(href);

    const card = a.closest('div.Nv2PK') || a.parentElement;
    const star = card && card.querySelector('[role="img"][aria-label*="star" i]');

    out.push({
      href,
      name: a.getAttribute('aria-label') || '',
      starLabel: star ? star.getAttribute('aria-label') || '' : '',
      text: card ? (card.innerText || '').slice(0, 500) : '',
    });
  }
  return out;
}

// One scroll step on the results feed. Scrolls the feed (and, if the feed is
// not itself the scrolling element, its scrollable ancestor), then resolves as
// soon as a MutationObserver sees new place cards, the end-of-list marker, or
// the timeout. Runs inside the page.
function scrollFeedInBrowser(prevCount, timeoutMs) {
  return new Promise((resolve) => {
    const feed = document.querySelector('div[role="feed"]');
    if (!feed) {
      resolve({ count: 0, end: true, grew: false, reason: 'no-feed' });
      return;
    }

    const cards = () => feed.querySelectorAll('a[href*="/maps/place/"]');
    const isEnd = () =>
      !!feed.querySelector('span.HlvSq') ||
      /reached the end of the list|no more results/i.test((feed.innerText || '').slice(-800));

    let scroller = feed;
    for (let el = feed; el && el !== document.body; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      if (/(auto|scroll)/.test(overflowY) && el.scrollHeight > el.clientHeight + 4) {
        scroller = el;
        break;
      }
    }

    // Order matters: scrollIntoView aligns the last card, which can sit *above*
    // the bottom of the list; the final scroll must land at the very bottom so
    // the lazy-loader below the last card comes into view.
    const all = cards();
    if (all.length) all[all.length - 1].scrollIntoView({ block: 'end' });
    feed.scrollBy(0, feed.scrollHeight);
    if (scroller !== feed) scroller.scrollTo(0, scroller.scrollHeight);

    let settled = false;
    let observer = null;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (observer) observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    const check = () => {
      const count = cards().length;
      if (count > prevCount) finish({ count, end: isEnd(), grew: true });
      else if (isEnd()) finish({ count, end: true, grew: false });
    };

    observer = new MutationObserver(check);
    observer.observe(feed, { childList: true, subtree: true, characterData: true });
    timer = setTimeout(() => finish({ count: cards().length, end: isEnd(), grew: false }), timeoutMs);
    check();
  });
}

// Used when the feed stalls: scroll up a little and back down, so
// IntersectionObserver-based loaders see the sentinel enter the viewport again.
function nudgeFeedInBrowser() {
  const feed = document.querySelector('div[role="feed"]');
  if (!feed) return;
  let scroller = feed;
  for (let el = feed; el && el !== document.body; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4) {
      scroller = el;
      break;
    }
  }
  scroller.scrollBy(0, -Math.round(scroller.clientHeight * 0.6));
}

function extractPlaceInBrowser() {
  const text = (el) => (el ? (el.innerText || el.textContent || '').trim() : '');
  const main =
    document.querySelector('div[role="main"][aria-label]') ||
    document.querySelector('div[role="main"]') ||
    document.body;

  const name = text(main.querySelector('h1.DUwDvf')) || text(main.querySelector('h1'));

  let ratingText = null;
  let reviewsText = null;

  const f7 = main.querySelector('div.F7nice');
  if (f7) {
    const r = f7.querySelector('span[aria-hidden="true"]');
    if (r) ratingText = text(r);
    const rv = f7.querySelector('[aria-label*="review" i]');
    if (rv) reviewsText = rv.getAttribute('aria-label');
    else {
      const m = text(f7).match(/\(([\d,.]+\s*[KkMm]?)\)/);
      if (m) reviewsText = m[1];
    }
  }

  if (!ratingText) {
    const img = main.querySelector('[role="img"][aria-label*="star" i]');
    if (img) ratingText = img.getAttribute('aria-label');
  }

  if (!reviewsText) {
    const el = [...main.querySelectorAll('[aria-label]')].find((e) =>
      /^\s*\d[\d,.]*\s*[KkMm]?\s+reviews?\s*$/i.test(e.getAttribute('aria-label') || ''),
    );
    if (el) reviewsText = el.getAttribute('aria-label');
  }

  const category = text(main.querySelector('button.DkEaL') || main.querySelector('button[jsaction*="category"]'));

  const addressEl = main.querySelector('button[data-item-id="address"]');
  const address = addressEl
    ? (addressEl.getAttribute('aria-label') || '').replace(/^\s*address:\s*/i, '').trim() || text(addressEl)
    : '';

  const websiteEl = main.querySelector('a[data-item-id="authority"]');
  const website = websiteEl ? websiteEl.href : '';

  const phoneEl = main.querySelector('button[data-item-id^="phone:tel:"]');
  let phoneRaw = '';
  let phoneShown = '';
  if (phoneEl) {
    phoneRaw = (phoneEl.getAttribute('data-item-id') || '').replace(/^phone:tel:/, '');
    phoneShown = (phoneEl.getAttribute('aria-label') || '').replace(/^\s*phone:\s*/i, '').trim() || text(phoneEl);
  }

  const header = text(main).slice(0, 2500);
  let operatingStatus = 'open_or_unknown';
  if (/permanently closed/i.test(header)) operatingStatus = 'permanently_closed';
  else if (/temporarily closed/i.test(header)) operatingStatus = 'temporarily_closed';

  return { name, ratingText, reviewsText, category, address, website, phoneRaw, phoneShown, operatingStatus };
}

/* ------------------------------------------------------------------------ */

// Opens a Maps text search. Returns 'list' (result feed), 'place' (Maps jumped
// straight to a single place) or 'none' (no results).
async function openSearch(page, queryText) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(queryText)}/?hl=${CONFIG.language}`;

  await gotoWithRetry(page, url, 'search');
  await handleGoogleInterruptions(page);

  const detectKind = () =>
    page
      .waitForFunction(
        () => {
          if (document.querySelector('div[role="feed"]')) return 'list';
          if (document.querySelector('h1.DUwDvf')) return 'place';
          const t = (document.body && document.body.innerText) || '';
          if (/can't find|couldn't find|no results found/i.test(t)) return 'none';
          return false;
        },
        { timeout: 25000, polling: 500 },
      )
      .then((handle) => handle.jsonValue())
      .catch(() => 'timeout');

  let kind = await detectKind();
  if (kind === 'timeout') {
    await handleGoogleInterruptions(page);
    kind = await detectKind();
  }
  if (kind === 'timeout') throw new Error('search: results never rendered (timeout)');
  return kind;
}

// Streams the cards of an already-open results feed, newest batch at a time.
// The caller processes each batch (opening places in another tab) and simply
// stops iterating once it has enough leads – so with a target the feed is only
// scrolled as far as needed, and without one it runs to Google's
// "You've reached the end of the list".
//
// Yields { cards, total, end }: cards = not yielded before, total = cards seen.
async function* streamLoadedFeed(page, { maxCards = SPEED.maxFeedCards, log = () => { } } = {}) {
  const yielded = new Set();
  let domCount = 0;
  let stalls = 0;

  while (true) {
    const all = await page.evaluate(extractCardsInBrowser);
    domCount = Math.max(domCount, all.length);
    const fresh = all.filter((c) => !yielded.has(c.href));
    fresh.forEach((c) => yielded.add(c.href));

    // A hidden tab gets no scroll events → Maps' lazy-loader never fires.
    await page.bringToFront();
    const step = await page.evaluate(scrollFeedInBrowser, domCount, SPEED.feedGrowthTimeoutMs);

    if (fresh.length) yield { cards: fresh, total: yielded.size, end: step.end };

    if (step.end) {
      // Collect whatever rendered together with the end marker, then stop.
      const tail = (await page.evaluate(extractCardsInBrowser)).filter((c) => !yielded.has(c.href));
      tail.forEach((c) => yielded.add(c.href));
      if (tail.length) yield { cards: tail, total: yielded.size, end: true };
      log(`  🏁 End of the Maps list after ${yielded.size} results`);
      return;
    }

    if (yielded.size >= maxCards) {
      log(`  ✋ Feed safety cap reached (${maxCards} results)`);
      return;
    }

    if (step.grew) {
      stalls = 0;
      domCount = step.count;
      await sleep(randomBetween(SPEED.scrollPauseMs));
      continue;
    }

    stalls++;
    if (stalls >= SPEED.maxFeedStalls) {
      log(`  ⚠️  Feed stopped growing at ${yielded.size} results (no end-of-list marker after ${stalls} tries)`);
      return;
    }
    log(`  … feed did not grow (try ${stalls}/${SPEED.maxFeedStalls}), nudging`);
    await page.evaluate(nudgeFeedInBrowser);
    await sleep(randomBetween(SPEED.scrollPauseMs));
  }
}

// Search + stream. A search that lands on a single place yields that place.
async function* streamFeed(page, queryText, options = {}) {
  const kind = await openSearch(page, queryText);
  if (kind === 'place') {
    yield { cards: [{ href: page.url(), name: '', starLabel: '', text: '' }], total: 1, end: true };
    return;
  }
  if (kind !== 'list') return;
  yield* streamLoadedFeed(page, options);
}

// Opens a place detail page and returns the raw fields.
async function openPlace(page, url) {
  let lastError;

  for (let attempt = 1; attempt <= SPEED.placeAttempts; attempt++) {
    try {
      await page.bringToFront(); // the list tab was in front while scrolling
      await gotoWithRetry(page, withLanguage(url), 'place');
      await handleGoogleInterruptions(page);
      await page.waitForSelector('h1', { timeout: 20000 });
      await page
        .waitForFunction(
          () =>
            document.querySelector(
              'button[data-item-id="address"], a[data-item-id="authority"], button[data-item-id^="phone:"], div.F7nice',
            ),
          { timeout: 10000, polling: 400 },
        )
        .catch(() => { });
      await sleep(900);

      const raw = await page.evaluate(extractPlaceInBrowser);
      raw.finalUrl = page.url();
      if (!raw.name) throw new Error('place name not found');
      return raw;
    } catch (error) {
      lastError = error;
      error.kind = classifyBrowserError(error);
      if (isFatalForPage(error.kind)) throw error;
      if (attempt < SPEED.placeAttempts) await sleep(3000 * attempt);
    }
  }

  throw lastError || new Error('place could not be opened');
}

module.exports = {
  launchBrowser,
  newPage,
  replacePage,
  isPageDead,
  streamFeed,
  streamLoadedFeed,
  openPlace,
};
