# screamer-web

Browser sources as owned signals: each starts its listener or observer when its scope runs, removes it when the scope is disposed, and writes in `batch`. Each reads browser globals only while it is set up, so the modules load in Node, and checks `Screamer.Renderer.interactive` first: under a backend that is not interactive (a server renderer) it creates nothing and holds the value in the last column.

| Module | What it has | When not interactive |
|---|---|---|
| `Screamer.Web.Storage` | `localStorage key default`, `sessionStorage key default :: Owned (SignalSource String)`: writes persist, and the `storage` event from other tabs updates the signal | holds the default; writes are dropped |
| `Screamer.Web.MediaQuery` | `matches :: String -> Owned (Signal Boolean)`; `matchesNow :: String -> Effect Boolean` reads it once, with no listener | `false` |
| `Screamer.Web.Observers` | `resize :: Element -> Owned (Signal { width, height })` (`ResizeObserver`), `intersecting :: Element -> Owned (Signal Boolean)` (`IntersectionObserver`) | `{ width: 0, height: 0 }` / `false`; no observer is created |
| `Screamer.Web.Page` | `visible` (`visibilitychange`), `online` (`online`/`offline`) `:: Owned (Signal Boolean)` | `true` / `true` |
| `Screamer.Web.WebSocket` (was `Screamer.Subscriptions.WebSocket`) | `connect :: String -> Owned Socket`, with `state`, `messages` and `send`; it closes when its scope is disposed | opens nothing; `state` stays `Connecting` and `send` is dropped |

Depends on: screamer (for `Screamer.Renderer.interactive`), screamer-reactive.

### Page transitions

`Page.online` and `Page.visible` return signals. `Signal.subscribe` calls back
immediately with the current value, then on updates. Subscribing to both with a
retry callback can therefore retry twice during setup. Use `Event.changes` when
the effect should run only on transitions:

```purescript
import Screamer.Event as Event
import Screamer.Web.Page as Page

-- Inside an Owned action; retry :: Effect Unit.
online <- Page.online
Event.subscribe (Event.changes online) \isOnline -> when isOnline retry
```

The same pattern applies to `Page.visible`. It skips each signal's initial
value, but separate online and visibility transitions still produce separate
callbacks. A shared retry action should ignore requests while already
connecting or connected, and cancel any pending backoff before retrying.

The tests run under jsdom (`test/Test/Sources.purs`, with stubs for `matchMedia` and the observers) and, for the non-interactive behaviour, in plain Node with no DOM (`test/Test/Web/Node.purs`, run by `scripts/test-purs.mjs`).
