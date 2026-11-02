'use strict';

// Infinite-scroll test against a local page that lazy-loads like the Google
// Maps result feed (20 cards per scroll, parent element is the scroller,
// end-of-list marker). Never touches Google.
//
//   npm test                                   # bundled Chrome from `npm ci`
//   PUPPETEER_EXECUTABLE_PATH=/path/to/chrome npm test

process.env.FEED_GROWTH_TIMEOUT_MS = '1500';
process.env.MAX_FEED_STALLS = '3';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const maps = require('../src/maps');

const FIXTURE = pathToFileURL(path.join(__dirname, 'fixtures', 'maps-feed.html')).href;

let browser;
let launchError;

before(async () => {
  try {
    browser = await maps.launchBrowser();
  } catch (error) {
    launchError = error;
  }
});

after(async () => {
  if (browser) await browser.close();
});

async function collect(query, { stopAfter = Infinity } = {}) {
  const page = await maps.newPage(browser);
  await page.goto(`${FIXTURE}?${query}`);
  const cards = [];
  let ended = false;
  for await (const batch of maps.streamLoadedFeed(page)) {
    cards.push(...batch.cards);
    ended = batch.end;
    if (cards.length >= stopAfter) break; // what runJob does when the target is met
  }
  const loads = await page.evaluate(() => window.__loads);
  await page.close();
  return { cards, ended, loads };
}

test('unlimited mode scrolls until "You\'ve reached the end of the list"', async (t) => {
  if (!browser) return t.skip(`Chrome not available: ${launchError?.message}`);
  const { cards, ended, loads } = await collect('total=120&batch=20&delayMs=300');
  assert.equal(cards.length, 120);
  assert.equal(new Set(cards.map((c) => c.href)).size, 120, 'no duplicate cards');
  assert.equal(ended, true);
  assert.equal(loads, 6);
  assert.match(cards[119].starLabel, /stars/);
});

test('target mode stops scrolling once enough cards were consumed', async (t) => {
  if (!browser) return t.skip(`Chrome not available: ${launchError?.message}`);
  const { cards, loads } = await collect('total=120&batch=20&delayMs=300', { stopAfter: 45 });
  assert.ok(cards.length >= 45 && cards.length <= 60, `got ${cards.length}`);
  assert.ok(loads <= 4, `feed should not be scrolled to the end (loads=${loads})`);
});

test('a batch slower than the growth timeout is recovered by nudging', async (t) => {
  if (!browser) return t.skip(`Chrome not available: ${launchError?.message}`);
  const { cards, ended } = await collect('total=80&batch=20&delayMs=200&slowAt=40&slowMs=2500');
  assert.equal(cards.length, 80);
  assert.equal(ended, true);
});

// Regression: the worker's list tab sits behind the detail tab. A hidden tab
// gets no scroll events, so the feed used to stop at the first 20 results.
test('feed keeps loading when the list tab is behind the detail tab', async (t) => {
  if (!browser) return t.skip(`Chrome not available: ${launchError?.message}`);
  const listPage = await maps.newPage(browser);
  const detailPage = await maps.newPage(browser);
  await listPage.goto(`${FIXTURE}?total=100&batch=20&delayMs=200`);
  await detailPage.goto('data:text/html,<h1>place</h1>');
  await detailPage.bringToFront();
  assert.equal(await listPage.evaluate(() => document.visibilityState), 'hidden');

  let count = 0;
  for await (const batch of maps.streamLoadedFeed(listPage)) {
    count += batch.cards.length;
    await detailPage.bringToFront(); // what openPlace does between scroll steps
    await detailPage.goto(`data:text/html,<h1>place ${count}</h1>`);
  }
  assert.equal(count, 100);
  await listPage.close();
  await detailPage.close();
});

test('a feed that stops growing without an end marker gives up after the stall limit', async (t) => {
  if (!browser) return t.skip(`Chrome not available: ${launchError?.message}`);
  const started = Date.now();
  const { cards, ended } = await collect('total=120&batch=20&delayMs=200&stallAt=40');
  assert.equal(cards.length, 40);
  assert.equal(ended, false);
  assert.ok(Date.now() - started < 20_000, 'stall detection should be bounded');
});
