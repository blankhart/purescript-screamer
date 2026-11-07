# screamer-combinators

More operators over the core's signals and events, as an add-on: everything here is built on `Screamer.Runtime.Unsafe` and the core's public API, the way any add-on would be.

| Module | What it has |
|---|---|
| `Screamer.Event.Extra` | `take`, `skip`, `takeWhile`, `skipWhile`, `first`, `count`, `leftmost`, `mergeWith`, `zip`, `zipWith`, `race`, `bufferCount`, `bufferOn`, `bufferWhile` |
| `Screamer.Signal.Extra` | `combine`, `withLatest`, `switchLatest`, `history` |
| `Screamer.Time` | timer and frame sources, and rate-limiting and scheduling for events, through the scope's `Screamer.Host` |
| `Screamer.Flatten` | `switchOwned`, `mergeOwned`, `concatOwned`, `exhaustOwned`: flattening with a child scope per inner value |

Depends on: screamer-reactive, and datetime for `Time.clock`.  The tables below write `Event.take` and `Signal.combine` for brevity; import the `Extra` modules qualified under names of their own, such as `import Screamer.Event.Extra as EventX`.

## Transform and filter

All stateful, so each returns `Owned`: it starts from its seed when the action runs and counts every occurrence from then on, for the life of its scope, whether or not anything observes it.

| Operator | Behavior |
| --- | --- |
| `Event.take n` | Keep the first n occurrences. |
| `Event.skip n` | Drop the first n occurrences. |
| `Event.takeWhile predicate` | Keep occurrences until the first predicate failure; discard that occurrence and all later ones. |
| `Event.skipWhile predicate` | Drop occurrences until the first predicate failure; keep that occurrence and all later ones. |
| `Event.first` | Keep only the first occurrence. |
| `Event.count` | A signal counting occurrences, starting at zero. |
| `Event.fold` | A signal accumulating occurrences from a seed with a supplied function; available in `Screamer.Event`. |

## Combining several streams

On signals, one step per batch; on events, every occurrence is kept in fire order unless the combinator says otherwise.

| Operator | Behavior |
| --- | --- |
| `Signal.combine :: Array (Signal a) -> Signal (Array a)` | one value per batch; one node instead of a chain of `apply`s |
| `Event.attachWith`; `Signal.withLatest :: Signal b -> Signal a -> Owned (Signal (Tuple a b))` | `withLatest` changes only when its second argument (the driver) does, unlike `apply`; stateful |
| `Event.leftmost :: Array (Event a) -> Event a` | only the leftmost input that fired in the round |
| `Event.mergeWith :: (a -> b -> c) -> (a -> c) -> (b -> c) -> Event a -> Event b -> Event c` | occurrences with the same fire stamp (both derived from one fire) are combined; nothing is lost |
| `Event.zip`, `Event.zipWith` (in `Owned`) | pairs the nth occurrence of each, counting from when the action runs; unpaired occurrences queue without bound; stateful |
| `Event.race :: Array (Event a) -> Owned (Event a)` | follows the first argument to fire after the action runs (the leftmost, on a tie); stateful |

## Flattening

`Signal.switchLatest :: Signal (Signal a) -> Signal a` is `join`: the branch no longer read is released.

Inner work that needs an owner (timers, sockets, requests) runs in a child scope per inner value, like `dyn` for values other than elements. `Screamer.Flatten`:

| Operator | Behavior |
| --- | --- |
| `switchOwned :: Signal a -> (a -> Owned b) -> Owned (Signal b)` | Each new value disposes the running child first. |
| `mergeOwned :: Event a -> (a -> Effect Unit -> Owned (Event b)) -> Owned (Event b)` | Every child runs at once. |
| `concatOwned` (same type as `mergeOwned`) | Occurrences queue while a child runs, without bound, and start in order. |
| `exhaustOwned` (same type as `mergeOwned`) | Occurrences are ignored while a child runs. |

A child of the event forms is *running* until it calls the `Effect Unit` it is given (`done`), which disposes it, or until the parent scope is disposed. The output merges the events the running children return, in fire order; an inner event delivers what it fires after its child's setup returns.

## Time

`Screamer.Time`. Each combinator reads the `Screamer.Host` of its scope when it is instantiated, so a fake host drives it in tests. Its sources return state as a `Signal` and occurrences as an `Event`, and take no callbacks:

