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

The examples are in `examples/src`. Run `npm run build:examples` to bundle them, and `npm run test:smoke` to check them in headless Chromium.

## How ownership works

**Signals are pure values.** `Signal a` is a value that changes over time. `map`, `apply`, `bind`, `sampleOn`, `sampleManyWith` and `dropRepeats` build new signals without touching the reactive graph. A derived signal connects to its sources only while something observes it, and it is garbage-collected like any other value when nothing refers to it. A signal propagates a change only when its value actually changes: by `Object.is`, or by `Eq` through `dropRepeats`.

**Stateful signals advance only while observed.** `fold`, `merge`, `filter` and `filterOn` keep state. That state starts from the seed when the first observer arrives, and it pauses when the last observer leaves. On resuming it starts again from the inputs' current values, and changes made while it was paused are not replayed.

**Sources are where change comes from.** `signalSource x` (in `Effect`, from `Screamer.SignalSource`) gives `{ signal, put, modify }`. Writes made inside `batch` are delivered once, when the outermost batch returns.

**Events sit next to signals.** A signal always has a current value and drops a change equal to the last one. An `Event` (`Screamer.Event`, imported qualified) carries occurrences instead, such as clicks or messages, and delivers every one, in fire order, even repeats and several in one batch. `eventSource` (in `Effect`, from `Screamer.EventSource`) gives `{ event, fire }`, and a typed handler takes `fire` directly. `Event.fold`, `stepper`, `changes`, `tag`, `attachWith` and `Event.subscribe` connect events and signals. The semantics, and every combinator next to its RxJS counterpart, are in `docs/combinators.md`.

**Effects have owners.** Only effects (DOM bindings, `subscribe`, `hold`, `dyn`, `each`) are attached to the graph for as long as they live. Each one belongs to a scope. `Owned` is the monad for code that creates them: `subscribe`, `hold`, `onCleanup`, `child` and `onError` all run in a scope. Disposing a scope disposes its children, newest first, and then runs its own cleanups in reverse order.

**`component` runs setup once per instance.** `component :: Owned Element -> Element` runs its setup when the element is instantiated. Sources, timers and subscriptions created there belong to that instance, and they are released when the instance is removed: by `dyn` switching branches, by `each` dropping a row, or by unmounting.

**`mount` returns unmount.** `mount :: String -> Element -> Effect (Effect Unit)` renders into the first element matching the selector. The action it returns removes the nodes and disposes every effect the tree created.

**Subscriptions and resources are owned too.** `Screamer.Subscriptions.Timer` (`every`, `after`), `AnimationFrame` (`frames`, `every`), `WebSocket` (`connect`) and `Router` (`location`, `navigate`, `link`) start when their scope runs and stop when it is disposed. `Screamer.Resource.resource` runs an `Aff` request for each value of an input signal and gives a `Signal (Remote b)`. When the input changes or the scope is disposed, the running request is killed, and its result is never shown.

**Typed DOM.** `Screamer.DOM.Element`, `Attribute`, `EventHandler` and `Svg` are generated from `codegen/data.ts` (run `npm run codegen:dom`). Attributes take either a plain value or a `Signal` of the right type, enumerated attributes take an ADT, `style_` takes a record checked against the known CSS properties, and event handlers receive the specific event type. Bubbling events are delegated to one listener per type on the document.

**Formlets.** `Screamer.Formlet` builds forms the way Lumi Components' `FormBuilder` does. A `Form props i o` edits a state `i` and validates it into an `o`, and forms combine with `Applicative` (`ado` notation). `prop` focuses a form on one field of a record state, `indent` labels it, and `validated` checks it with a `Validator a b = a -> Either String b`, showing the message only once the field has been edited (its state is `Validated a`) or the form has been revealed. The fields are `textbox`, `password`, `number`, `checkbox` and `select`. `build` creates the state source in the current scope and returns the element, the `Signal (Either (Array String) o)` result, and `reveal` and `reset` actions. `wizard` shows a `Wizard`, a monad of `step`s, one step at a time. See `examples/src/Formlets.purs`.

The full specification, including the rules for ordering, errors and loops, is in `docs/ownership-design.md`.

## Migrating from the observable API

| Before | Now |
|---|---|
| `Screamer.Observable` | `Screamer.Signal` (pure signals) and `Screamer.SignalSource` (`signalSource`, `batch`) |
| `Screamer.Channel`, `Channel`, `channel` | `Screamer.SignalSource`, `SignalSource`, `signalSource` |
| `get` | `read` |
| `elements_` | `each key` (keyed rows, each row receives a `Signal` of its item) |
| `distinct`, `nonequal` | `dropRepeats` (or nothing: every signal already cuts off by `Object.is`) |
| `a <> b` on signals, meaning "the latest of the two" | `a <|> b` (`<>` now combines the values: `append <$> a <*> b`) |
| `Signal (Effect a)` for dynamic content | `dyn` over a signal of elements, with `component` for per-instance setup |
| `emit` | keep the action in a `Ref`, or `put` to a signal source |
| `S.mount` returning `Unit` | `mount` returning the unmount action |
| `Screamer.DOM.Event` | the `Web.*` event types, passed to handlers directly |

## Background

Efficient JS frameworks trace state changes to the view changes they cause, and then mutate only the affected sections of the DOM. Virtual DOM frameworks instead build a parallel representation of the DOM from the new state, diff it against the previous one, and apply the differences as patches. See [You Might Not Need The Virtual DOM](https://blog.functorial.com/posts/2018-03-12-You-Might-Not-Need-The-Virtual-DOM.html), and [`purescript-halogen-vdom`](https://github.com/purescript-halogen/purescript-halogen-vdom) and [`purescript-sdom`](https://github.com/paf31/purescript-sdom) for the two approaches in PureScript.

## History

Screamer first rendered through [sinuous](https://github.com/luwes/sinuous). There, a node's owner was whatever computation happened to be running when the node was created. Derived signals went stale, observers leaked, `merge` stopped listening, and nothing could be unmounted. The reactive core is now Screamer's own (`src/Screamer/Reactive/Core.ts`). `docs/ownership-design.md` records the redesign and the deviations from its specification. The rainbow spiral example is a port of [sinuous-rainbow-spiral](https://github.com/luwes/sinuous-rainbow-spiral), and `bench/` drives the [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) operations.

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
