module Screamer.Component.Trans (
  Component,
  render,
  ComponentT,
  renderT
) where

import Control.Monad.Writer.Trans (WriterT, runWriterT)
import Data.Identity (Identity(..))
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Aff.Class (class MonadAff)
import Effect.Class (class MonadEffect)
import Prelude
import Screamer.Observable (Signal)

type CleanupFn = Effect Unit

newtype ComponentT m a = ComponentT (WriterT CleanupFn m a)

type Component = ComponentT Identity

derive newtype instance cptFunctor :: Functor m => Functor (ComponentT m)

derive newtype instance cptApply :: Apply m => Apply (ComponentT m)

derive newtype instance cptApplicative :: Applicative m => Applicative (ComponentT m)

derive newtype instance cptBind :: Bind m => Bind (ComponentT m)

derive newtype instance cptMonad :: Monad m => Monad (ComponentT m)

derive newtype instance cptMonadEffect :: MonadEffect m => MonadEffect (ComponentT m)

derive newtype instance cptMonadAff :: MonadAff m => MonadAff (ComponentT m)

foreign import computed_ :: forall a . Signal a -> CleanupFn -> Signal a

renderT :: forall m a . Monad m => ComponentT m (Signal a) -> m (Signal a)
renderT (ComponentT w) = do
  Tuple result cleanup <- runWriterT w
  pure $ computed_ result cleanup

render :: forall a . Component (Signal a) -> Signal a
render c = let Identity x = renderT c in x

-- root
