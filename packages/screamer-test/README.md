# screamer-test

Helpers for testing Screamer code with purescript-spec.

| Module | What it has |
|---|---|
| `Screamer.Test` | `observe` (a signal's values), `observeE` (an event's occurrences), `runSpec`, `withoutStrict` |
| `Screamer.Test.Dom` | jsdom helpers: `resetBody`, `innerHTML`, `click`, `typeInto`, `liveListeners`, … |
| `Screamer.Test.Clock` | `fakeHost`, a `Screamer.Host` whose time moves only on `advance`; and fakes of the global timers and animation frames |

`runSpec` turns on strict mode, so a development warning (a read of a paused stateful signal, `SCR001`, or unordered writes in one timestep, `SCR002`) is thrown and fails the test that caused it. Wrap code that warns on purpose in `withoutStrict`.

Run DOM tests with `node --import ./packages/screamer-test/setup-dom.mjs`, which installs a jsdom window before any module loads (`npm run test:purs` does). Depends on: screamer-reactive, spec, web-dom, web-events.

### Downstream DOM tests

Add `screamer-test` to your Spago test dependencies and `jsdom` to your npm dev
dependencies (`npm install --save-dev jsdom`). Use Node 22.15 or later. After
`spago build`, create a small project-owned `test/setup.mjs`:

```javascript
import { setup } from '../output/Screamer.Test.Setup/index.js';
setup();
```

Then preload it before loading test modules:

```sh
node --import ./test/setup.mjs --input-type=module -e 'import("./output/Test.Main/index.js").then(m => m.main())'
```

The compiled path is stable for registry and git dependencies; it does not
contain a versioned `.spago/p/` directory. Adjust `output` if your compiler uses
a custom output directory. Build before preloading; application modules must
load after `setup()` runs, since some read DOM globals at import time.

`setup` also uses Node's synchronous module hooks to load `.css` imports as
empty modules (default export `""`), including stylesheet companion imports.
It does not apply styles or test layout. Other module formats retain Node's
normal loading behavior. To use your own CSS loader, call
`setupWith({ stubCss: false })()` instead. Repeated setup calls preserve the
installed document. See [Node's module hooks](https://nodejs.org/api/module.html#moduleregisterhooksoptions).
