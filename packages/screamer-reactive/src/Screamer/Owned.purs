-- | Effects with an owner.
-- |
-- | An `Owned` computation runs in a scope. Effects it creates (subscriptions,
-- | held signals, DOM bindings) belong to that scope and are disposed with
-- | it: children first, newest first, then the scope's own cleanups in
-- | reverse order of registration. Disposal is idempotent.
module Screamer.Owned
  ( Scope
  , Owned(..)
  , onCleanup
  , child
  , runOwned
  , onError
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (class MonadEffect)
import Effect.Exception (Error)

foreign import data Scope :: Type

newtype Owned a = Owned (Scope -> Effect a)

instance Functor Owned where
  map f (Owned g) = Owned \s -> map f (g s)

instance Apply Owned where
  apply (Owned f) (Owned g) = Owned \s -> apply (f s) (g s)

instance Applicative Owned where
  pure a = Owned \_ -> pure a

instance Bind Owned where
  bind (Owned g) k = Owned \s -> do
    a <- g s
    let Owned h = k a
    h s

instance Monad Owned

instance MonadEffect Owned where
  liftEffect e = Owned \_ -> e

foreign import onCleanupImpl :: Scope -> Effect Unit -> Effect Unit

foreign import childImpl :: forall a. Scope -> (Scope -> Effect a) -> Effect { value :: a, dispose :: Effect Unit }

foreign import runOwnedImpl :: forall a. (Scope -> Effect a) -> Effect { value :: a, dispose :: Effect Unit }

foreign import onErrorImpl :: Scope -> (Error -> Effect Unit) -> Effect Unit

-- | Run an action when the current scope is disposed.
onCleanup :: Effect Unit -> Owned Unit
onCleanup e = Owned \s -> onCleanupImpl s e

-- | Run in a child scope that can be disposed early. It is disposed with the
-- | current scope at the latest.
child :: forall a. Owned a -> Owned { value :: a, dispose :: Effect Unit }
child (Owned body) = Owned \s -> childImpl s body

-- | Run in a fresh root scope. Errors from its effects that no `onError`
-- | handles are logged and rethrown.
runOwned :: forall a. Owned a -> Effect { value :: a, dispose :: Effect Unit }
runOwned (Owned body) = runOwnedImpl body

-- | Handle errors thrown by effects in the current scope and its children.
onError :: (Error -> Effect Unit) -> Owned Unit
onError handler = Owned \s -> onErrorImpl s handler
