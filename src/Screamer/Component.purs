module Screamer.Component.Trans {- (
  Component,
  render,
) -} where

import Prelude

import Control.Monad.Writer.Trans (WriterT, runWriterT)
import Data.Identity (Identity(..))
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Aff.Class (class MonadAff)
import Effect.Class (class MonadEffect, liftEffect)
import Screamer.Observable (Signal)

type CleanupFn = Effect Unit

newtype Component a = Component (Effect { result :: a, cleanup :: Effect Unit })

instance cptFunctor :: Functor Component where
  map f (Component e) = Component $
    map (\r -> r { result = f r.result } ) e

instance cptApply :: Apply Component where
  apply = ap

instance cptApplicative :: Applicative Component where
  pure a = Component (pure { result: a, cleanup: pure unit })

instance cptBind :: Bind Component where
  bind (Component prev) k = Component $
    prev >>= \p -> case k p.result of
      Component next ->
        map (\n -> n { cleanup = p.cleanup *> n.cleanup }) next

instance cptMonad :: Monad Component

instance cptMonadEffect :: MonadEffect Component where
  liftEffect e = Component (e >>= \a -> pure { result: a, cleanup: pure unit })

{-

newtype ComponentT m a = ComponentT (WriterT CleanupFn m a)

type Component = ComponentT Identity

derive newtype instance cptFunctor :: Functor m => Functor (ComponentT m)

derive newtype instance cptApply :: Apply m => Apply (ComponentT m)

derive newtype instance cptApplicative :: Applicative m => Applicative (ComponentT m)

derive newtype instance cptBind :: Bind m => Bind (ComponentT m)

derive newtype instance cptMonad :: Monad m => Monad (ComponentT m)

derive newtype instance cptMonadEffect :: MonadEffect m => MonadEffect (ComponentT m)

derive newtype instance cptMonadAff :: MonadAff m => MonadAff (ComponentT m)

renderT :: forall m a . Monad m => ComponentT m (Signal a) -> m (Signal a)
renderT (ComponentT w) = do
  Tuple result cleanup <- runWriterT w
  pure $ computed_ result cleanup

render :: forall a . Component (Signal a) -> Signal a
render c = let Identity x = renderT c in x

-}

--  This has to run in Effect
--  Essentially since everything has to run in Effect, this is a thin wrapper over sinuous...

foreign import computed_ :: forall a . Signal a -> CleanupFn -> Signal a

renderT :: forall m a . Monad m => ComponentT m (Signal a) -> m (Signal a)
renderT (ComponentT w) = do
  Tuple result cleanup <- runWriterT w
  pure $ computed_ result cleanup

render :: forall a . Component (Signal a) -> Signal a
render (Component e) = do


-- root
