-- | More signal operators. See `packages/screamer-combinators/README.md`.
module Screamer.Signal.Extra
  ( combine
  , withLatest
  , switchLatest
  , history
  ) where

import Prelude

import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Owned (Owned)
import Screamer.Signal (Signal, hold)

-- | The current values of every signal in the array, as one node rather
-- | than a chain of `apply`s.
foreign import combine :: forall a. Array (Signal a) -> Signal (Array a)

-- | The second signal's value paired with the first's, changing only when
-- | the second changes. Stateful: it keeps the pair made at the second's
-- | last change.
withLatest :: forall a b. Signal b -> Signal a -> Owned (Signal (Tuple a b))
withLatest b a = liftEffect (withLatestImpl Tuple b a) >>= hold

foreign import withLatestImpl :: forall a b. (a -> b -> Tuple a b) -> Signal b -> Signal a -> Effect (Signal (Tuple a b))

-- | The value of whichever signal the outer signal holds: `join`. The inner
-- | signal is rebuilt only when the outer one changes, and the branch no
-- | longer read is released.
switchLatest :: forall a. Signal (Signal a) -> Signal a
switchLatest s = s >>= identity

-- | The last n values, oldest first, starting with the current one; for
-- | sparklines and undo. Stateful: it records from when the `Owned` action
-- | runs.
history :: forall a. Int -> Signal a -> Owned (Signal (Array a))
history n s = liftEffect (historyImpl n s) >>= hold

foreign import historyImpl :: forall a. Int -> Signal a -> Effect (Signal (Array a))
