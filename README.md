# Screamer

Screamer is a PureScript library for building DOM interfaces without a virtual DOM. Signals describe values that change over time. Elements bind those signals to the DOM nodes they affect, so an update touches only those nodes.

```purescript
counter :: Element
counter = component do
  count <- liftEffect $ signalSource 0
  pure $ E.div_ [ A.class_ "counter" ]
    [ E.button_ [ H.onClick_ \_ -> count.modify (_ - 1) ] [ element "-" ]
    , E.span_ [] [ text (show <$> count.signal) ]
    , E.button_ [ H.onClick_ \_ -> count.modify (_ + 1) ] [ element "+" ]
    ]

main :: Effect Unit
main = void $ mount "main" counter
```

## Packages

One spago workspace, one version. An app depends on `screamer`, plus any add-ons it uses:

```yaml
package:
  dependencies:
    - screamer
    - screamer-combinators   # Time, Flatten, Event.Extra, Signal.Extra
    - screamer-resource      # Resource
```

| Package | Modules | For |
|---|---|---|
| [`screamer-reactive`](packages/screamer-reactive) | `Screamer.Signal`, `.Event`, `.Source`, `.Owned`, `.Context`, `.Host`, `.Pending`, `.Runtime` | the reactive core, with no DOM and no `web-*` dependency |
| [`screamer`](packages/screamer) | `Screamer`, `Screamer.Element`, `.Attribute`, `.Html`, `.Html.Attributes`, `.Html.Handlers`, `.Svg` | elements |
| [`screamer-combinators`](packages/screamer-combinators) | `Screamer.Event.Extra`, `.Signal.Extra`, `.Time`, `.Flatten` | more operators, timers and owned flattening |
| [`screamer-resource`](packages/screamer-resource) | `Screamer.Resource` | requests as signals |
| [`screamer-web`](packages/screamer-web) | `Screamer.Web.WebSocket` | browser subscriptions |
| [`screamer-router`](packages/screamer-router) | `Screamer.Router`, `.Router.Windrose` | the location as a signal |
| [`screamer-forms`](packages/screamer-forms) | `Screamer.Form` | formlets |
| [`screamer-test`](packages/screamer-test) | `Screamer.Test`, `.Test.Dom`, `.Test.Clock` | test helpers |

`npm run build` builds them all, `npm test` runs every package's tests, and [`CHANGELOG.md`](CHANGELOG.md) lists what moved.

### Installing from the release branch

The FFI is written in TypeScript, and `tsc` compiles each `.ts` to the `.js` beside it that spago builds against. Only the `release` branch commits that `.js`, so an app depends on a release tag, listing `screamer-reactive` and each add-on it uses:

```yaml
workspace:
  extraPackages:
    screamer-reactive:
      git: https://github.com/blankhart/purescript-screamer.git
      ref: v0.1.0
      subdir: packages/screamer-reactive
    screamer:
      git: https://github.com/blankhart/purescript-screamer.git
      ref: v0.1.0
      subdir: packages/screamer
```

### Releasing

1. `npm run set-version -- 0.2.0` sets the version in every `packages/*/spago.yaml` and in `package.json`. Commit that to master.
2. Run the **Release** workflow from the Actions tab with the same version. It runs `scripts/release.mjs`, which builds and tests, commits master's tree plus the compiled `.js` onto `release`, tags it `v0.2.0` and pushes both.

`npm run release -- 0.2.0` does the same locally, and pushes only with `--push`.

The examples are in `examples/src`. Run `npm run build:examples` to bundle them into `examples/output`, which also gets an `index.html` showing a gallery of them and the stylesheet from `examples/static`. `npm run serve` serves that page at http://localhost:8080/ (`npm run serve:rainbow` opens the rainbow spiral directly), and `npm run test:smoke` checks the examples in headless Chromium.

## How ownership works

