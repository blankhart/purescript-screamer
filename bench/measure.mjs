// Runs the js-framework-benchmark operations against Screamer and the
// reference apps in bench/frameworks/, following the method of
// krausest/js-framework-benchmark's webdriver-ts (Playwright runner) so the
// frameworks can be compared on one machine:
//
// * a fresh browser for each operation, a fresh page for each run;
// * the operation's warmup clicks (untimed), a forced GC, then CPU throttling
//   where upstream applies it;
// * a Chrome trace of the timed click, whose duration runs from the click's
//   EventDispatch to the end of the first Commit after the last script,
//   timer, animation frame or layout that follows it, split into script and
//   paint time as upstream does;
// * memory from performance.measureUserAgentSpecificMemory (the page is
//   served cross-origin isolated for it).
//
// The selectors, expected texts and warmup counts are upstream's
// (webdriver-ts/src/benchmarksPlaywright.ts, benchmarksCommon.ts and
// timeline.ts, Apache License 2.0).
//
//   node bench/measure.mjs [--runs 15] [--mem-runs 3]
//                          [--frameworks screamer,vanillajs,solid,halogen]
//                          [--benchmarks create1k,swap,...]
//                          [--css light|bootstrap] [--results bench/results]
//
// `--css bootstrap` (the default) serves the stylesheet upstream uses.
// `--css light` serves bench/css/light.css in its place: the benchmark's own
// rules without Bootstrap. Measured on Screamer and VanillaJS (12 runs each),
// the light stylesheet left script time unchanged within its spread and did
// not make it steadier; it shortened paint for most operations but doubled
// it for update10th, so totals under it are not comparable with upstream's.
//
// Build first (`npm run bench`); `npm run bench:measure` does both. Each
// framework's results go to <results>/<framework>.json, and
// <results>/summary.md tabulates every result file present.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const resultsDir = path.resolve(opt('--results', path.join(here, 'results')));
const css = opt('--css', 'bootstrap');
if (css !== 'light' && css !== 'bootstrap') throw new Error(`--css must be light or bootstrap, not ${css}`);
const stylesheet = path.join(here, 'css', 'currentStyle.css');
const lightStylesheet = path.join(here, 'css', 'light.css');
const list = (name, dflt) => opt(name, dflt.join(',')).split(',').filter(Boolean);

const frameworks = {
  screamer: { page: 'bench/frameworks/screamer/index.html', bundle: 'examples/output/JsFrameworksBenchmark.bench.js', keyed: true },
  vanillajs: { page: 'bench/frameworks/vanillajs/index.html', bundle: 'bench/frameworks/vanillajs/Main.js', keyed: true },
  solid: { page: 'bench/frameworks/solid/index.html', bundle: 'bench/frameworks/solid/dist/main.js', keyed: true },
  halogen: { page: 'bench/frameworks/halogen/index.html', bundle: 'bench/frameworks/halogen/bundle.js', keyed: false },
};

// ---------------------------------------------------------------------------
// Page access, as upstream's playwrightAccess.ts: poll from Node so that the
// checks add no animation frames or timers to the traced page.

const retry = async (page, what, test) => {
  for (let k = 0; k < 10; k++) {
    if (await test()) return;
    await page.waitForTimeout(k < 3 ? 10 : 1000);
  }
  throw new Error(`${what} failed`);
};

const exists = (page, sel) => retry(page, `exists ${sel}`, async () => {
  const el = await page.$(sel);
  await el?.dispose();
  return !!el;
});

const notExists = (page, sel) => retry(page, `not exists ${sel}`, async () => {
  const el = await page.$(sel);
  await el?.dispose();
  return !el;
});

const hasText = (page, sel, text) => retry(page, `${sel} contains ${JSON.stringify(text)}`, async () => {
  const el = await page.$(sel);
  if (!el) return false;
  const txt = await el.innerText();
  await el.dispose();
  return txt.includes(text);
});

const hasClass = (page, sel, cls) => retry(page, `${sel} has class ${cls}`, async () => {
  const el = await page.$(sel);
  if (!el) return false;
  const found = await el.evaluate((e, c) => e.classList.contains(c), cls);
  await el.dispose();
  return found;
});

