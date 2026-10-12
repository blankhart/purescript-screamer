// Drives the JsFrameworksBenchmark example in headless Chromium and records
// the median duration of each operation, plus JS heap size before creating
// rows and after clearing them.
//
//   node bench/measure.mjs [--runs N] [--out bench/results.json]
//
// Bundle the example first (`npm run bench`); `npm run bench:measure` does both.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const runs = Number(opt('--runs', '7'));
const out = opt('--out', path.join(here, 'results.json'));
const page_url = pathToFileURL(path.join(here, 'index.html')).href;

const bundle = path.join(here, '..', 'examples', 'output', 'JsFrameworksBenchmark.bench.js');
if (!fs.existsSync(bundle)) {
  console.error(`missing ${bundle}; run \`npm run bench\` first`);
  process.exit(1);
}

const executablePath = process.env.CHROMIUM_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

// Each operation: `setup` runs unmeasured, `run` is timed from the click
// until the browser has rendered the next frame.
const ops = {
  create1k: { setup: [], run: ['#run'] },
  replace1k: { setup: ['#run'], run: ['#run'] },
  update10th: { setup: ['#run'], run: ['#update'] },
  select: { setup: ['#run'], run: ['tbody tr:nth-child(2) td:nth-child(2) a'] },
  swap: { setup: ['#run'], run: ['#swaprows'] },
  remove: { setup: ['#run'], run: ['tbody tr:nth-child(4) td:nth-child(3) span'] },
  create10k: { setup: [], run: ['#runlots'] },
  append1k: { setup: ['#run'], run: ['#add'] },
  clear: { setup: ['#run'], run: ['#clear'] },
};

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => Math.round(x * 100) / 100;

async function click(page, selector) {
  return page.evaluate(async (sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`no element for ${sel}`);
    const t0 = performance.now();
    el.click();
    // Force style and layout, then wait for the next frame to be produced.
    void document.body.offsetHeight;
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    return performance.now() - t0;
  }, selector);
}

async function heap(cdp) {
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'JSHeapUsedSize').value;
}

async function fresh(browser) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(page_url);
  await page.waitForSelector('#run');
  return page;
}

const browser = await chromium.launch({ executablePath, args: ['--js-flags=--expose-gc'] });
const results = {};
for (const [name, { setup, run }] of Object.entries(ops)) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const page = await fresh(browser);
    for (const s of setup) await click(page, s);
    let t = 0;
    for (const s of run) t += await click(page, s);
    times.push(t);
    await page.close();
  }
  results[name] = { median: round(median(times)), runs: times.map(round) };
  console.log(`${name.padEnd(12)} ${results[name].median.toFixed(2).padStart(9)} ms`);
}

const memory = { beforeCreate: [], afterClear: [] };
for (let i = 0; i < runs; i++) {
  const page = await fresh(browser);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  memory.beforeCreate.push(await heap(cdp));
  await click(page, '#run');
  await click(page, '#clear');
  memory.afterClear.push(await heap(cdp));
  await page.close();
}
const mem = {
  beforeCreate: median(memory.beforeCreate),
  afterClear: median(memory.afterClear),
};
console.log(`heap before create ${(mem.beforeCreate / 1e6).toFixed(2)} MB, after clear ${(mem.afterClear / 1e6).toFixed(2)} MB`);

const browserVersion = browser.version();
await browser.close();
fs.writeFileSync(out, JSON.stringify({
  date: new Date().toISOString(),
  browser: 'chromium ' + browserVersion,
  runs,
  unit: 'ms',
  operations: results,
  memory: { unit: 'bytes', ...mem },
}, null, 2) + '\n');
console.log(`wrote ${path.relative(process.cwd(), out)}`);
