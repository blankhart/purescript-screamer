// Opens a bundled example in headless Chromium, as `npm run test:smoke`
// and `npm run inspect` both do: served from a fake origin (so the History
// API works) with the examples' stylesheet and an in-page WebSocket mock.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const executablePath = process.env.CHROMIUM_PATH
  || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

export const launch = () => chromium.launch({ executablePath });

export const origin = 'http://screamer.test';

// An in-page WebSocket that echoes what it is sent.
function mockWebSocket() {
  window.WebSocket = class extends EventTarget {
    constructor(url) {
      super();
      this.url = url;
      this.closed = false;
      this.readyState = 0;
      window.lastSocket = this;
      setTimeout(() => {
        if (this.closed) return;
        this.readyState = 1;
        this.dispatchEvent(new Event('open'));
      }, 0);
    }
    send(text) {
      setTimeout(() => {
        const e = new MessageEvent('message', { data: text });
        this.dispatchEvent(e);
      }, 0);
    }
    close() {
      this.closed = true;
      this.readyState = 3;
      setTimeout(() => this.dispatchEvent(new CloseEvent('close', { code: 1000, wasClean: true })), 0);
    }
    drop() {
      this.closed = true;
      this.readyState = 3;
      this.dispatchEvent(new CloseEvent('close', { code: 1006, reason: 'network lost', wasClean: false }));
    }
  };
}

/**
 * A new page that serves example `name` at `origin` once `page.goto`
 * loads it, with `initScripts` run before the bundle. `errors` collects the
 * page's uncaught errors. Throws if the example has not been bundled.
 */
export async function openExample(browser, name, initScripts = []) {
  const bundle = path.join(here, 'output', `${name}.js`);
  const stylesheet = path.join(here, 'static', 'examples.css');
  if (!fs.existsSync(bundle)) throw new Error(`missing ${bundle}; run \`npm run build:examples\``);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/bundle.js') return route.fulfill({ path: bundle, contentType: 'text/javascript' });
    if (url.pathname === '/examples.css') return route.fulfill({ path: stylesheet, contentType: 'text/css' });
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html data-example="${name}"><head><link rel="stylesheet" href="/examples.css"></head><body><main></main><script src="/bundle.js"></script></body></html>` });
  });
  await page.addInitScript(mockWebSocket);
  for (const script of initScripts) await page.addInitScript(script);
  return { page, errors };
}