**Signals are pure values.** `Signal a` is a value that changes over time. `map`, `apply`, `bind`, `sampleOn`, `sampleManyWith` and `dropRepeats` build new signals without touching the reactive graph. A derived signal connects to its sources only while something observes it, and it is garbage-collected like any other value when nothing refers to it. A signal propagates a change only when its value actually changes: by `Object.is`, or by `Eq` through `dropRepeats`.

**Stateful signals advance only while observed.** `merge` (`<|>`), `latestWhere`, `gate`, `withPrevious` and `history` keep state, as do `Event.fold` and `stepper`. That state starts from the seed when the first observer arrives, and it pauses when the last observer leaves. On resuming it starts again from the inputs' current values, and changes made while it was paused are not replayed.

**Sources are where change comes from.** `signalSource x` (in `Effect`, from `Screamer.Source`) gives `{ signal, put, modify }`. Writes made inside `batch` are delivered once, when the outermost batch returns.

**Events sit next to signals.** A signal always has a current value and drops a change equal to the last one. An `Event` (`Screamer.Event`, imported qualified) carries occurrences instead, such as clicks or messages, and delivers every one, in fire order, even repeats and several in one batch. `eventSource` (in `Effect`, from `Screamer.Source`) gives `{ event, fire }`, and a typed handler takes `fire` directly. `Event.fold`, `stepper`, `changes`, `tag`, `attachWith` and `Event.subscribe` connect events and signals. The semantics, and every combinator next to its RxJS counterpart, are in `docs/combinators.md`.

**Effects have owners.** Only effects (DOM bindings, `subscribe`, `hold`, `dyn`, `each`) are attached to the graph for as long as they live. Each one belongs to a scope. `Owned` is the monad for code that creates them: `Signal.subscribe`, `Signal.hold`, `Event.subscribe`, `Event.hold`, `onCleanup`, `child` and `onError` all run in a scope. Disposing a scope disposes its children, newest first, and then runs its own cleanups in reverse order.

**`component` runs setup once per instance.** `component :: Owned Element -> Element` runs its setup when the element is instantiated. Sources, timers and subscriptions created there belong to that instance, and they are released when the instance is removed: by `dyn` switching branches, by `each` dropping a row, or by unmounting.

**`mount` returns unmount.** `mount :: String -> Element -> Effect (Effect Unit)` renders into the first element matching the selector. The action it returns removes the nodes and disposes every effect the tree created.

