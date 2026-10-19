# screamer-reactive

The reactive core: signals, events, sources and scopes, with no DOM. It builds with no `web-*` package, so it runs wherever JavaScript does.

| Module | What it has |
|---|---|
| `Screamer.Signal` | `Signal`, its instances, `sampleOn`, `dropRepeats*`, `withPrevious`, `merge`, `latestWhere`, `gate`, `catching`, `attempt`, `read`, `subscribe`, `hold` |
| `Screamer.Event` | `Event`, its instances, `changes`, `stepper`, `fold`, `tag`, `attach*`, `mapAccum`, `withPrevious`, `startWith`, `dropRepeats*`, `gate`, `oneOf`, `switchEvent`, `subscribe`, `hold` |
| `Screamer.Source` | `signalSource`, `eventSource`, `batch` |
| `Screamer.Owned` | `Owned`, `onCleanup`, `child`, `runOwned`, `onError` |
| `Screamer.Context` | `key`, `provide`, `ask`, `uniqueId` |
| `Screamer.Host` | the clock, timers and frames as a context value |
| `Screamer.Pending` | `pending`, `settled`: work in flight per scope |
| `Screamer.Runtime` | `readStats`, for leak checks |
| `Screamer.Runtime.Unsafe` | no PureScript API: its foreign module is the JavaScript API add-ons build nodes with |

Depends on: prelude, effect, control, either, maybe, tuples, exceptions, filterable, typelevel-prelude, unsafe-coerce.

The semantics are in [`docs/combinators.md`](../../docs/combinators.md) and [`docs/ownership-design.md`](../../docs/ownership-design.md). `test/core/` has the TypeScript tests of the runtime (`npm run test:core`).
