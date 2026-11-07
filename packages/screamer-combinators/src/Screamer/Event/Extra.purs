-- | More event operators: counting, pairing, racing and buffering. The
-- | semantics are those of `Screamer.Event`; see
-- | `packages/screamer-combinators/README.md`.
-- |
-- | Import it qualified, under a name of its own:
-- | `import Screamer.Event.Extra as EventX`.
module Screamer.Event.Extra
  ( take
  , skip
  , takeWhile
  , skipWhile
  , first
  , count
  , leftmost
  , mergeWith
  , zip
  , zipWith
  , race
  , bufferCount
  , bufferOn
  , bufferWhile
  ) where

import Prelude

import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Event (Event, fold, hold)
import Screamer.Owned (Owned)
import Screamer.Signal (Signal)

-- Make a stateful event and hold it for the lifetime of the current scope,
-- so its state starts now.
owned :: forall a. Effect (Event a) -> Owned (Event a)
owned make = liftEffect make >>= hold

-- Transform and filter (#19). Each is stateful, and counts from when the
-- `Owned` action runs.

-- | The first n occurrences.
take :: forall a. Int -> Event a -> Owned (Event a)
take n e = owned (takeImpl n e)

foreign import takeImpl :: forall a. Int -> Event a -> Effect (Event a)

-- | Every occurrence after the first n.
skip :: forall a. Int -> Event a -> Owned (Event a)
skip n e = owned (skipImpl n e)

foreign import skipImpl :: forall a. Int -> Event a -> Effect (Event a)

-- | Occurrences up to the first that fails the predicate; none after it.
takeWhile :: forall a. (a -> Boolean) -> Event a -> Owned (Event a)
takeWhile p e = owned (takeWhileImpl p e)

foreign import takeWhileImpl :: forall a. (a -> Boolean) -> Event a -> Effect (Event a)

-- | Occurrences from the first that fails the predicate on.
skipWhile :: forall a. (a -> Boolean) -> Event a -> Owned (Event a)
skipWhile p e = owned (skipWhileImpl p e)

foreign import skipWhileImpl :: forall a. (a -> Boolean) -> Event a -> Effect (Event a)

-- | The first occurrence. `take 1`.
first :: forall a. Event a -> Owned (Event a)
first = take 1

-- | How many occurrences there have been.
count :: forall a. Event a -> Owned (Signal Int)
count = fold (\_ n -> n + 1) 0

-- Combining several streams (#20).

-- | In each round, the occurrences of the leftmost input that fired, and
-- | none of the others'.
foreign import leftmost :: forall a. Array (Event a) -> Event a

-- | Both events' occurrences in fire order, losing none. An occurrence of
-- | each with the same fire stamp (both derived from one fire) are combined
-- | with the first function into one occurrence.
foreign import mergeWith
  :: forall a b c
   . (a -> b -> c)
  -> (a -> c)
  -> (b -> c)
  -> Event a
  -> Event b
  -> Event c

-- | Pair the nth occurrence of each, counting from when the `Owned` action
-- | runs. Unpaired occurrences wait in a queue with no bound. Stateful.
zip :: forall a b. Event a -> Event b -> Owned (Event (Tuple a b))
zip = zipWith Tuple

zipWith :: forall a b c. (a -> b -> c) -> Event a -> Event b -> Owned (Event c)
zipWith f a b = owned (zipWithImpl f a b)

foreign import zipWithImpl :: forall a b c. (a -> b -> c) -> Event a -> Event b -> Effect (Event c)

-- | Follow the first argument that fires after the `Owned` action runs (the
-- | leftmost, if several fire in one round) and ignore the rest from then
-- | on. Stateful.
race :: forall a. Array (Event a) -> Owned (Event a)
race es = owned (raceImpl es)

foreign import raceImpl :: forall a. Array (Event a) -> Effect (Event a)

-- Buffering (#23). Each is stateful, and collects from when the `Owned`
-- action runs. The timed form, `bufferFor`, is in `Screamer.Time`.

-- | Buffers of n occurrences, a new one starting every `step` occurrences:
-- | `bufferCount 3 3` chunks, `bufferCount 3 1` slides. Each buffer is fired
-- | when it is full.
bufferCount :: forall a. Int -> Int -> Event a -> Owned (Event (Array a))
bufferCount n step e = owned (bufferCountImpl n step e)

foreign import bufferCountImpl :: forall a. Int -> Int -> Event a -> Effect (Event (Array a))

-- | The occurrences since the notifier last fired, each time it fires, even
-- | when there were none. An occurrence fired in the same round as the
-- | notifier but before it goes in that buffer.
bufferOn :: forall a b. Event b -> Event a -> Owned (Event (Array a))
bufferOn notifier e = owned (bufferOnImpl notifier e)

foreign import bufferOnImpl :: forall a b. Event b -> Event a -> Effect (Event (Array a))

-- | Collect occurrences while the signal is true, and fire the collection
-- | when it turns false. The signal is read at the end of each round, so
-- | a round that ends with it false is not collected.
bufferWhile :: forall a. Signal Boolean -> Event a -> Owned (Event (Array a))
bufferWhile cond e = owned (bufferWhileImpl cond e)

foreign import bufferWhileImpl :: forall a. Signal Boolean -> Event a -> Effect (Event (Array a))
