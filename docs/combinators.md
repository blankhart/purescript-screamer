# Events, sources and combinators

_Decided in #17, part of the combinator plan in #16. This file is authoritative for the event model and for combinator names; `docs/ownership-design.md` remains authoritative for signals, ownership and the reactive core, and links here._

Screamer has two kinds of stream:

- **`Signal a`**: a value that changes over time. It always has a current value, and it propagates only when that value changes (`Object.is`, or `Eq` through `dropRepeats`). Use it for state.
- **`Event a`**: occurrences at moments. It has no current value and no cutoff. Every occurrence propagates, including one equal to the last and several in the same batch. Use it for things that happen: clicks, key presses, messages, completed requests.

Before this decision, occurrences were encoded as signals. That loses information in two ways. An occurrence equal to the previous one is cut off, which is why `WebSocket.Message` carries an `index`. And two writes in one batch step a `fold` once, so `Draggable` folds over one pointer event when a handler delivers two. Operators that count or queue occurrences (`zip`, `take`, `bufferCount`, `concatMap`) have no meaning on a signal at all.

## Sources

Change enters the graph through two kinds of source, both created in `Effect` and neither needing an owner:

```purescript
-- Screamer.Source (formerly Screamer.Channel, then two modules until #45)
type SignalSource a = { signal :: Signal a, put :: a -> Effect Unit, modify :: (a -> a) -> Effect Unit }
signalSource :: forall a. a -> Effect (SignalSource a)
batch        :: forall a. Effect a -> Effect a

-- Screamer.Source, event sources (#18)
type EventSource a = { event :: Event a, fire :: a -> Effect Unit }
eventSource :: forall a. Effect (EventSource a)
```

`put` replaces a value; `fire` adds an occurrence. Both follow the write rules in `docs/ownership-design.md`: allowed in handlers, `subscribe` callbacks and `component` setup, rejected inside derivations. `Screamer.Source` exports both kinds and `batch`.

A typed DOM handler already takes `e -> Effect Unit`, so an event source plugs into it with no new DOM API:

```purescript
clicks <- liftEffect eventSource
let count = Event.fold (\_ n -> n + 1) 0 clicks.event
pure $ E.button_ [ H.onClick_ clicks.fire ] [ text (show <$> count) ]
```

## Event semantics

**Rounds.** A propagation round is one pass of the flush loop: the end of the outermost `batch` (an `on_` handler is one), or a write outside any batch, and then each further round that writes from `subscribe` callbacks queue. An event's occurrences belong to the round in which they were fired.

**Many occurrences per round.** Within a round an event carries a list of occurrences, in fire order. Every combinator handles the whole list: `map` maps each, `filter` keeps some, `fold` steps once per occurrence in order, `stepper` takes the last, and `Event.subscribe` calls its callback once per occurrence. The effect node behind a subscription still runs at most once per round, so the "an effect runs at most once per batch" guarantee holds for nodes; only the user callback runs several times.

**Order across events.** Each `fire` is stamped with a global counter. Combinators that take one occurrence from another (`map`, `filter`, `tag`, `attachWith`) keep its stamp. `a <|> b` interleaves the occurrences of both inputs by stamp, so it delivers them in the order they were fired, losing none. Occurrences of `changes s` are stamped at the start of the round's propagation, after every fire of the round. Equal stamps go left first. Ordering by stamp makes `<|>` associative with `empty` (an event that never fires) as its identity.