async function click(page, sel) {
  const el = await page.$(sel);
  if (!el) throw new Error(`no element for ${sel}`);
  await el.click();
  await el.dispose();
}

const row = (n, rest = '') => `tbody>tr:nth-of-type(${n})${rest}`;
const id = (n) => row(n, '>td:nth-of-type(1)');

async function createAndClear(page, warmup) {
  for (let i = 0; i < warmup; i++) {
    await click(page, '#run');
    await hasText(page, id(1), String(i * 1000 + 1));
    await click(page, '#clear');
    await notExists(page, id(1000));
  }
}

// ---------------------------------------------------------------------------
// The operations, with upstream's ids, warmups, CPU slowdowns and checks.

const W = 5;
const skip = 4;
const benchmarks = {
  create1k: {
    upstream: '01_run1k', throttle: 1,
    init: async (p) => { await exists(p, '#run'); await createAndClear(p, W); },
    run: async (p) => { await click(p, '#run'); await hasText(p, id(1000), String((W + 1) * 1000)); },
  },
  replace1k: {
    upstream: '02_replace1k', throttle: 1,
    init: async (p) => {
      await exists(p, '#run');
      for (let i = 0; i < W; i++) {
        await click(p, '#run');
        await hasText(p, id(1), String(i * 1000 + 1));
      }
    },
    run: async (p) => { await click(p, '#run'); await hasText(p, id(1), String(W * 1000 + 1)); },
  },
  update10th: {
    upstream: '03_update10th1k_x16', throttle: 4,
    init: async (p) => {
      await exists(p, '#run');
      await click(p, '#run');
      await exists(p, id(1000));
      for (let i = 0; i < 3; i++) {
        await click(p, '#update');
        await hasText(p, row(991, '>td:nth-of-type(2)>a'), ' !!!'.repeat(i + 1));
      }
    },
    run: async (p) => { await click(p, '#update'); await hasText(p, row(991, '>td:nth-of-type(2)>a'), ' !!!'.repeat(4)); },
  },
  select: {
    upstream: '04_select1k', throttle: 4, extraRuns: 10,
    init: async (p) => {
      await exists(p, '#run');
      await click(p, '#run');
      await hasText(p, id(1000), '1000');
      await click(p, row(5, '>td:nth-of-type(2)>a'));
      await hasClass(p, row(5), 'danger');
      const selected = await p.$$('tbody>tr.danger');
      if (selected.length !== 1) throw new Error(`${selected.length} rows selected, expected 1`);
    },
    run: async (p) => { await click(p, row(2, '>td:nth-of-type(2)>a')); await hasClass(p, row(2), 'danger'); },
  },
  swap: {
    upstream: '05_swap1k', throttle: 4,
    init: async (p) => {
      await exists(p, '#run');
      await click(p, '#run');
      await exists(p, id(1000));
      for (let i = 0; i <= W; i++) {
        await click(p, '#swaprows');
        await hasText(p, id(999), i % 2 === 0 ? '2' : '999');
      }
    },
    run: async (p) => {
      await click(p, '#swaprows');
      await hasText(p, id(999), W % 2 === 0 ? '999' : '2');
      await hasText(p, id(2), W % 2 === 0 ? '2' : '999');
    },
  },
  remove: {
    upstream: '06_remove-one-1k', throttle: 2,
    init: async (p) => {
      const remove = (n) => click(p, row(n, '>td:nth-of-type(3)>a>span:nth-of-type(1)'));
      await exists(p, '#run');
      await click(p, '#run');
      await exists(p, id(1000));
      for (let i = 0; i < W; i++) {
        const n = W - i + skip;
        await hasText(p, id(n), String(n));
        await remove(n);
        await hasText(p, id(n), String(skip + W + 1));
      }
      await hasText(p, id(skip + 1), String(skip + W + 1));
      await hasText(p, id(skip), String(skip));
      await hasText(p, id(skip + 2), String(skip + W + 2));
      await remove(skip + 2);
      await hasText(p, id(skip + 2), String(skip + W + 3));
    },
    run: async (p) => {
      await click(p, row(skip, '>td:nth-of-type(3)>a>span:nth-of-type(1)'));
      await hasText(p, id(skip), String(skip + W + 1));
    },
  },
  create10k: {
    upstream: '07_create10k', throttle: 1,
    init: async (p) => { await exists(p, '#run'); await createAndClear(p, W); },
    run: async (p) => { await click(p, '#runlots'); await exists(p, row(10000, '>td:nth-of-type(2)>a')); },
  },
  append1k: {
    upstream: '08_create1k-after1k_x2', throttle: 1,
    init: async (p) => {
      await exists(p, '#run');
      await createAndClear(p, W);
      await click(p, '#run');
      await exists(p, id(1000));
    },
    run: async (p) => { await click(p, '#add'); await exists(p, id(2000)); },
  },
  clear: {
    upstream: '09_clear1k_x8', throttle: 4,
    init: async (p) => {
      await exists(p, '#run');
      await createAndClear(p, W);
      await click(p, '#run');
      await hasText(p, id(1), String(W * 1000 + 1));
    },
    run: async (p) => { await click(p, '#clear'); await notExists(p, id(1000)); },
  },
};

