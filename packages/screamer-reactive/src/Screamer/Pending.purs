-- | Work in flight, counted per scope.
-- |
-- | `pending` registers one unit of work on the current scope and returns
-- | its `done`. `settled` is true when no work is pending in the current
-- | scope's subtree. `Screamer.Resource` registers each request, so a
-- | parent can show a spinner, or a renderer can wait, until everything
-- | under it has loaded. Disposing a scope calls `done` for its
-- | outstanding work.
module Screamer.Pending
  ( pending
  , pendingIn
  , settled
  ) where

import Prelude

import Effect (Effect)
import Screamer.Owned (Owned(..), Scope)
import Screamer.Signal (Signal)

foreign import pendingImpl :: Scope -> Effect (Effect Unit)

foreign import settledImpl :: Scope -> Effect (Signal Boolean)

-- | Register one unit of work on the current scope and its ancestors.
-- | Returns its `done`, which can be called more than once.
pending :: Owned (Effect Unit)
pending = Owned pendingImpl

-- | An action that registers work on the current scope, for work that
-- | starts later, outside `Owned`. Each run is like `pending`; after the
-- | scope is disposed it registers nothing.
pendingIn :: Owned (Effect (Effect Unit))
pendingIn = Owned \s -> pure (pendingImpl s)

-- | True when no work is pending in the current scope or any scope under
-- | it.
settled :: Owned (Signal Boolean)
settled = Owned settledImpl
