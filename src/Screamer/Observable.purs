--  Channels are write-only output ports.
--  Signals are read-only but have input ports.
--  Signals subscribe to channels.
--  Values are sent to a signal via channels.
--  Channels are non-empty.

--  The separation of the channel and the signal makes bidirectional syncing potentially more notationally cumbersome, but since the underlying representation is the same this should be the same morally.  The function would be unsafe send :: Signal a -> a -> Effect Unit where it is "known" that the signal is also a channel.

-- | Signal implementation.
--  Some basic priciples adhered to in this implementation:
--  * Actions which modify the signal graph but have no other side effects are considered a part of the runtime rather than as having effectful semantics.
--  * Actions which alter signals based only on temporal characteristics (such as debouncing or throttling) are not regarded as introducing new effects - i.e., they do not transform `Signal a` into a `Signal (Effect a)`.  The notion of a signal is inherently time-varying and sampling its value always runs in effect.

-- TODO: Signals are inherently effectful, in that they are set by effects and read in effects. This is evident from the ability to convert a Signal (Effect a) into an Effect (Signal a). They have different meanings but are closely allied. 
-- See the `unwrap` function in the original purescript-signal implementation.  Takes a signal of effects of `a`, and produces an effect which returns a signal which will take each effect produced by the input signal, run it, and yield its returned value.

module Screamer.Observable where

import Prelude

import Effect (Effect)
import Unsafe.Coerce (unsafeCoerce)

--  A channel represents a writable memory cell and so resembles an IORef or STRef.  It is fully effectful because its value is time-varying.
foreign import data Channel :: Type -> Type

foreign import channel :: forall a . a -> Effect (Channel a)

foreign import send :: forall a . Channel a -> a -> Effect Unit

foreign import modify :: forall a . (a -> a) -> Channel a -> Effect Unit

--------------------------------------------------------
-- Signal

foreign import data Signal :: Type -> Type

-- of?
subscribe :: forall a . Channel a -> Signal a
subscribe = unsafeCoerce

--  When is it appropriate to depend on the signal?  This is effectful and should only run in a computed, which generally should be run in the FFI.
--  So users of the library arguably should only need one of o() or sample(o) and the result would have the semantics of sample(o).
foreign import get :: forall a . Signal a -> Effect a

--  Possibly omit or keep get with this name to avoid confusion with the sinuous API.
foreign import sample :: forall a . Signal a -> Effect a

foreign import emit :: forall a . Signal (Effect a) -> Effect a

instance functorSignal :: Functor Signal where
 map = map_

instance applySignal :: Apply Signal where
 apply = apply_

instance applicativeSignal :: Applicative Signal where
 pure = pure_

instance semigroupSignal :: Semigroup (Signal a) where
  append = merge

instance monoidSignal :: Monoid a => Monoid (Signal a) where
  mempty = empty

foreign import map_ :: forall a b . (a -> b) -> Signal a -> Signal b

foreign import pure_ :: forall a . a -> Signal a

foreign import apply_ :: forall a b . (Signal (a -> b)) -> Signal a -> Signal b

empty :: forall a. Monoid a => Signal a
empty = pure mempty

foreign import merge :: forall a . Signal a -> Signal a -> Signal a

foreign import scan :: forall a b. (a -> b -> b) -> b -> Signal a -> Signal b

foreign import filter :: forall a. (a -> Boolean) -> a -> Signal a -> Signal a

-- foreign import filterMap -- catMaybes?

-- mapWithIndex

-- drop, dropWhile
-- take, takeWhile

-- keep (only the last n)

-- zip
-- zipWith

-- race

-- foreign import distinct :: forall a. (Eq a) => Signal a -> Signal a

-- every (emit timestamp every X milliseconds)

--  Delays the emission of items from the source Observable by a given timeout or until a given Date.
-- delay
-- https://github.com/ReactiveX/rxjs/blob/master/src/internal/operators/delay.ts

--  Emits a notification from the source Observable only after a particular time span has passed without another source emission.
-- debounceTime

--  Emits a value from the source Observable, then ignores subsequent source values for `duration` milliseconds, then repeats this process.
-- throttleTime

-- timeout
-- https://github.com/ReactiveX/rxjs/blob/master/src/internal/operators/timeout.ts

-- timestamp

--  Possible to implement notion of a completing observable, if unsubscribe?  It would send Just values and then a special Nothing token to indicate that it has completed.  That (or probably, just ahead of the update immediately after that) would be when cleanup() triggers unsubscribe.  The RxJS use of this seems intended to allow observables to be populated with finite static arrays.

---------------------------

foreign import trial :: forall a . Effect a -> Effect Unit -> Effect (Signal a)
