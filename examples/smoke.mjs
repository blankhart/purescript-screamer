// Smoke tests for the bundled examples in headless Chromium: each example
// renders, responds to one interaction, and unmounts leaving no live effects
// or scopes.
//
//   node examples/smoke.mjs        (after `npm run build:examples`)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const executablePath = process.env.CHROMIUM_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const examples = {
  async HelloWorld(page) {
    await expectText(page, '#count', '0');
    await page.click('#increment');
    await page.click('#increment');
    await page.click('#decrement');
    await expectText(page, '#count', '1');
  },

  async RainbowSpiral(page) {
    // A cursor dot and 301 spiral dots (the inactive ones hidden).
    await page.waitForFunction(() => document.querySelectorAll('#spiral .cursor').length === 302);
    // The cursor dot is placed relative to the centre of the stage.
    const box = await page.locator('#spiral').boundingBox();
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2 + 8);
    await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('#spiral .cursor').style.left) - 150) < 1);
    // The picker changes the number of dots.
    await page.click('.picker button:nth-of-type(2)');
    await page.waitForFunction(() => document.querySelectorAll('#spiral .cursor').length === 752);
  },

  async Draggable(page) {
    const circle = page.locator('#circle-1');
    const box = await circle.boundingBox();
    const cx = await circle.getAttribute('cx');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 10, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction((before) => Number(document.querySelector('#circle-1').getAttribute('cx')) === Number(before) + 40, cx);
  },

  async Router(page) {
    await expectText(page, '#page h1', 'Home');
    await page.click('#item');
    await expectText(page, '#page h1', 'Item 42');
    if (new URL(page.url()).hash !== '#/items/42') throw new Error(`location is ${page.url()}`);
    await expectClass(page, '#item', 'current');
    await page.click('#about');
    await expectText(page, '#page h1', 'About');
    await page.goBack();
    await expectText(page, '#page h1', 'Item 42');
    await page.click('#broken');
    await expectText(page, '#page h1', 'Not found');
  },

  async WebSocket(page) {
    await expectText(page, '#status', 'Connected to wss://echo.websocket.org');
    await page.fill('#draft', 'hello');
    await page.click('button');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#lines li')).map((l) => l.className + ':' + l.textContent).join() === 'mine:hello,theirs:hello');
    const closed = await page.evaluate(() => { window.screamerExample.unmount(); return window.lastSocket.closed; });
    if (!closed) throw new Error('socket still open after unmount');
  },

  async Formlets(page) {
    const field = (n, el) => `#signup .screamer-form > label:nth-child(${n}) ${el}`;
    const errors = () => page.evaluate(() => Array.from(document.querySelectorAll('#signup .screamer-form-error')).filter((e) => !e.hidden).map((e) => e.textContent));
    const expectErrors = async (want) => {
      await page.waitForFunction((w) => JSON.stringify(Array.from(document.querySelectorAll('#signup .screamer-form-error')).filter((e) => !e.hidden).map((e) => e.textContent)) === w, JSON.stringify(want));
    };
    await expectText(page, '#status', '6 fields to fix');
    await expectErrors([]);
    // A message appears after an edit and clears when the value is fixed.
    await page.fill(field(4, 'input'), '9');
    await expectErrors(['You must be 13 or over']);
    await page.fill(field(4, 'input'), '42');
    await expectErrors([]);
    // Submitting an invalid form reveals every message.
    await page.click('#signup button[type=submit]');
    await expectErrors(['Enter your name', 'Enter your email', 'Use at least 8 characters', 'Choose a plan', 'Accept the terms to continue']);
    await page.fill(field(1, 'input'), 'Ada');
    await page.fill(field(2, 'input'), 'ada@example.com');
    await page.fill(field(3, 'input'), 'correct horse');
    await page.selectOption(field(5, 'select'), { label: 'Pro' });
    await page.check(field(6, 'input'));
    await expectErrors([]);
    await expectText(page, '#status', 'Ready');
    await page.click('#signup button[type=submit]');
    await expectText(page, '#submitted', 'Welcome, Ada (ada@example.com, 42, Pro)');
    await expectText(page, '#status', '6 fields to fix');
    if ((await errors()).length !== 0) throw new Error('messages shown after reset');
    // The wizard's second step depends on the first answer.
    await page.click('#trip .screamer-form-next');
    await expectText(page, '#trip .screamer-form-error:not([hidden])', 'Choose a kind of trip');
    await page.selectOption('#trip select', { label: 'Camping' });
    await page.click('#trip .screamer-form-next');
    await expectText(page, '#trip legend', 'Step 2: how long?');
    await page.fill('#trip input', '3');
    await expectText(page, '#plan', 'Camping for 3 nights');
    await page.click('#trip .screamer-form-back');
    await page.selectOption('#trip select', { label: 'City break' });
    await page.click('#trip .screamer-form-next');
    await page.fill('#trip input', 'Lisbon');
    await expectText(page, '#plan', 'City break in Lisbon');
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

  async CodeMirror(page) {
    const count = (id) => page.evaluate((i) => document.querySelector(`#${i} .count`).textContent, id);
    const editorText = (id) => page.evaluate((i) => Array.from(document.querySelectorAll(`#${i} .cm-line`)).map((l) => l.textContent).join('\n'), id);
    await page.waitForFunction(() => document.querySelectorAll('.cm-editor').length === 2);
    const initial = await editorText('editor-1');
    const before = await count('editor-1');
    const other = await count('editor-2');
    // Typing updates the count and preview; the other instance is untouched.
    await page.click('#editor-1 .cm-content');
    await page.keyboard.press('Control+End');
    await page.keyboard.type('xyz');
    await expectText(page, '#editor-1 .count', `${parseInt(before) + 3} characters`);
    await page.waitForFunction(() => document.querySelector('#editor-1 .preview').textContent.endsWith('xyz'));
    if ((await count('editor-2')) !== other) throw new Error('the second editor changed');
    // Reset writes the source, and the editor follows.
    await page.click('#editor-1 .reset');
    await expectText(page, '#editor-1 .count', before);
    await page.waitForFunction((t) => Array.from(document.querySelectorAll('#editor-1 .cm-line')).map((l) => l.textContent).join('\n') === t, initial);
    // Read-only ignores typing.
    await page.click('#editor-1 .read-only');
    await expectText(page, '#editor-1 .read-only', 'Make editable');
    await page.click('#editor-1 .cm-content');
    await page.keyboard.type('nope');
    await page.waitForTimeout(100);
    if ((await count('editor-1')) !== before) throw new Error('a read-only editor accepted typing');
    const left = await page.evaluate(() => { window.screamerExample.unmount(); return document.querySelectorAll('.cm-editor').length; });
    if (left !== 0) throw new Error(`${left} editors left after unmount`);
  },

  async JsFrameworksBenchmark(page) {
    await page.click('#run');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1000);
    await page.click('tbody tr:nth-child(2) td:nth-child(2) a');
    await expectClass(page, 'tbody tr:nth-child(2)', 'danger');
    await page.click('tbody tr:nth-child(3) td:nth-child(2) a');
    await expectClass(page, 'tbody tr:nth-child(2)', '');
    await page.click('#update');
    await page.waitForFunction(() => document.querySelector('tbody tr td:nth-child(2) a').textContent.endsWith(' !!!'));
  },
};

