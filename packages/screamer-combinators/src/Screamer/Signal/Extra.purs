-- | More signal operators. See `packages/screamer-combinators/README.md`.
module Screamer.Signal.Extra
  ( combine
  , withLatest
  , switchLatest
  , history
  ) where

import Prelude

import Data.Tuple (Tuple(..))
import Screamer.Signal (Signal)

-- | The current values of every signal in the array, as one node rather
-- | than a chain of `apply`s. (RxJS `combineLatest`.)
foreign import combine :: forall a. Array (Signal a) -> Signal (Array a)

-- | The second signal's value paired with the first's, changing only when
-- | the second changes. The first is observed with it, so a stateful signal
-- | there keeps advancing. (RxJS `withLatestFrom`.)
withLatest :: forall a b. Signal b -> Signal a -> Signal (Tuple a b)
withLatest = withLatestImpl Tuple

foreign import withLatestImpl :: forall a b. (a -> b -> Tuple a b) -> Signal b -> Signal a -> Signal (Tuple a b)

-- | The value of whichever signal the outer signal holds: `join`. The inner
-- | signal is rebuilt only when the outer one changes, and the branch no
-- | longer read is released. (RxJS `switchAll`.)
switchLatest :: forall a. Signal (Signal a) -> Signal a
switchLatest s = s >>= identity

-- | The last n values, oldest first, starting with the current one; for
-- | sparklines and undo. Stateful: it records only while observed.
foreign import history :: forall a. Int -> Signal a -> Signal (Array a)
