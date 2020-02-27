module Screamer.Observable where

import Prelude

import Effect (Effect)
import Unsafe.Coerce (unsafeCoerce)

foreign import data Channel :: Type -> Type

foreign import data Signal :: Type -> Type

-- Emit

--------------------------------------------------------
--  Channel
--  Channels are write-only output ports.
--  Signals are read-only but have input ports.
--  Values are sent to a signal via channels.
--  Channels are non-empty.
--  The separation of the channel and the signal makes bidirectional syncing potentially more notationally cumbersome, but since the underlying representation is the same this should be the same morally.  The function would be unsafe send :: Signal a -> a -> Effect Unit where it is "known" that the signal is also a channel.

foreign import channel :: forall a . a -> Effect (Channel a)

foreign import send :: forall a. Channel a -> a -> Effect Unit

foreign import modify :: forall a . (a -> a) -> Channel a -> Signal Unit

subscribe :: forall a . Channel a -> Signal a
subscribe = unsafeCoerce

--------------------------------------------------------
-- Signal

foreign import get :: forall a . Signal a -> Effect a

foreign import emit :: forall a . Signal (Effect a) -> Effect a

instance functorSignal :: Functor Signal where
 map = map_

instance applySignal :: Apply Signal where
 apply = apply_

instance applicativeSignal :: Applicative Signal where
 pure = pure_

instance semigroupSignal :: Semigroup (Signal a) where
 append = merge_

instance monoidSignal :: Monoid a => Monoid (Signal a) where
 mempty = pure_ mempty

foreign import map_ :: forall a b . (a -> b) -> Signal a -> Signal b

foreign import pure_ :: forall a . a -> Signal a

foreign import apply_ :: forall a b . (Signal (a -> b)) -> Signal a -> Signal b

foreign import merge_ :: forall a . Signal a -> Signal a -> Signal a