async function expectText(page, selector, text) {
  await page.waitForFunction(([s, t]) => document.querySelector(s)?.textContent === t, [selector, text]);
}

async function expectClass(page, selector, cls) {
  await page.waitForFunction(([s, c]) => document.querySelector(s)?.className === c, [selector, cls]);
}

const origin = 'http://screamer.test';

// An in-page WebSocket that echoes what it is sent.
function mockWebSocket() {
  window.WebSocket = class extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.closed = false;
      window.lastSocket = this;
      setTimeout(() => this.dispatchEvent(new Event('open')), 0);
    }
    send(text) {
      setTimeout(() => {
        const e = new MessageEvent('message', { data: text });
        this.dispatchEvent(e);
      }, 0);
    }
    close() {
      this.closed = true;
      setTimeout(() => this.dispatchEvent(new Event('close')), 0);
    }
  };
}

const browser = await chromium.launch({ executablePath });
let failed = false;
for (const [name, interact] of Object.entries(examples)) {
  const bundle = path.join(here, 'output', `${name}.js`);
  const stylesheet = path.join(here, 'static', 'examples.css');
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    if (!fs.existsSync(bundle)) throw new Error(`missing ${bundle}; run \`npm run build:examples\``);
    // Served from a fake origin, so the History API works.
    await page.route(`${origin}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/bundle.js') return route.fulfill({ path: bundle, contentType: 'text/javascript' });
      if (url.pathname === '/examples.css') return route.fulfill({ path: stylesheet, contentType: 'text/css' });
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-example="${name}"><head><link rel="stylesheet" href="/examples.css"></head><body><main></main><script src="/bundle.js"></script></body></html>` });
    });
    await page.addInitScript(mockWebSocket);
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
