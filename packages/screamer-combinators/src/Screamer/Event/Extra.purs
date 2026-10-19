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
import Screamer.Event (Event, fold)
import Screamer.Signal (Signal)

-- Transform and filter (#19). The stateful ones start from their seed when
-- first observed and count only occurrences seen while observed: a
-- `take 3` observed again later does not restart.

-- | The first n occurrences seen while observed.
foreign import take :: forall a. Int -> Event a -> Event a

-- | Every occurrence after the first n seen while observed.
foreign import skip :: forall a. Int -> Event a -> Event a

-- | Occurrences up to the first that fails the predicate; none after it.
foreign import takeWhile :: forall a. (a -> Boolean) -> Event a -> Event a

-- | Occurrences from the first that fails the predicate on.
foreign import skipWhile :: forall a. (a -> Boolean) -> Event a -> Event a

-- | The first occurrence seen while observed. `take 1`.
first :: forall a. Event a -> Event a
first = take 1

-- | How many occurrences have been seen while observed.
count :: forall a. Event a -> Signal Int
count = fold (\_ n -> n + 1) 0

-- Combining several streams (#20).

-- | In each round, the occurrences of the leftmost input that fired, and
-- | none of the others'. (Reflex `leftmost`.)
foreign import leftmost :: forall a. Array (Event a) -> Event a

-- | Both events' occurrences in fire order, losing none. An occurrence of
-- | each with the same fire stamp (both derived from one fire) are combined
-- | with the first function into one occurrence. (Reflex `alignWith`.)
foreign import mergeWith
  :: forall a b c
   . (a -> b -> c)
  -> (a -> c)
  -> (b -> c)
  -> Event a
  -> Event b
  -> Event c

-- | Pair the nth occurrence of each, counting from when the zip is
-- | observed. Unpaired occurrences wait in a queue with no bound. A paused
-- | zip drops its queues. (RxJS `zip`.)
zip :: forall a b. Event a -> Event b -> Event (Tuple a b)
zip = zipWith Tuple

foreign import zipWith :: forall a b c. (a -> b -> c) -> Event a -> Event b -> Event c

-- | Follow the first input that fires after the race is first observed
-- | (the leftmost, if several fire in one round) and ignore the rest from
-- | then on. (RxJS `race`.)
foreign import race :: forall a. Array (Event a) -> Event a

-- Buffering (#23). Each is stateful: it collects only occurrences seen
-- while observed, and a paused buffer keeps what it holds. The timed form,
-- `bufferFor`, is in `Screamer.Time`.

-- | Buffers of n occurrences, a new one starting every `step` occurrences:
-- | `bufferCount 3 3` chunks, `bufferCount 3 1` slides. Each buffer is fired
-- | when it is full. (RxJS `bufferCount`.)
foreign import bufferCount :: forall a. Int -> Int -> Event a -> Event (Array a)

-- | The occurrences since the notifier last fired, each time it fires, even
-- | when there were none. An occurrence fired in the same round as the
-- | notifier but before it goes in that buffer. (RxJS `buffer`.)
foreign import bufferOn :: forall a b. Event b -> Event a -> Event (Array a)

-- | Collect occurrences while the signal is true, and fire the collection
-- | when it turns false. The signal is read at the end of each round, so a
-- | round that ends with it false is not collected. (RxJS `bufferToggle`,
-- | `bufferWhen`.)
foreign import bufferWhile :: forall a. Signal Boolean -> Event a -> Event (Array a)
