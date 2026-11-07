// Mounts a bundled example in headless Chromium, optionally runs an
// interaction script, and prints what `window.__SCREAMER_DEVTOOLS__` sees
// as one JSON object: the scope tree, the timestep log from the first mount
// on, the warnings, and the page's errors.
//
//   npm run inspect -- <Example> [script.mjs] [--text]
//
// The script's default export is called with the Playwright page, after
// the example has mounted: `export default async (page) => { await
// page.click('#increment'); }`. With --text the tree is printed as text
// instead of JSON. Run `npm run build:examples` first.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, openExample, origin } from './page.mjs';

const args = process.argv.slice(2);
const text = args.includes('--text');
const [name, script] = args.filter((a) => a !== '--text');
if (name === undefined) {
  console.error('usage: npm run inspect -- <Example> [script.mjs] [--text]');
  process.exit(2);
}

const browser = await launch();
try {
  const { page, errors } = await openExample(browser, name, [() => { window.__SCREAMER_DEVTOOLS_LOG__ = true; }]);
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => window.__SCREAMER_DEVTOOLS__ !== undefined && window.screamerExample !== undefined, null, { timeout: 5000 });
  if (script !== undefined) {
    const run = (await import(pathToFileURL(path.resolve(script)).href)).default;
    await run(page);
  }
  const seen = await page.evaluate((asText) => {
    const d = window.__SCREAMER_DEVTOOLS__;
    const log = d.log.read().split('\n').map((l) => JSON.parse(l));
    return {
      tree: asText ? d.snapshotText() : d.snapshotJson(),
      log: { summary: log[0].summary, rows: log.slice(1) },
      warnings: d.warnings,
    };
  }, text);
  const out = { example: name, ...seen, errors };
  if (text) {
    console.log(out.tree);
    console.log(JSON.stringify({ ...out, tree: undefined }, null, 2));
  } else {
    console.log(JSON.stringify(out, null, 2));
  }
  if (errors.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
