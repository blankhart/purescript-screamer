// Installs a jsdom window as the global environment before any module loads.
// Loaded with `node --import ./test/setup-dom.mjs` (see `npm run test:purs`).
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;

globalThis.window = window;
for (const key of Object.getOwnPropertyNames(window)) {
  if (key in globalThis) continue;
  try {
    globalThis[key] = window[key];
  } catch {
    // some properties are getters that throw outside a browsing context
  }
}
