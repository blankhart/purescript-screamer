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
    await page.waitForFunction(() => document.querySelectorAll('#main .cursor').length === 302);
    await page.mouse.move(150, 8);
    await page.waitForFunction(() => document.querySelector('#main .cursor').style.left === '150px');
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
    if (new URL(page.url()).pathname !== '/items/42') throw new Error(`location is ${page.url()}`);
    await page.click('#about');
    await expectText(page, '#page h1', 'About');
    await page.goBack();
    await expectText(page, '#page h1', 'Item 42');
  },

  async WebSocket(page) {
    await expectText(page, '#status', 'Connected to wss://echo.websocket.org');
    await page.fill('#draft', 'hello');
    await page.click('button');
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#lines li')).map((l) => l.className + ':' + l.textContent).join() === 'mine:hello,theirs:hello');
    const closed = await page.evaluate(() => { window.screamerExample.unmount(); return window.lastSocket.closed; });
    if (!closed) throw new Error('socket still open after unmount');
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    if (!fs.existsSync(bundle)) throw new Error(`missing ${bundle}; run \`npm run build:examples\``);
    // Served from a fake origin, so the History API works.
    await page.route(`${origin}/**`, (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/bundle.js') return route.fulfill({ path: bundle, contentType: 'text/javascript' });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><main></main><script src="/bundle.js"></script></body></html>' });
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
