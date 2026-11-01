// Screamer's own browser smoke tests for its HelloWorld and Typeahead
// examples, run against the PSX versions in examples/src: each
// example renders, responds to the same interactions, and unmounts leaving
// no live effects or scopes.
//
// Adapted from examples/smoke.mjs at the pinned Screamer commit: the two
// examples' interactions and the checks around them are copied unchanged;
// the bundles come from build-examples.mjs, and Chrome from CHROME_PATH
// through playwright-core.
//
//   node examples/scripts/smoke-test.mjs   (after build-examples.mjs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, '..', 'dist');
const executablePath = process.env.CHROME_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const examples = {
  async HelloWorld(page) {
    await expectText(page, '#count', '0');
    await page.click('#increment');
    await page.click('#increment');
    await page.click('#decrement');
    await expectText(page, '#count', '1');
  },

  async Typeahead(page) {
    const results = () => page.evaluate(() => Array.from(document.querySelectorAll('#results li')).map((l) => l.textContent).join());
    await expectText(page, '#status', 'Type at least three letters');
    // A query still in flight when the next one is sent is cancelled, so
    // only the latest results are ever shown, however the latencies fall.
    await page.fill('#search', 'app');
    await page.waitForTimeout(200);
    await page.fill('#search', 'grape');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#results li')).map((l) => l.textContent).join() === 'grape,grapefruit');
    await page.waitForTimeout(800);
    if ((await results()) !== 'grape,grapefruit') throw new Error(`stale results: ${await results()}`);
    await expectText(page, '#status', '2 results');
    await page.press('#search', 'ArrowDown');
    await expectClass(page, '#results li:nth-child(2)', 'selected');
    await page.press('#search', 'Enter');
    await expectText(page, '#chosen', 'Chosen: grapefruit');
    // Typing more keeps the old list on screen until the new one arrives.
    await page.type('#search', 'f', { delay: 0 });
    await expectText(page, '#status', '1 result');
    if ((await results()) !== 'grapefruit') throw new Error(`results: ${await results()}`);
  },
};

async function expectText(page, selector, text) {
  await page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [selector, text]);
}

async function expectClass(page, selector, cls) {
  await page.waitForFunction(([s, c]) => document.querySelector(s)?.className === c, [selector, cls]);
}

const origin = 'http://screamer.test';

const browser = await chromium.launch({ executablePath });
let failed = false;
for (const [name, interact] of Object.entries(examples)) {
  const bundle = path.join(dist, `${name}.js`);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    if (!fs.existsSync(bundle)) throw new Error(`missing ${bundle}; run examples/scripts/build-examples.mjs`);
    // Served from a fake origin, so the History API works.
    await page.route(`${origin}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/bundle.js') return route.fulfill({ path: bundle, contentType: 'text/javascript' });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-example="${name}"><head></head><body><main></main><script src="/bundle.js"></script></body></html>` });
    });
    await page.goto(`${origin}/`);
    await page.waitForFunction(() => window.screamerExample !== undefined, null, { timeout: 5000 });
    const before = await page.evaluate(() => window.screamerExample.stats());
    if (before.liveEffects === 0) throw new Error('no live effects after mount');
    await interact(page);
    const after = await page.evaluate(() => {
      window.screamerExample.unmount(); // a second unmount is a no-op
      return { stats: window.screamerExample.stats(), html: document.querySelector('main').innerHTML };
    });
    if (after.stats.liveEffects !== 0 || after.stats.liveScopes !== 0) {
      throw new Error(`after unmount: ${after.stats.liveEffects} live effects, ${after.stats.liveScopes} live scopes`);
    }
    if (after.html !== '') throw new Error(`after unmount, main still holds ${after.html.slice(0, 80)}`);
    if (errors.length > 0) throw new Error(`page errors: ${errors.join('; ')}`);
    console.log(`ok     ${name}`);
  } catch (e) {
    failed = true;
    console.log(`FAIL   ${name}: ${e.message}`);
  } finally {
    await page.close();
  }
}
await browser.close();
if (failed) process.exitCode = 1;