```purescript
clock    :: Milliseconds -> Owned (Signal Instant)   -- the current time, updated every interval
interval :: Milliseconds -> Owned (Event Unit)       -- one occurrence every interval
after    :: Milliseconds -> Owned (Event Unit)       -- one occurrence, once
frames   :: Owned (Event Number)                     -- one occurrence per animation frame, with its timestamp
```

`frames` requests a frame for its scope's whole life. For an animation that should stop costing frames once it settles, `frameLoop :: (Number -> Effect Boolean) -> Owned { start :: Effect Unit, stop :: Effect Unit }` runs its step on each frame only while the step returns true; `start` begins it again. screamer-motion's `tween` and `spring` are built on it.

Each combinator needs a timer, so each returns `Owned` and cancels its timers when its scope is disposed; an occurrence still pending then is dropped. Timers start at instantiation: each combinator subscribes to its input when its scope runs and observes it for the scope's whole life, whether or not anything observes the output. `timeout` and `sampleEvery` count their first interval from instantiation.

| Operator | Behavior |
| --- | --- |
| `debounce :: Milliseconds -> Event a -> Owned (Event a)` | Emit the latest occurrence after the input has been quiet for the interval. |
| `debounceSignal :: Milliseconds -> Signal a -> Owned (Signal a)` | Hold the current value until a new value has remained unchanged for the interval. |
| `throttle :: { leading :: Boolean, trailing :: Boolean } -> Milliseconds -> Event a -> Owned (Event a)` | With `leading`, emit the first occurrence and open an interval. With `trailing`, emit the latest occurrence collected during the interval at its end, then open another interval. |
| `audit :: Milliseconds -> Event a -> Owned (Event a)` | An occurrence opens an interval; at its end, emit the latest occurrence seen. |
| `sampleEvery :: Milliseconds -> Signal a -> Owned (Event a)` | Emit the signal's value every interval, starting one interval after instantiation. Hold the signal so it stays computed between samples. |
| `delay :: Milliseconds -> Event a -> Owned (Event a)` | Emit every occurrence after the interval, preserving order. |
| `timeout :: Milliseconds -> Event a -> Owned (Event (Either Unit a))` | Emit every input as `Right`. Emit `Left unit` after an interval of silence, counting from instantiation or the latest input. After `Left`, wait for another input before arming the timer again. |
| `onFrame :: Event a -> Owned (Event a)` | Emit the latest occurrence on the next animation frame, combining multiple occurrences before that frame into one. |

Each timer callback runs in one `batch`, so what it fires arrives in one round. An occurrence passed on without a timer (a leading `throttle` edge, a `timeout`'s `Right`) is fired from a subscription, so it arrives one round after the input's.

## Buffering

Every buffer is stateful, so each returns `Owned` and collects from when the action runs, for the life of its scope.

| Operator | Behavior |
| --- | --- |
| `Event.bufferCount :: Int -> Int -> Event a -> Owned (Event (Array a))` | Collect buffers of n occurrences, starting a new buffer every `step` occurrences. Emit only full buffers: `bufferCount 3 3` chunks; `bufferCount 3 1` slides. |
| `Event.bufferOn :: Event b -> Event a -> Owned (Event (Array a))` | Emit collected occurrences whenever the notifier fires, then clear the buffer. |
| `Event.bufferWhile :: Signal Boolean -> Event a -> Owned (Event (Array a))` | Collect while the signal is true; emit the collection when it turns false. |
| `Time.bufferFor :: Milliseconds -> Event a -> Owned (Event (Array a))` | Emit the occurrences collected during each interval, skipping empty intervals. |
| `Signal.history :: Int -> Signal a -> Owned (Signal (Array a))` | Keep the last n values, oldest first, starting with the current value; useful for sparklines and undo. |

Buffers produce arrays rather than inner events with independent lifetimes. Use owned flattening when inner work needs its own scope, or `switchEvent` to follow an existing event selected by a signal.

- `bufferOn` fires on every notifier occurrence, even with nothing collected. An occurrence fired in the same round as the notifier and before it goes into that buffer.
- `bufferWhile` reads its signal at the end of each round, like `gate`: it collects the occurrences of rounds that end with the signal true, and fires the collection (possibly empty) in the round that ends with it false.
- `bufferFor` fires every interval from instantiation, but skips an interval with nothing collected, so an idle buffer does not wake its observers. What it holds when its scope is disposed is dropped.