const memoryBenchmarks = {
  readyMemory: { upstream: '21_ready-memory', run: async () => {} },
  runMemory: {
    upstream: '22_run-memory',
    run: async (p) => { await click(p, '#run'); await exists(p, row(1, '>td:nth-of-type(2)>a')); },
  },
  createClear5Memory: {
    upstream: '25_run-clear-memory',
    run: async (p) => {
      for (let i = 0; i < 5; i++) {
        await click(p, '#run');
        await hasText(p, id(1000), String(1000 * (i + 1)));
        await click(p, '#clear');
        await notExists(p, id(1000));
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Trace analysis, as upstream's timeline.ts.

const jsEvents = ['EventDispatch', 'EvaluateScript', 'v8.evaluateModule', 'FunctionCall', 'TimerFire',
  'FireIdleCallback', 'FireAnimationFrame', 'RunMicrotasks', 'V8.Execute'];
const paintEvents = ['UpdateLayoutTree', 'Layout', 'Commit', 'Paint', 'Layerize', 'PrePaint'];
const timelineTypes = { Layout: 'layout', FunctionCall: 'functioncall', HitTest: 'hittest', Commit: 'commit',
  Paint: 'paint', FireAnimationFrame: 'fireAnimationFrame' };

function timeline(entries) {
  const events = [];
  const add = (type, e, dur = +e.dur) => events.push({ type, ts: +e.ts, dur, end: +e.ts + dur, pid: e.pid });
  for (const e of entries) {
    if (e.name === 'EventDispatch') {
      if (e.args.data.type === 'click') { add('start', e); add('click', e); }
      else if (e.args.data.type === 'mousedown') add('mousedown', e);
    } else if (timelineTypes[e.name] && e.ph === 'X') add(timelineTypes[e.name], e);
    else if (e.name === 'TimerFire' && e.ph === 'X') add('timerFire', e, 0);
    else if (e.name === 'RequestAnimationFrame') add('requestAnimationFrame', e, 0);
  }
  return events.sort((a, b) => a.end - b.end);
}

function duration(entries) {
  const events = timeline(entries);
  const clicks = events.filter((e) => e.type === 'start');
  if (clicks.length !== 1) throw new Error(`expected one click in the trace, found ${clicks.length}`);
  const [click] = clicks;
  const during = events.filter((e) => (e.ts > click.end || e.type === 'click') && e.pid === click.pid);
  const from = during.filter((e) => ['click', 'fireAnimationFrame', 'timerFire', 'layout', 'functioncall'].includes(e.type)).at(-1);
  const commits = during.filter((e) => e.type === 'commit');
  if (commits.length === 0) throw new Error('no commit in the trace');
  const commit = commits.find((e) => e.ts > from.end) ?? commits.at(-1);
  let total = (commit.end - click.ts) / 1000;

  // Upstream discounts a requestAnimationFrame callback that fired more than
  // a frame after the click when nothing was laid out before it.
  const rafs = events.filter((e) => e.type === 'requestAnimationFrame' && e.ts >= click.ts && e.ts <= click.end);
  const fafs = events.filter((e) => e.type === 'fireAnimationFrame' && e.ts >= click.ts && e.ts < commit.ts);
  if (rafs.length === 1 && fafs.length === 1) {
    const wait = (fafs[0].ts - click.end) / 1000;
    const laidOut = during.some((e) => e.type === 'layout' && e.ts < fafs[0].ts);
    if (wait > 16 && !laidOut) total -= wait - 16;
  }
  return { total, start: click.ts, end: commit.end };
}

// Summed time of the named events within [start, end], dropping events
// nested in another (upstream's interval merge).
function busy(entries, names, start, end, includeClick) {
  let intervals = [];
  for (const e of entries) {
    const relevant = e.name === 'EventDispatch'
      ? includeClick && e.args.data.type === 'click'
      : names.includes(e.name) && e.ph === 'X';
    if (!relevant || +e.ts < start || +e.ts > end) continue;
    const iv = { start: +e.ts, end: +e.ts + +e.dur };
    const contained = intervals.some((o) => iv.start >= o.start && iv.end <= o.end);
    intervals = [...(contained ? [] : [iv]), ...intervals.filter((o) => o.start < iv.start || o.end > iv.end)];
  }
  return intervals.reduce((sum, iv) => sum + iv.end - iv.start, 0) / 1000;
}

function analyse(trace) {
  const entries = JSON.parse(trace.toString('utf8')).traceEvents;
  const { total, start, end } = duration(entries);
  return { total, script: busy(entries, jsEvents, start, end, true), paint: busy(entries, paintEvents, start, end, false) };
}

// ---------------------------------------------------------------------------
// Running.

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round = (x) => Math.round(x * 100) / 100;
const stats = (xs) => ({ mean: round(mean(xs)), median: round(median(xs)), runs: xs.map(round) });

// Serves the repository root, cross-origin isolated so that the page may
// call measureUserAgentSpecificMemory. Under `--css light` the apps'
// stylesheet is light.css.
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (css === 'light' && file === stylesheet) file = lightStylesheet;
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      'content-type': types[path.extname(file)] || 'application/octet-stream',
      'cross-origin-opener-policy': 'same-origin',
      'cross-origin-embedder-policy': 'require-corp',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const executablePath = process.env.CHROMIUM_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const launch = () => chromium.launch({
  executablePath,
  headless: false,
  args: ['--headless=new', '--window-size=1000,800', '--js-flags=--expose-gc', '--enable-benchmarking'],
});

async function open(browser, url) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  return page;
}

const gc = (page) => page.evaluate(() => window.gc({ type: 'major', execution: 'sync', flavor: 'last-resort' }));

async function cpu(url, bench, runs) {
  const browser = await launch();
  const results = [];
  try {
    for (let i = 0; i < runs + (bench.extraRuns ?? 0); i++) {
      const page = await open(browser, url);
      const cdp = await page.context().newCDPSession(page);
      await bench.init(page);
      await gc(page);
      if (bench.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: bench.throttle });
      await browser.startTracing(page, {
        screenshots: false,
        categories: ['blink.user_timing', 'devtools.timeline', 'disabled-by-default-devtools.timeline'],
      });
      await bench.run(page);
      await page.waitForTimeout(40);
      const trace = await browser.stopTracing();
      if (bench.throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      results.push(analyse(trace));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return { total: stats(results.map((r) => r.total)), script: stats(results.map((r) => r.script)), paint: stats(results.map((r) => r.paint)) };
}

async function memory(url, bench, runs) {
  const browser = await launch();
  const results = [];
  try {
    for (let i = 0; i < runs; i++) {
      const page = await open(browser, url);
      await exists(page, '#run');
      await bench.run(page);
      await gc(page);
      await page.waitForTimeout(40);
      results.push(await page.evaluate(async () => (await performance.measureUserAgentSpecificMemory()).bytes / 1024 / 1024));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  return stats(results);
}

const fmt = (x) => (x === undefined ? '' : x.toFixed(1));

function summarise() {
  const all = fs.readdirSync(resultsDir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')));
  const names = [...new Set(all.flatMap((r) => Object.keys(r.operations)))];
  const mems = [...new Set(all.flatMap((r) => Object.keys(r.memory)))];
  const head = (cols) => [`| | ${cols.join(' | ')} |`, `|---|${cols.map(() => '---:').join('|')}|`];
  const lines = [
    '# js-framework-benchmark on this machine',
    '',
    'Written by `bench/measure.mjs`. Mean total duration in ms (script time in',
    'parentheses), from a Chrome trace of each run, as krausest/js-framework-benchmark',
    'measures it; see that script for the method. Memory is in MB.',
    '',
    ...all.map((r) => `* ${r.framework}${r.keyed ? '' : ' (non-keyed)'}: ${r.browser}, ${r.runs} runs, ${r.css ?? 'bootstrap'} CSS, ${r.date}`),
    '',
    ...head(names),
    ...all.map((r) => `| ${r.framework} | ${names.map((n) => {
      const o = r.operations[n];
      return o ? `${fmt(o.total.mean)} (${fmt(o.script.mean)})` : '';
    }).join(' | ')} |`),
    '',
    ...head(mems),
    ...all.map((r) => `| ${r.framework} | ${mems.map((m) => fmt(r.memory[m]?.mean)).join(' | ')} |`),
    '',
  ];
  fs.writeFileSync(path.join(resultsDir, 'summary.md'), lines.join('\n'));
  console.log(lines.slice(lines.indexOf('') + 1).join('\n'));
}

const runs = Number(opt('--runs', '15'));
const memRuns = Number(opt('--mem-runs', '3'));
const chosen = list('--frameworks', Object.keys(frameworks));
const chosenBenchmarks = list('--benchmarks', [...Object.keys(benchmarks), ...Object.keys(memoryBenchmarks)]);
for (const name of chosen) {
  if (!frameworks[name]) throw new Error(`unknown framework ${name}`);
  if (!fs.existsSync(path.join(root, frameworks[name].bundle))) {
    console.error(`missing ${frameworks[name].bundle}; run \`npm run bench\` first`);
    process.exit(1);
  }
}

fs.mkdirSync(resultsDir, { recursive: true });
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const name of chosen) {
    const url = `${base}/${frameworks[name].page}`;
    const file = path.join(resultsDir, `${name}.json`);
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { operations: {}, memory: {} };
    const operations = { ...previous.operations };
    const mem = { ...previous.memory };
    for (const [op, bench] of Object.entries(benchmarks)) {
      if (!chosenBenchmarks.includes(op)) continue;
      operations[op] = { upstream: bench.upstream, throttle: bench.throttle, ...await cpu(url, bench, runs) };
      const o = operations[op];
      console.log(`${name.padEnd(10)} ${op.padEnd(12)} ${fmt(o.total.mean).padStart(8)} ms  (script ${fmt(o.script.mean)}, paint ${fmt(o.paint.mean)})`);
    }
    for (const [op, bench] of Object.entries(memoryBenchmarks)) {
      if (!chosenBenchmarks.includes(op)) continue;
      mem[op] = { upstream: bench.upstream, ...await memory(url, bench, memRuns) };
      console.log(`${name.padEnd(10)} ${op.padEnd(18)} ${fmt(mem[op].mean).padStart(8)} MB`);
    }
    const browser = await launch();
    const version = browser.version();
    await browser.close();
    fs.writeFileSync(file, JSON.stringify({
      framework: name,
      keyed: frameworks[name].keyed,
      date: new Date().toISOString(),
      browser: `chromium ${version}`,
      runs,
      memoryRuns: memRuns,
      css,
      unit: { duration: 'ms', memory: 'MB' },
      operations,
      memory: mem,
    }, null, 2) + '\n');
  }
} finally {
  server.close();
}
summarise();
