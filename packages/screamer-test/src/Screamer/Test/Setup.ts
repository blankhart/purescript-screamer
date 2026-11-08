// Node-only test bootstrap, copied by purs to a stable output module path.
/// <reference types="node" />
import { createRequire, registerHooks } from 'node:module';

let installed = false;
let cssInstalled = false;

export const setupWith = ({ stubCss }: { stubCss: boolean }) => () => {
  if (!installed) {
    // Resolve from the consuming project's output, not a Spago directory.
    // Requiring here keeps importing this module inert.
    const { JSDOM } = createRequire(import.meta.url)('jsdom');
    const { window } = new JSDOM('<!doctype html><html><body><main></main></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    globalThis.window = window;
    for (const key of Object.getOwnPropertyNames(window)) {
      if (key in globalThis) continue;
      try { globalThis[key] = window[key]; } catch {
        // Some browser getters throw outside a browsing context.
      }
    }
    installed = true;
  }
  if (stubCss && !cssInstalled) {
    registerHooks({
      load(url, context, nextLoad) {
        if (url.startsWith('file:') && new URL(url).pathname.endsWith('.css')) {
          return { format: 'module', source: 'export default "";', shortCircuit: true };
        }
        return nextLoad(url, context);
      },
    });
    cssInstalled = true;
  }
};
