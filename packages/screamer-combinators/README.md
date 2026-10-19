# screamer-combinators

More operators over the core's signals and events, as an add-on: everything here is built on `Screamer.Runtime.Unsafe` and the core's public API, the way any add-on would be.

| Module | What it has |
|---|---|
| `Screamer.Event.Extra` | `take`, `skip`, `takeWhile`, `skipWhile`, `first`, `count`, `leftmost`, `mergeWith`, `zip`, `zipWith`, `race`, `bufferCount`, `bufferOn`, `bufferWhile` |
| `Screamer.Signal.Extra` | `combine`, `withLatest`, `switchLatest`, `history` |
| `Screamer.Time` | timer and frame sources, and rate-limiting and scheduling for events, through the scope's `Screamer.Host` |
| `Screamer.Flatten` | `switchOwned`, `mergeOwned`, `concatOwned`, `exhaustOwned`: flattening with a child scope per inner value |

Depends on: screamer-reactive, and datetime for `Time.clock`. The semantics (pausing, simultaneity, rounds) are the core's, in [`docs/combinators.md`](../../docs/combinators.md). The tables below write `Event.take` and `Signal.combine` for brevity; import the `Extra` modules qualified under names of their own, such as `import Screamer.Event.Extra as EventX`.

## Transform and filter

All pure, and stateful: they start from their seed when first observed and count only occurrences seen while observed. A `take 3` that loses its observers and is observed again does not restart: it carries on from the count it had.

| RxJS | Screamer | Notes |
|---|---|---|
| `take`, `skip`, `takeWhile`, `skipWhile`, `first` | the same names on `Event` | pause |
| `count`, `reduce` | `Event.count :: Event a -> Signal Int`, `Event.fold` | pause |

## Combining several streams

On signals, one step per batch; on events, every occurrence is kept in fire order unless the combinator says otherwise.

| RxJS | Screamer | Simultaneity |
|---|---|---|
| `combineLatest` | `Signal.combine :: Array (Signal a) -> Signal (Array a)` | one value per batch; one node instead of a chain of `apply`s |
| `withLatestFrom` | `Event.attachWith`; `Signal.withLatest :: Signal b -> Signal a -> Signal (Tuple a b)` | `withLatest` changes only when its second argument (the driver) does, unlike `apply`; the first is observed with it, so a stateful signal there keeps advancing |
| (Reflex `leftmost`) | `Event.leftmost :: Array (Event a) -> Event a` | only the leftmost input that fired in the round |
| `mergeWith` keeping both | `Event.mergeWith :: (a -> b -> c) -> (a -> c) -> (b -> c) -> Event a -> Event b -> Event c` | occurrences with the same fire stamp (both derived from one fire) are combined; nothing is lost |
| `zip` | `Event.zip`, `Event.zipWith` | pairs the nth occurrence of each, counting from observation; unpaired occurrences queue without bound; a paused zip drops its queues, because what they would pair with is missed; pauses |
| `race` | `Event.race :: Array (Event a) -> Event a` | follows the first input to fire after first observation (the leftmost, on a tie); keeps that choice while paused; pauses |

## Flattening

`Signal.switchLatest :: Signal (Signal a) -> Signal a` is `join`: the branch no longer read is released.

Inner work that needs an owner (timers, sockets, requests) runs in a child scope per inner value, like `dyn` for values other than elements. `Screamer.Flatten`:

| RxJS | Screamer |
|---|---|
| `switchMap` | `switchOwned :: Signal a -> (a -> Owned b) -> Owned (Signal b)`: each new value disposes the running child first |
| `mergeMap` | `mergeOwned :: Event a -> (a -> Effect Unit -> Owned (Event b)) -> Owned (Event b)`: every child runs at once |
| `concatMap` | `concatOwned` (same type): occurrences queue while a child runs, without bound, and start in order |
| `exhaustMap` | `exhaustOwned` (same type): occurrences are ignored while a child runs |

A child of the event forms is *running* until it calls the `Effect Unit` it is given (`done`), which disposes it, or until the parent scope is disposed. The output merges the events the running children return, in fire order; an inner event delivers what it fires after its child's setup returns.

## Time

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

## Buffering

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