This differs from `<|>` on signals, which keeps the left value when both change in one batch. A signal has one value per round, so one input must win. An event has no such limit, so nothing is dropped. For left-wins behaviour, `leftmost :: Array (Event a) -> Event a` keeps only the occurrences of the leftmost input that fired in the round (#20).

**Laziness and purity.** `Event` is a pure value, like `Signal`. Building one has no effect on the graph. An event links to its sources only while something observes it, and occurrences fired while nothing observes it go nowhere. Two evaluations of the same event expression see the same occurrences over the same interval.

**Retention.** A round's occurrences are kept until that round's effects have run, then dropped. A stateful node records the last round it consumed, so it steps over each round once, however many targets read it.

**Stateful nodes over events pause.** `Event.fold`, `stepper` and the counting and queueing combinators (#19, #20) follow the signal rules. They start from the seed when first observed, step only while observed, and keep their state when the last observer leaves. Unlike a stateful signal they do not resynchronize on return, because an event has no current value to resynchronize with: occurrences fired while paused are simply missed. Use `Signal.hold` or `Event.hold` to keep one observing for a scope's lifetime. Every operator that keeps state is marked **pauses** below.

## Naming

A `Signal` says what is true now; an `Event` says what happened. Operators that exist on both types follow one convention:

- **Same name, same meaning.** `map`, `subscribe`, `hold`, `dropRepeats`, `withPrevious`, `gate` and `<|>` mean the same thing on both types, adjusted only for what each type is (an event's `gate` drops occurrences; a signal's `gate` holds its last value).
- **Different shape, different name.** When the signal version has a different shape, it gets its own name instead of borrowing the event's. `Event.filter` drops occurrences; a signal cannot drop its value, so the signal version that keeps the last value that passed is `Signal.latestWhere`.
- **Different input type only, `Signal` suffix.** When the two do the same thing and differ only in taking a `Signal` instead of an `Event`, the event version keeps the plain name and the signal version takes a `Signal` suffix: `Time.debounce` and `Time.debounceSignal`.

## If you are accumulating, you are holding an event

There is no `Signal.fold`. A fold counts or collects things that happened, so its input is an event. When the things that happened are a signal's changes, say so with `Event.changes`:

```purescript
-- Before
let count = Signal.fold (\_ n -> n + 1) 0 clicks.signal

-- After: fold the event, or the signal's changes
let count = Event.fold (\_ n -> n + 1) 0 clicks.event
let count = Event.fold (\_ n -> n + 1) 0 (Event.changes clicks.signal)
```

The result is still a `Signal`, the state the occurrences built up. Accumulating over a signal's changes is the same as `Signal.fold` was while observed: one step per round in which the signal changed. The difference is on resuming after a pause, where the event fold misses the changes made meanwhile instead of resynchronizing.

## Bridges between signals and events

```purescript
-- Screamer.Event (#18)
changes    :: forall a. Signal a -> Event a                    -- one occurrence per round in which the value changed
stepper    :: forall a. a -> Event a -> Signal a               -- the latest occurrence; pauses
fold       :: forall a b. (a -> b -> b) -> b -> Event a -> Signal b  -- one step per occurrence; pauses
tag        :: forall a b. Signal b -> Event a -> Event b
attach     :: forall a b. Signal b -> Event a -> Event (Tuple b a)
attachWith :: forall a b c. (b -> a -> c) -> Signal b -> Event a -> Event c
subscribe  :: forall a. Event a -> (a -> Effect Unit) -> Owned Unit
hold       :: forall a. Event a -> Owned (Event a)

-- Screamer.Signal (#46): the same two, for signals
subscribe  :: forall a. Signal a -> (a -> Effect Unit) -> Owned Unit
hold       :: forall a. Signal a -> Owned (Signal a)
```

`tag`, `attach` and `attachWith` read the signal's value at the end of the round, which is the consistent value every effect in that round sees. They do not read the value at the moment of the fire. So a handler that fires an event and then writes a signal is read the same as one that writes first.

`changes s` fires at most once per round, with the final value, because a signal's own writes coalesce within a batch.

`Screamer.Event` reuses names from `Screamer.Signal` (`subscribe`, `hold`, `gate`, `withPrevious`, `dropRepeats`), so it is meant to be imported qualified: `import Screamer.Event as Event`. Its type also shares a name with `Web.Event.Event.Event`, the type DOM handlers receive. Code that needs both imports one of them qualified or under an alias. The typed handlers in `Screamer.Html.Handlers` take specific event types (`MouseEvent`, `KeyboardEvent`), so the clash comes up rarely.

## Pure or `Owned`

A combinator is pure when all it needs is its inputs, whatever state it keeps. It returns `Owned` when it needs something outside the graph: a timer, a fiber, a listener or a socket. That something writes into the graph later, and writes come only from sources that have owners.

| Kind | Examples | Type |
|---|---|---|
| Stateless | `map`, `filter`, `tag`, `<|>` | pure |
| Stateful over inputs | `fold`, `stepper`, `take`, `zip`, `bufferCount`, `withPrevious` | pure; pauses while unobserved |
| Needs time | `debounce`, `throttle`, `delay`, `audit`, `bufferFor` | `Owned` |
| Needs async work | `resource`, `request`, `switchOwned`, `retry` | `Owned` |

The time-based combinators could have been pure, with a timer that starts when the node is first observed and stops when it is released. That was rejected. Timer callbacks would become writes that belong to no scope, and the rule that only effects need owners would grow an exception. Starting the timer in `Owned` also gives the combinator a definite start time, which matches `Time.clock`.

## Instances

| Class | `Signal` | `Event` |
|---|---|---|
| `Functor` | yes | yes |
| `Apply`, `Applicative`, `Bind`, `Monad` | yes (`bind` switches) | no: occurrences of two events rarely coincide, so there is nothing to pair; use `attachWith`, or `zip` (#20) to pair the nth with the nth |
| `Alt` | left wins on ties | interleaves by fire order |
| `Plus` | no (a signal needs a value) | `empty` never fires |
| `Semigroup`, `Monoid` | lifted over the values | no, to keep `<>` from meaning merge |
| `Compactable`, `Filterable` | no: a signal needs a seed to filter, so `latestWhere p seed` takes one | yes: `filter`, `filterMap`, `partition`, `compact` |

## RxJS names

RxJS has no separate state type: its `BehaviorSubject` is closest to a signal source, and its `Subject` is closest to an event source. The table gives, for each common RxJS operator, the Screamer equivalent (existing, planned, or left out), and the issue that adds it.

| RxJS | Screamer | Where |
|---|---|---|
| `BehaviorSubject`, `next` | `signalSource`, `put` | exists |
| `Subject`, `next` | `eventSource`, `fire` | #18 |
| `fromEvent` | a typed handler given `source.fire` | #18 |
| `subscribe` | `Signal.subscribe`, `Event.subscribe` | exists / #18 |
| `map`, `mapTo` | `map`, `(<$)` | exists / #18 |
| `filter` | `Event.filter`, `filterMap`, `partition`; `Signal.latestWhere p seed`, `Signal.gate` | #18 / #46 |
| `scan` | `Event.fold`, `mapAccum` | #18 / #19 |
| `pairwise` | `withPrevious` | #19 |
| `startWith` | `stepper` | #18 |
| `distinctUntilChanged` | automatic on signals; `dropRepeats`, `dropRepeatsBy`, `dropRepeatsOn` | exists / #19 |
| `take`, `skip`, `takeWhile`, `skipWhile`, `first` | same names on `Event` | #19 |
| `count` | `count :: Event a -> Signal Int` | #19 |
| `tap` | left out: run effects in `subscribe` | |
| `combineLatest` | `apply`, `sequence`, `sampleMany` | exists |
| `withLatestFrom` | `attachWith`; `withLatest` on signals | #18 / #20 |
| `sample` | `tag`; `sampleOn` on signals | #18 / exists |
| `merge` | `<|>`, `oneOf` | #18 / #20 |
| `zip` | `zip` | #20 |
| `race` | `race` | #20 |
| `switchMap` | `bind` on signals; `switchEvent`, `switchOwned`, `resource` | exists / #21 |
| `mergeMap`, `concatMap`, `exhaustMap` | `mergeOwned`, `concatOwned`, `exhaustOwned`; `request` strategies | #21 |
| `debounceTime`, `throttleTime`, `auditTime`, `delay`, `timeout` | `debounce`, `throttle`, `audit`, `delay`, `timeout` (all `Owned`) | #22 |
| `sampleTime` | `sampleEvery` | #22 |
| `interval`, `timer` | `Time.interval`, `Time.after`, `Time.clock` | #46 |
| `bufferCount`, `buffer`, `bufferTime` | `bufferCount`, `bufferOn`, `bufferFor` | #23 |
| `catchError`, `retry` | `catching`, `attempt`, `retry`, `Remote` combinators | #24 |
| `share`, `shareReplay(1)` | sharing by reference; `Signal.hold`, `Event.hold` | #25 |
| `forkJoin`, `window*`, `publish`, `connectable`, schedulers | left out | #16 |

## Transform, filter and accumulate (#19)

All pure. The stateful ones (`mapAccum`, `withPrevious`, `dropRepeats*`, `take`, `skip`, `takeWhile`, `skipWhile`, `first`, `count`) pause: they start from their seed when first observed and count or compare only occurrences seen while observed. A `take 3` that loses its observers and is observed again does not restart: it carries on from the count it had.

| RxJS | Screamer | Notes |
|---|---|---|
| `map`, `mapTo` | `map`, `(<$)` | `Functor` on both |
| `filter` | `Event.filter`, `filterMap`, `partition`, `compact`, `separate` | `Filterable`, `Compactable` on `Event` |
| `scan` | `Event.fold`; over a signal, `Event.fold f seed (Event.changes s)` | one step per occurrence; pauses |
| `scan` with an output | `Event.mapAccum :: (a -> s -> { state :: s, value :: b }) -> s -> Event a -> Event b` | pauses |
| `pairwise` | `Event.withPrevious :: Event a -> Event { previous :: a, current :: a }`, `Signal.withPrevious :: a -> Signal a -> Signal (Tuple a a)` | the event form starts at the second occurrence; the signal form starts as the seed and the current value; both pause |
| `startWith` | `Event.startWith` (an alias of `stepper`) | |
| `distinctUntilChanged`, `distinctUntilKeyChanged` | `dropRepeats`, `dropRepeatsBy`, `dropRepeatsOn` on both | `dropRepeatsOn :: Eq k => (a -> k) -> …`; the event forms pause |
| `take`, `skip`, `takeWhile`, `skipWhile`, `first` | the same names on `Event` | pause |
| `last` | left out | an event never completes, so it has no last occurrence |
| `count`, `reduce` | `Event.count :: Event a -> Signal Int`, `Event.fold` | pause |
| `tap` | left out | an effect belongs in `subscribe`, which has an owner |
| toggle, `gate` | `Event.gate :: Signal Boolean -> Event a -> Event a`; `Signal.gate :: Signal Boolean -> a -> Signal a -> Signal a` | the event form reads the condition at the end of the round; the signal form holds its last value while the condition is false, and pauses |
| `filter` on a signal | `Signal.latestWhere :: (a -> Boolean) -> a -> Signal a -> Signal a` | the latest value that passed, starting at the seed; pauses |

## Combining several streams (#20)

All pure. The simultaneity rule for each: on signals, one step per batch and the left input wins where only one value can be kept; on events, every occurrence is kept in fire order unless the combinator says otherwise.

| RxJS | Screamer | Simultaneity |
|---|---|---|
| `combineLatest` | `apply`, `sequence`, `sampleMany`, and `Signal.combine :: Array (Signal a) -> Signal (Array a)` | one value per batch; `combine` is one node instead of a chain of `apply`s |
| `merge` on signals | `<|>`, `Signal.merge` | one value per batch, the left winning ties; pauses |
| `withLatestFrom` | `Event.attachWith`; `Signal.withLatest :: Signal b -> Signal a -> Signal (Tuple a b)` | `withLatest` changes only when its second argument (the driver) does, unlike `apply`; the first is observed with it, so a stateful signal there keeps advancing |
| `sample` | `Event.tag`; `Signal.sampleOn` | the signal is read at the end of the round |
| `merge` | `<|>`, `Event.oneOf :: Array (Event a) -> Event a` | every occurrence, in fire order; `oneOf` is one node and agrees with folding `<|>` |
| (Reflex `leftmost`) | `Event.leftmost :: Array (Event a) -> Event a` | only the leftmost input that fired in the round |
| `mergeWith` keeping both | `Event.mergeWith :: (a -> b -> c) -> (a -> c) -> (b -> c) -> Event a -> Event b -> Event c` | occurrences with the same fire stamp (both derived from one fire) are combined; nothing is lost |
| `zip` | `Event.zip`, `Event.zipWith` | pairs the nth occurrence of each, counting from observation; unpaired occurrences queue without bound; a paused zip drops its queues, because what they would pair with is missed; pauses |
| `race` | `Event.race :: Array (Event a) -> Event a` | follows the first input to fire after first observation (the leftmost, on a tie); keeps that choice while paused; pauses |
| `forkJoin`, `combineLatestAll` | left out | events never complete, so there is no last value to join; for a list of async results use `Remote`'s `Applicative` (#24) or `sequence` on signals |

## Flattening (#21)

For pure inner streams nothing needs an owner: `bind` on signals already switches, and so do these.

| RxJS | Screamer | Notes |
|---|---|---|
| `switchAll` on signals | `Signal.switchLatest :: Signal (Signal a) -> Signal a` | `join`; the branch no longer read is released |
| `switchMap` to events | `Event.switchEvent :: Signal (Event a) -> Event a` | follows the event the signal holds; a new event is followed from the next occurrence on, so nothing it fired before the switch is delivered |
| `mergeMap`, `concatMap` over `Event (Event a)` | left out | an event of events has no owner for the inner events' lifetimes; use `switchEvent`, or the owned forms below |

Inner work that needs an owner (timers, sockets, requests) runs in a child scope per inner value, like `dyn` for values other than elements. `Screamer.Flatten`:

| RxJS | Screamer |
|---|---|
| `switchMap` | `switchOwned :: Signal a -> (a -> Owned b) -> Owned (Signal b)`: each new value disposes the running child first |
| `mergeMap` | `mergeOwned :: Event a -> (a -> Effect Unit -> Owned (Event b)) -> Owned (Event b)`: every child runs at once |
| `concatMap` | `concatOwned` (same type): occurrences queue while a child runs, without bound, and start in order |
| `exhaustMap` | `exhaustOwned` (same type): occurrences are ignored while a child runs |

A child of the event forms is *running* until it calls the `Effect Unit` it is given (`done`), which disposes it, or until the parent scope is disposed. The output merges the events the running children return, in fire order; an inner event delivers what it fires after its child's setup returns.

For `Aff` requests, `Screamer.Resource` has the same four strategies as a `Strategy` (`Switch`, `Merge`, `Concat`, `Exhaust`). A request is running until it settles.

```purescript
resourceWith :: forall a b. Strategy -> Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))
request      :: forall a b. Strategy -> Event a -> (a -> Aff b) -> Owned (Event (Either Error b))
resource = resourceWith Switch
```

`resourceWith` turns `Loading` when a request starts and shows each result its strategy keeps; under `Exhaust` that can be the result for an older input than the signal's current value. `request` fires one occurrence per kept result. Disposing the scope kills every running request, and a result that arrives after its request was killed is never shown.

## Time (#22)

`Screamer.Time`. Each combinator reads the `Screamer.Host` of its scope when it is instantiated, so a fake host drives it in tests. Its sources return state as a `Signal` and occurrences as an `Event`, and take no callbacks:

```purescript
clock    :: Milliseconds -> Owned (Signal Instant)   -- the current time, updated every interval
interval :: Milliseconds -> Owned (Event Unit)       -- one occurrence every interval
after    :: Milliseconds -> Owned (Event Unit)       -- one occurrence, once
frames   :: Owned (Event Number)                     -- one occurrence per animation frame, with its timestamp
```

Each combinator needs a timer, so each returns `Owned` and cancels its timers when its scope is disposed; an occurrence still pending then is dropped. Timers start at instantiation: each combinator subscribes to its input when its scope runs and observes it for the scope's whole life, whether or not anything observes the output. `timeout` and `sampleEvery` count their first interval from instantiation.

| RxJS | Screamer |
|---|---|
| `debounceTime` | `debounce :: Milliseconds -> Event a -> Owned (Event a)`; `debounceSignal :: Milliseconds -> Signal a -> Owned (Signal a)` holds the last settled value, starting at the current one |
| `throttleTime` | `throttle :: { leading :: Boolean, trailing :: Boolean } -> Milliseconds -> Event a -> Owned (Event a)`; a trailing occurrence opens a new interval, as in RxJS |
| `auditTime` | `audit :: Milliseconds -> Event a -> Owned (Event a)` |
| `sampleTime` | `sampleEvery :: Milliseconds -> Signal a -> Owned (Event a)`; holds the signal so a stateful one keeps advancing |
| `delay` | `delay :: Milliseconds -> Event a -> Owned (Event a)`; keeps order |
| `timeout` | `timeout :: Milliseconds -> Event a -> Owned (Event (Either Unit a))`; a `Left unit` for each silence of the interval, from instantiation and after each occurrence, instead of an error |
| `interval`, `timer` | `interval`, `after`; `clock` for the time itself |
| animation-frame scheduling | `frames`; `onFrame :: Event a -> Owned (Event a)`: the latest occurrence on the next frame |

Each timer callback runs in one `batch`, so what it fires arrives in one round. An occurrence passed on without a timer (a leading `throttle` edge, a `timeout`'s `Right`) is fired from a subscription, so it arrives one round after the input's.

## Buffering (#23)

| RxJS | Screamer | Pure? |
|---|---|---|
| `bufferCount(n, step)` | `Event.bufferCount :: Int -> Int -> Event a -> Event (Array a)` | pure; pauses |
| `buffer(notifier)` | `Event.bufferOn :: Event b -> Event a -> Event (Array a)` | pure; pauses |
| `bufferToggle`, `bufferWhen` | `Event.bufferWhile :: Signal Boolean -> Event a -> Event (Array a)` | pure; pauses |
| `bufferTime` | `Time.bufferFor :: Milliseconds -> Event a -> Owned (Event (Array a))` | `Owned` |
| `window*` | left out | a window is an event of events, which has no owner for the inner events (see #21); buffer, or use `switchEvent` |
| (no RxJS name) | `Signal.history :: Int -> Signal a -> Signal (Array a)`: the last n values, oldest first, for sparklines and undo | pure; pauses |

The pure buffers are stateful nodes: they collect only occurrences seen while observed, and **a paused buffer keeps what it held**, as every paused stateful node keeps its state; its next buffer continues from there. (`zip` is the exception, because a queue waiting for partners it will never see would pair the wrong occurrences.)

- `bufferOn` fires on every notifier occurrence, even with nothing collected, as RxJS does. An occurrence fired in the same round as the notifier and before it goes into that buffer.
- `bufferWhile` reads its signal at the end of each round, like `gate`: it collects the occurrences of rounds that end with the signal true, and fires the collection (possibly empty) in the round that ends with it false.
- `bufferFor` fires every interval from instantiation, but skips an interval with nothing collected, unlike RxJS, so an idle buffer does not wake its observers. What it holds when its scope is disposed is dropped.

## Error handling (#24)

| RxJS | Screamer | Pure? |
|---|---|---|
| `catchError` on a signal | `Signal.catching :: (Error -> a) -> Signal a -> Signal a` | pure |
| `materialize` (errors only) | `Signal.attempt :: Signal a -> Signal (Either Error a)` | pure |
| `retry({ count, delay })` | `Resource.retry :: RetryPolicy -> (a -> Aff b) -> a -> Aff b` | `Aff` |
| error boundary | `Owned.onError` in a component's scope | `Owned` |

- **Recovering a signal.** A derivation that throws makes every read of it throw. `catching` and `attempt` read the input inside a `try`, so the signal recovers on its own the next time the input changes. Dependents of the caught signal stay consistent: they see the fallback in the same batch.
- **Retrying a request.** `retry policy request` is a request again, so it plugs into `resource`, `resourceWith` and `request` without new strategies. `type RetryPolicy = { retries :: Int, backoff :: Backoff }`, with `Backoff = Immediately | Fixed Milliseconds | Exponential { initial, max }`. The waits are `Aff` delays inside the request's fiber, so a new input under `Switch`, or disposing the scope, cancels a pending retry; the resource stays `Loading` until the last attempt settles.
- **Combining remote data.** `Remote` is `Applicative`: `Failed` if any failed (the leftmost failure wins), else `Loading` if any loads, else `Loaded`. `withDefault`, `toMaybe` and `isLoading` read it; `keepLast :: Signal (Remote a) -> Signal (Remote a)` keeps showing the last `Loaded` value while the next request loads.
- **Error boundaries.** An effect that throws (a DOM binding, `subscribe`, `Event.subscribe`) is reported to the nearest `onError` up its scope chain. A component that registers `onError` and puts the error in a signal source is a boundary: it can swap its body for a fallback with `dyn`.

```purescript
boundary :: Element -> Element
boundary body = component do
  failed <- liftEffect (signalSource Nothing)
  onError (failed.put <<< Just)
  pure $ dyn $ failed.signal <#> case _ of
    Nothing -> body
    Just e -> div_ [ text ("Something went wrong: " <> message e) ]
```

There is no error channel on events: an event occurrence is a value, so a request's failure is an `Either` (`request`) or a `Remote` (`resource`), and a throwing callback goes to `onError`.

## Sharing (#25)

RxJS needs `share`, `shareReplay` and `publish` because an observable is a recipe: each subscriber runs it again. Here a `Signal` or `Event` value **is** a node, so sharing is by reference.

- **One value, one node.** `let total = Event.fold (+) 0 clicks` observed by two effects is one stateful node. It steps once per occurrence and both effects see the same value in the same batch.
- **Two evaluations, two nodes.** Writing `Event.fold (+) 0 clicks` twice (or calling a function that builds it twice) makes two nodes with separate state. They agree only if both are observed for the same occurrences; one created later starts from its seed. Bind the value once with `let` and pass it around.
- **Paused state.** A stateful node steps only while observed. When its last observer leaves it keeps its state and misses what fires meanwhile (a stateful *signal* resynchronizes from its input's current value when it returns; a stateful *event* node cannot, since events have no current value). To keep one stepping for a scope's lifetime, pin it: `Signal.hold` for a signal, `Event.hold :: Event a -> Owned (Event a)` for an event (`take`, `mapAccum`, `dropRepeats`, ...).

| RxJS | Screamer |
|---|---|
| `share()` | bind the value once (`let`); every observer shares the node |
| `shareReplay(1)` | a signal: `Event.stepper` or `Event.fold`, plus `Signal.hold` if it must not pause |
| `publish()` / `connect()` | `Event.hold` (or `Signal.hold`) starts it for the scope; disposing the scope disconnects |
| cold vs hot | every node is hot while observed and inert otherwise; there is no per-subscriber execution to make cold |

- **`replay` is left out.** A replay buffer would hand late observers occurrences from earlier batches, which breaks "an occurrence happens at one moment". No example needed it: what a late observer wants is almost always a current value (`stepper`, `Signal.history n` for the last n).
- **No dev warning for duplicated stateful expressions.** Building the same expression twice allocates two nodes that look identical to the core; telling an accidental duplicate from a deliberate second instance (two independent counters) would need call-site identity, which costs a stack trace per allocation. The test `Test.Sharing` documents both behaviours instead.
- A late subscriber never sees occurrences delivered earlier in the same batch: `Event.subscribe` records the event's version when it starts. `Event.hold` does not change that; it only keeps stateful nodes stepping.

## Implementation

The event nodes live in `src/Screamer/Runtime.ts` next to the signal nodes (#18). The combinators built from them (`oneOf`, `leftmost`, `mergeWith`, `zip`, `race`, `gate`, and `merge`, `latestWhere`, `gate`, `combine`, `withLatest` on signals) live in `src/Screamer/Event.ts` and `src/Screamer/Signal.ts` (#47).

- **Consumption by version.** An event node's value is the list of occurrences it produced when its version last increased, and the version increases only when a computation produces at least one occurrence. A consumer (a derived event, a stateful node or an effect) records the version of each input it read. On its next computation an input whose version changed contributes its current list, and any other input contributes nothing. So each consumer takes each occurrence once, however often it is read, and an event needs no per-round reset.
- **Rounds.** `fire` queues an occurrence on its source. Each pass of the flush loop starts a round: the queued occurrences become their sources' values, one version step per source, and observers are notified. Fires made while a round runs are queued for the next one, so a `subscribe` callback that fires an event is followed by one more round.
- **Resynchronizing.** A derived event that gains its first observer records its inputs' versions and produces nothing, so occurrences from before it was observed are never delivered. A stateful node over events records versions the same way, which is why it misses what was fired while it was paused.
- **Settling.** A stateful node over events steps at the end of the round in which its inputs fired, even when no effect read it in that round, because the next round replaces its inputs' occurrences. `stepper` and `Event.fold` therefore advance whenever they are observed, as stateful signals do.
- **Errors.** A throwing `Event.subscribe` callback is reported to the scope's `onError` (or rethrown at the end of the flush) and the round's later occurrences are still delivered.
- `Signal.hold` keeps a stateful signal over events advancing, as for any signal. `holdEvent` keeps an event itself observed (#25).

`WebSocket.connect` gives `state :: Signal ConnectionState` and `messages :: Event String` (#18). The indexed `message :: Signal (Maybe Message)` was removed in #46.

## What changed in this decision

- `Screamer.Channel` became the signal-source module (now `Screamer.Source`), with `Channel` renamed `SignalSource` and `channel` renamed `signalSource`. This names the two kinds of source in parallel. "Channel" also suggested a queue of messages, which is closer to what an event source is.
- `Event` and `EventSource` are specified here and implemented in #18.

## What changed in #46

- `Signal.fold` is removed: fold an event (`Event.fold f seed (Event.changes s)`).
- `subscribe` and `hold` for signals moved from `Screamer.Owned` to `Screamer.Signal`, next to `Event.subscribe` and `Event.hold`.
- `Signal.filter` is `Signal.latestWhere`, and `Signal.filterOn` is `Signal.gate`.
- The timer and frame sources moved to `Screamer.Time` and return values instead of taking callbacks: `Subscriptions.Timer.every` is `Time.clock`, `Timer.after` is `Time.after :: Milliseconds -> Owned (Event Unit)`, `Time.interval` is new, and `AnimationFrame.frames` and `AnimationFrame.every` are `Time.frames :: Owned (Event Number)`.
- `Time.debounced` is `Time.debounceSignal`.
- `WebSocket.connect` no longer has `message` or the `Message` type; use `messages`.
