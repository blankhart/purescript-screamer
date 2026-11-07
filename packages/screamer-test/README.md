# screamer-test

Helpers for testing Screamer code with purescript-spec.

| Module | What it has |
|---|---|
| `Screamer.Test` | `observe` (a signal's values), `observeE` (an event's occurrences), `runSpec`, `withoutStrict` |
| `Screamer.Test.Dom` | jsdom helpers: `resetBody`, `innerHTML`, `click`, `typeInto`, `liveListeners`, … |
| `Screamer.Test.Clock` | `fakeHost`, a `Screamer.Host` whose time moves only on `advance`; and fakes of the global timers and animation frames |

`runSpec` turns on strict mode, so a development warning (a read of a paused stateful signal, `SCR001`, or unordered writes in one timestep, `SCR002`) is thrown and fails the test that caused it. Wrap code that warns on purpose in `withoutStrict`.

Run DOM tests with `node --import ./packages/screamer-test/setup-dom.mjs`, which installs a jsdom window before any module loads (`npm run test:purs` does). Depends on: screamer-reactive, spec, web-dom, web-events.