**Subscriptions and resources are owned too.** `Screamer.Time` (`clock`, `interval`, `after`, `frames`), `Screamer.Web.WebSocket` (`connect`) and `Screamer.Router` (`location`, `navigate`, `link`) start when their scope runs and stop when it is disposed. `Router` only tracks the location; `Screamer.Router.Windrose` matches it with [windrose-router](https://github.com/blankhart/purescript-windrose-router), whose routes are a type, and the Router example builds its links the same way. `Screamer.Resource.resource` runs an `Aff` request for each value of an input signal and gives a `Signal (Remote b)`. When the input changes or the scope is disposed, the running request is killed, and its result is never shown.

**Context, Host and Pending.** `Screamer.Context` provides values to a scope and everything under it (`key`, `provide`, `ask`) and gives stable ids (`uniqueId`). `Screamer.Host` is the clock, timers and frames as a context value: `Screamer.Time` and `Resource.retry` use it, and a test can `withHost` a fake one and move time itself. `Screamer.Pending.settled` is true when no request is running anywhere under the current scope. See [`docs/ownership-design.md`](docs/ownership-design.md#context-host-and-pending).

**Typed DOM.** `Screamer.Html`, `Screamer.Html.Attributes`, `Screamer.Html.Handlers` and `Screamer.Svg` are generated from `codegen/data.ts` (run `npm run codegen:dom`). Attributes take either a plain value or a `Signal` of the right type, enumerated attributes take an ADT, `style_` takes a record checked against the known CSS properties, and event handlers receive the specific event type. Bubbling events are delegated to one listener per type on the document.

**Formlets.** `Screamer.Form` (in screamer-forms) builds forms the way Lumi Components' `FormBuilder` does. A `Form props i o` edits a state `i` and validates it into an `o`, and forms combine with `Applicative` (`ado` notation). `prop` focuses a form on one field of a record state, `indent` labels it, and `validated` checks it with a `Validator a b = a -> Either String b`, showing the message only once the field has been edited (its state is `Validated a`) or the form has been revealed. The fields are `textbox`, `password`, `number`, `checkbox` and `select`. `build` creates the state source in the current scope and returns the element, the `Signal (Either (Array String) o)` result, and `reveal` and `reset` actions. `wizard` shows a `Wizard`, a monad of `step`s, one step at a time. See `examples/src/Formlets.purs`.

The full specification, including the rules for ordering, errors and loops, is in `docs/ownership-design.md`.

**Embedding JS widgets.** A widget that owns its DOM subtree (an editor, a map, a chart) goes in `foreign_ setup tag attrs`, which creates the host element and runs `setup host :: Owned Unit` once per instance. Create the widget there and destroy it in `onCleanup`. Sync both ways with guards: push a signal in with `subscribe`, skipping values equal to what the widget already shows so the user's edits do not loop back; report the widget's own changes out through a callback wrapped in `batch`, ignoring changes the wrapper made itself. Screamer never touches the host's children. `foreignWithFallback_` adds children shown where the widget cannot run, such as on a server renderer, whose backend is not interactive. See `examples/src/CodeMirror.purs`.

## Combinators

Most RxJS operators have a counterpart, pure where it can be and `Owned` where it starts timers or requests. The common ones:

| RxJS | Screamer |
|---|---|
| `map`, `filter`, `scan` | `map`, `filter`, `Event.fold` / `Event.mapAccum` |
| `distinctUntilChanged` | `Event.dropRepeats` (signals drop repeats already) |
| `merge`, `combineLatest`, `withLatestFrom` | `<\|>` / `Event.oneOf`, `ado` / `Signal.Extra.combine`, `Event.attachWith` |
| `switchMap`, `mergeMap`, `concatMap`, `exhaustMap` | `Resource.resourceWith` / `request` with `Switch`, `Merge`, `Concat`, `Exhaust`; `Flatten.switchOwned` etc. for owned inner work |
| `debounceTime`, `throttleTime`, `delay` | `Time.debounce`, `Time.throttle`, `Time.delay` (`Owned`) |
| `catchError`, `retry` | `Signal.catching`, `Resource.retry` |
| `share`, `shareReplay(1)` | bind once with `let`; `hold` / `Event.hold` |

`examples/src/Typeahead.purs` uses them together: a debounced, deduplicated query sent with `resourceWith Switch` and `retry`, results kept on screen with `keepLast` while the next ones load, and keyboard selection as a held `Event.fold`. The full list, with semantics, is in [`docs/combinators.md`](docs/combinators.md).

## Migrating from the observable API

| Before | Now |
|---|---|
| `Screamer.Observable` | `Screamer.Signal` (pure signals) and `Screamer.Source` (`signalSource`, `batch`) |
| `Screamer.Channel`, `Channel`, `channel` | `Screamer.Source`, `SignalSource`, `signalSource` |
| `get` | `read` |
| `elements_` | `each key` (keyed rows, each row receives a `Signal` of its item) |
| `distinct`, `nonequal` | `dropRepeats` (or nothing: every signal already cuts off by `Object.is`) |
| `a <> b` on signals, meaning "the latest of the two" | `a <|> b` (`<>` now combines the values: `append <$> a <*> b`) |
| `Signal (Effect a)` for dynamic content | `dyn` over a signal of elements, with `component` for per-instance setup |
| `emit` | keep the action in a `Ref`, or `put` to a signal source |
| `S.mount` returning `Unit` | `mount` returning the unmount action |
| `Screamer.DOM.Event` | the `Web.*` event types, passed to handlers directly |

### Renamed modules

Nothing is called `Core` any more, the two source modules are one, and the generated modules are named for what they contain. `import Screamer` brings in what most components need: `Element`, `text`, `dyn`, `each`, `component`, `mount`, the `Signal` and `Event` types, `signalSource`, `eventSource`, `batch`, `Owned`, `onCleanup` and `liftEffect`.

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
| `Screamer.Subscriptions.WebSocket` | `Screamer.Web.WebSocket` (screamer-web) |
| `Screamer.Subscriptions.Router` | `Screamer.Router` (screamer-router) |
| `Screamer.Examples.Formlet` | `Screamer.Form` (screamer-forms) |
| attributes in `Screamer.Element` | `Screamer.Attribute` |
| `Event.take`, `zip`, `race`, buffering, …; `Signal.combine`, `withLatest`, `history`, `switchLatest` | `Screamer.Event.Extra`, `Screamer.Signal.Extra` (screamer-combinators) |

### Signal and Event alignment

| Before | Now |
|---|---|
| `Signal.fold f seed s` | `Event.fold f seed (Event.changes s)`: accumulation is over events |
| `Owned.subscribe`, `Owned.hold` | `Signal.subscribe`, `Signal.hold`, next to `Event.subscribe`, `Event.hold` |
| `Signal.filter` | `Signal.latestWhere` |
| `Signal.filterOn` | `Signal.gate` |
| `Subscriptions.Timer.every` | `Time.clock :: Milliseconds -> Owned (Signal Instant)` |
| `Subscriptions.Timer.after ms action` | `Time.after ms :: Owned (Event Unit)`, then `Event.subscribe` |
| (new) | `Time.interval :: Milliseconds -> Owned (Event Unit)` |
| `Subscriptions.AnimationFrame.frames`, `.every` | `Time.frames :: Owned (Event Number)` |
| `Time.debounced` | `Time.debounceSignal` |
| `WebSocket` `message`, `Message` | `messages :: Event String` (with `Event.stepper` for the latest) |

## Background

Efficient JS frameworks trace state changes to the view changes they cause, and then mutate only the affected sections of the DOM. Virtual DOM frameworks instead build a parallel representation of the DOM from the new state, diff it against the previous one, and apply the differences as patches. See [You Might Not Need The Virtual DOM](https://blog.functorial.com/posts/2018-03-12-You-Might-Not-Need-The-Virtual-DOM.html), and [`purescript-halogen-vdom`](https://github.com/purescript-halogen/purescript-halogen-vdom) and [`purescript-sdom`](https://github.com/paf31/purescript-sdom) for the two approaches in PureScript.

## History

Screamer first rendered through [sinuous](https://github.com/luwes/sinuous). There, a node's owner was whatever computation happened to be running when the node was created. Derived signals went stale, observers leaked, `merge` stopped listening, and nothing could be unmounted. The reactive core is now Screamer's own (`packages/screamer-reactive/src/Screamer/Runtime.ts`). `docs/ownership-design.md` records the redesign and the deviations from its specification. The rainbow spiral example is a port of [sinuous-rainbow-spiral](https://github.com/luwes/sinuous-rainbow-spiral), and `bench/` drives the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) operations.

## References

### Component-local state

* [purescript-hertz]()
* [purescript-halogen]()
* [purescript-react-basic]()

### Elm-likes

* [purescript-hedwig]()
* [miso]()

### Reactivity

* [purescript-flare](https://github.com/sharkdp/purescript-flare) ([tutorial](https://david-peter.de/articles/flare/))
* [purescript-signal]() and [purescript-signal-loop](https://github.com/paf31/purescript-signal-loop/blob/master/src/Signal/Loop.purs)
* [reflex-dom]()
* [reactive-banana]()
* [hyperactiv]()
* [S.js]()

### Markup

* [purescript-smolder](https://github.com/bodil/purescript-smolder) and [purescript-smolder-dom](https://pursuit.purescript.org/packages/purescript-smolder-dom)
