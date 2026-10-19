# screamer-test

Helpers for testing Screamer code with purescript-spec.

| Module | What it has |
|---|---|
| `Screamer.Test` | `observe` (a signal's values), `observeE` (an event's occurrences), `runSpec` |
| `Screamer.Test.Dom` | jsdom helpers: `resetBody`, `innerHTML`, `click`, `typeInto`, `liveListeners`, … |
| `Screamer.Test.Clock` | `fakeHost`, a `Screamer.Host` whose time moves only on `advance`; and fakes of the global timers and animation frames |

Run DOM tests with `node --import ./packages/screamer-test/setup-dom.mjs`, which installs a jsdom window before any module loads (`npm run test:purs` does). Depends on: screamer-reactive, spec, web-dom, web-events.
