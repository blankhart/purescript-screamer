# Changelog

All the packages in `packages/` share one version.

## Unreleased

The minimal core and official add-ons refactor (#44).

### Renamed modules (#45)

| Before | Now |
|---|---|
| `Screamer.Reactive.Core` | `Screamer.Runtime` |
| `Screamer.Core` | `Screamer.Element` |
| `Screamer.SignalSource`, `Screamer.EventSource` | `Screamer.Source` |
| `Screamer.DOM.Element` | `Screamer.Html` |
| `Screamer.DOM.Attribute` | `Screamer.Html.Attributes` |
| `Screamer.DOM.EventHandler` | `Screamer.Html.Handlers` |
| `Screamer.DOM.Svg` | `Screamer.Svg` |
| `Screamer.Internal` | removed (unused) |

`import Screamer` is a prelude with what most components need.

### Signal and Event alignment (#46)

| Before | Now |
|---|---|
| `Signal.fold f seed s` | `Event.fold f seed (Event.changes s)` |
| `Owned.subscribe`, `Owned.hold` | `Signal.subscribe`, `Signal.hold` |
| `Signal.filter` | `Signal.latestWhere` |
| `Signal.filterOn` | `Signal.gate` |
| `Subscriptions.Timer.every` | `Time.clock` |
| `Subscriptions.Timer.after ms action` | `Time.after ms`, then `Event.subscribe` |
| `Subscriptions.AnimationFrame` | `Time.frames` |
| `Time.debounced` | `Time.debounceSignal` |
| WebSocket `message`, `Message` | `messages :: Event String` |

`Time.interval` is new.

### Runtime (#47)

The runtime keeps only node kinds; combinators built from them moved to the foreign modules of `Screamer.Signal` and `Screamer.Event`. `Screamer.Runtime.Unsafe` is the JavaScript API for add-on FFI.

### Context, Host and Pending (#48)

- New: `Screamer.Context` (`key`, `provide`, `ask`, `uniqueId`), `Screamer.Host` (`Host`, `browserHost`, `host`, `withHost`), `Screamer.Pending` (`pending`, `settled`).
- `Screamer.Time` uses the scope's host instead of global timers.
- `Resource.retry :: RetryPolicy -> (a -> Aff b) -> Owned (a -> Aff b)` (was `-> a -> Aff b`); its waits use the host.
- `resource`, `resourceWith` and `request` register each running request with `Pending`.

### Packages (#49)

One workspace, split into `screamer-reactive` (no `web-*`), `screamer`, and the add-ons `screamer-combinators`, `screamer-resource`, `screamer-web`, `screamer-router`, `screamer-forms` and `screamer-test`. Moved and renamed:

| Before | Now | Package |
|---|---|---|
| `Event.take`, `skip`, `takeWhile`, `skipWhile`, `first`, `count`, `leftmost`, `mergeWith`, `zip`, `zipWith`, `race`, `bufferCount`, `bufferOn`, `bufferWhile` | `Screamer.Event.Extra` | screamer-combinators |
| `Signal.history`, `combine`, `withLatest`, `switchLatest` | `Screamer.Signal.Extra` | screamer-combinators |
| `Screamer.Element` (`Attribute`, `property`, `attribute`, `booleanAttribute`, `styleProperty`, `attributes`, `on_`, `unsafeOn_`, `AttrValue`) | `Screamer.Attribute` | screamer |
| `Screamer.Subscriptions.WebSocket` | `Screamer.Web.WebSocket` | screamer-web |
| `Screamer.Subscriptions.Router` | `Screamer.Router` | screamer-router |
| windrose glue in `examples/src/Router.purs` | `Screamer.Router.Windrose` (`matchHash`, `matchPath`) | screamer-router |
| `Screamer.Examples.Formlet` | `Screamer.Form` | screamer-forms |
| `test/Test/Observe`, `DomHelpers`, `Fakes`, `setup-dom.mjs` | `Screamer.Test`, `Screamer.Test.Dom`, `Screamer.Test.Clock`, `packages/screamer-test/setup-dom.mjs` | screamer-test |
