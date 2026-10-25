# Screamer

Screamer is a PureScript library for building DOM interfaces without a virtual DOM. Signals describe values that change over time. Elements bind those signals to the DOM nodes they affect, so an update touches only those nodes.

```purescript
counter :: Element
counter = component do
  count <- liftEffect $ signalSource 0
  pure $ E.div_ [ A.class_ "counter" ]
    [ E.button_ [ H.onClick_ \_ -> count.modifyT1 (_ - 1) ] [ element "-" ]
    , E.span_ [] [ text (show <$> count.signal) ]
    , E.button_ [ H.onClick_ \_ -> count.modifyT1 (_ + 1) ] [ element "+" ]
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

`npm run build` builds them all, and `npm test` runs every package's tests.

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

The examples are in `examples/src`. Run `npm run build:examples` to compile them, optimize the compiled code with [purs-backend-optimizer](https://github.com/aristanetworks/purescript-backend-optimizer) (into `output-es`), and bundle each one with esbuild into `examples/output`, which also gets an `index.html` showing a gallery of them and the stylesheet from `examples/static`. `npm run serve` serves that page at http://localhost:8080/ (`npm run serve:rainbow` opens the rainbow spiral directly), and `npm run test:smoke` checks the examples in headless Chromium.

## How ownership works

**Signals are pure values.** `Signal a` is a value that changes over time. `map`, `apply`, `bind`, `sampleOn`, `sampleManyWith` and `dropRepeats` build new signals without touching the reactive graph. A derived signal connects to its sources only while something observes it, and it is garbage-collected like any other value when nothing refers to it. A signal propagates a change only when its value actually changes: by `Object.is`, or by `Eq` through `dropRepeats`.

**State is created in `Owned`.** `merge`, `latestWhere`, `gate`, `withPrevious` and `history` keep state, as do `Event.fold`, `stepper`, `take` and the other operators that remember past occurrences. Each returns `Owned`, as in `count <- Event.fold (+) 0 clicks`: its state starts from the seed when the action runs, it belongs to the current scope, and it steps for the scope's whole life, whether or not anything displays it, until the scope is disposed. Because state does not depend on who observes it, every signal and event is a plain value that can be shared or inlined without changing what a program does, and a pure function such as the one given to `>>=` can only refer to state that already exists.

**Sources are where change comes from.** `signalSource x` (in `Effect`, from `Screamer.Source`) gives `{ signal, readT1, putT1, modifyT1 }`. Names that read or write say which timestep they act on: T0 is the current one, T1 the next. `readT0` reads a signal's value in the current timestep; `putT1` and `modifyT1` take effect when the next one starts, and `readT1` gives the value it will start with. Writes made inside `batch` (an event handler is one) are delivered together, when the outermost batch returns.

**Events sit next to signals.** A signal always has a current value and drops a change equal to the last one. An `Event` (`Screamer.Event`, imported qualified) carries occurrences instead, such as clicks or messages, and delivers every one, in fire order, even repeats and several in one batch. `eventSource` (in `Effect`, from `Screamer.Source`) gives `{ event, fireT1 }`, and a typed handler takes `fireT1` directly. `Event.fold`, `stepper`, `changes`, `tag`, `attachWith` and `Event.subscribe` connect events and signals.

**Effects have owners.** Only effects (DOM bindings, `subscribe`, `hold`, stateful nodes, `dyn`, `each`) are attached to the graph for as long as they live. Each one belongs to a scope. `Owned` is the monad for code that creates them: `Signal.subscribe`, `Signal.hold`, `Event.subscribe`, `Event.hold`, `onCleanup`, `child` and `onError` all run in a scope. Disposing a scope disposes its children, newest first, and then runs its own cleanups in reverse order.

**`component` runs setup once per instance.** `component :: Owned Element -> Element` runs its setup when the element is instantiated. Sources, timers and subscriptions created there belong to that instance, and they are released when the instance is removed: by `dyn` switching branches, by `each` dropping a row, or by unmounting.

**`mount` returns unmount.** `mount :: String -> Element -> Effect (Effect Unit)` renders into the first element matching the selector. The action it returns removes the nodes and disposes every effect the tree created.

**Subscriptions and resources are owned too.** `Screamer.Time` (`clock`, `interval`, `after`, `frames`), `Screamer.Web.WebSocket` (`connect`) and `Screamer.Router` (`location`, `navigate`, `link`) start when their scope runs and stop when it is disposed. `Router` only tracks the location; `Screamer.Router.Windrose` matches it with [windrose-router](https://github.com/blankhart/purescript-windrose-router), whose routes are a type, and the Router example builds its links the same way. `Screamer.Resource.resource` runs an `Aff` request for each value of an input signal and gives a `Signal (Remote b)`. When the input changes or the scope is disposed, the running request is killed, and its result is never shown.

**Context, Host and Pending.** `Screamer.Context` provides values to a scope and everything under it (`provide` and `ask`, with keys named by types through `ContextKey`) and gives stable ids (`uniqueId`). `Screamer.Host` is the clock, timers and frames as a context value: `Screamer.Time` and `Resource.retry` use it, and a test can `withHost` a fake one and move time itself. `Screamer.Pending.settled` is true when no request is running anywhere under the current scope.

**Typed DOM.** `Screamer.Html`, `Screamer.Html.Attributes`, `Screamer.Html.Handlers` and `Screamer.Svg` are generated from `codegen/data.ts` (run `npm run codegen:dom`). Attributes take either a plain value or a `Signal` of the right type, enumerated attributes take an ADT, `style_` takes a record checked against the known CSS properties, and event handlers receive the specific event type. Bubbling events are delegated to one listener per type on the document.

**Formlets.** `Screamer.Form` (in screamer-forms) builds forms the way Lumi Components' `FormBuilder` does. A `Form props i o` edits a state `i` and validates it into an `o`, and forms combine with `Applicative` (`ado` notation). `prop` focuses a form on one field of a record state, `indent` labels it, and `validated` checks it with a `Validator a b = a -> Either String b`, showing the message only once the field has been edited (its state is `Validated a`) or the form has been revealed. The fields are `textbox`, `password`, `number`, `checkbox` and `select`. `build` creates the state source in the current scope and returns the element, the `Signal (Either (Array String) o)` result, and `reveal` and `reset` actions. `wizard` shows a `Wizard`, a monad of `step`s, one step at a time. See `examples/src/Formlets.purs`.

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

`examples/src/Typeahead.purs` uses them together: a debounced, deduplicated query sent with `resourceWith Switch` and `retry`, results kept on screen with `keepLast` while the next ones load, and keyboard selection as a held `Event.fold`.

## Migrating from the observable API

| Before | Now |
|---|---|
| `Screamer.Observable` | `Screamer.Signal` (pure signals) and `Screamer.Source` (`signalSource`, `batch`) |
| `Screamer.Channel`, `Channel`, `channel` | `Screamer.Source`, `SignalSource`, `signalSource` |
| `get` | `readT0` |
| `elements_` | `each key` (keyed rows, each row receives a `Signal` of its item) |
| `distinct`, `nonequal` | `dropRepeats` (or nothing: every signal already cuts off by `Object.is`) |
| `a <> b` on signals, meaning "the latest of the two" | `a <|> b` (`<>` now combines the values: `append <$> a <*> b`) |
| `Signal (Effect a)` for dynamic content | `dyn` over a signal of elements, with `component` for per-instance setup |
| `emit` | keep the action in a `Ref`, or `putT1` to a signal source |
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

## References

* The rainbow spiral example is a port of [sinuous-rainbow-spiral](https://github.com/luwes/sinuous-rainbow-spiral).

* `bench/` runs the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) operations, measured as upstream measures them, against Screamer and upstream's VanillaJS, Solid and Halogen apps (`npm run bench:measure`; results in `bench/results/summary.md`). Absolute times depend on the machine, so compare frameworks within one run rather than against upstream's published tables. `bench/legacy/` holds earlier Screamer-only results from a cold-start harness that is not comparable.
