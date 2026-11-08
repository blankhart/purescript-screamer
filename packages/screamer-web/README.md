# screamer-web

Browser sources as owned signals: each starts its listener or observer when its scope runs, removes it when the scope is disposed, and writes in `batch`. Each reads browser globals only while it is set up, so the modules load in Node, and checks `Screamer.Renderer.interactive` first: under a backend that is not interactive (a server renderer) it creates nothing and holds the value in the last column.

| Module | What it has | When not interactive |
|---|---|---|
| `Screamer.Web.Storage` | `localStorage key default`, `sessionStorage key default :: Owned (SignalSource String)`: writes persist, and the `storage` event from other tabs updates the signal | holds the default; writes are dropped |
| `Screamer.Web.MediaQuery` | `matches :: String -> Owned (Signal Boolean)`; `matchesNow :: String -> Effect Boolean` reads it once, with no listener | `false` |
| `Screamer.Web.Observers` | `resize :: Element -> Owned (Signal { width, height })` (`ResizeObserver`), `intersecting :: Element -> Owned (Signal Boolean)` (`IntersectionObserver`) | `{ width: 0, height: 0 }` / `false`; no observer is created |
| `Screamer.Web.Page` | `visible` (`visibilitychange`), `online` (`online`/`offline`) `:: Owned (Signal Boolean)` | `true` / `true` |
| `Screamer.Web.WebSocket` (was `Screamer.Subscriptions.WebSocket`) | `connect :: String -> Owned Socket`, with `state`, `messages` and `send`; `connectWith` adds reconnection and `opened`; both close on disposal | opens nothing; `state` stays `Connecting` and `send` is dropped |

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

### Reconnecting WebSockets

`WebSocket.connect` keeps its one-connection behavior, including queuing sends
while initially connecting. For a long-lived connection, use
`WebSocket.connectWith WebSocket.defaultReconnectOptions url` in `Owned`:

```purescript
socket <- WebSocket.connectWith WebSocket.defaultReconnectOptions url
Event.subscribe socket.opened \_ -> socket.send "subscribe:updates"
Event.subscribe socket.messages handleMessage
```

The returned `state`, `messages`, `opened`, and `send` remain stable across
attempts. Every text message is delivered, including repeats. `opened` fires
once for each successful connection, so applications can restore their server
subscriptions. **This API drops sends whenever the socket is not open**;
it never queues or replays application messages.

`ReconnectState` distinguishes `ConnectingAttempt Int`, `Connected`,
`Reconnecting { attempt, nextAt, close }`, `Disconnected CloseInfo`, and
`ConnectionFailed Error`. Attempt zero is the initial connection; retries
count consecutive failures and reset after a successful open. `CloseInfo`
contains the browser's `code`, `reason`, and `wasClean`. `nextAt` is measured
in milliseconds on the owning context's `Host.now` clock.

Defaults retry closes other than normal closure (code 1000), starting after
1 second, doubling up to 30 seconds. Set `shouldReconnect` to interpret your
server's application close codes. Set `reconnect: Nothing` to disable retries.
`reconnectPolicy (Milliseconds initial) (Milliseconds max)` returns an
`Either BackoffError ReconnectPolicy`; delays must be finite and positive,
with `max >= initial`. Put a successful policy in `reconnect: Just policy`.
WebSocket constructor failures become terminal `ConnectionFailed` values
instead of entering an endless retry loop.

With `retryOnOnline: true`, a transition to online or visible accelerates an
already pending retry and cancels its timer. Initial Page values do not retry;
simultaneous transitions start at most one attempt. Connected, connecting, and
terminal sockets ignore these transitions. This option does not forcibly
replace an open socket or infer connectivity from page visibility.

Backoff runs through `Screamer.Host`, so `withHost` and `fakeHost` can drive it
in tests. Disposal cancels pending timers, removes socket/Page listeners, and
closes the current socket. Late callbacks from obsolete attempts are ignored.
After disposal, retained streams stop publishing and sends are dropped. Under
a non-interactive renderer, no browser resources are acquired and state stays
`ConnectingAttempt 0`.
