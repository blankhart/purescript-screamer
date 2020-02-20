module Screamer.Observable where 

import Effect (Effect)
import Prelude

foreign import data Observable :: Type -> Type

foreign import new_ :: forall a . a -> Effect (Observable a)

new :: forall a . a -> Effect (Observable a)
new = new_

foreign import get :: forall a . Observable a -> Effect a

gets :: forall a b . (a -> b) -> Observable a -> Effect b
gets f o = f <$> get o

foreign import put :: forall a . a -> Observable a -> Effect Unit

foreign import modify :: forall a . (a -> a) -> Observable a -> Effect Unit

-- Use state thread-like techniques to restrict arbitrary effects
foreign import kind Region 

-- The only impurity should relate to the Observable effect
newtype Tracking (r :: Region) (a :: Type) = Tracking (Effect a)

derive instance functorTracking :: Functor (Tracking r)
-- apply, bind, applicative, monad, semigroup, monoid

-- Capture an observable as an effectful thunk
sample :: forall r a . Observable a -> Tracking r a
sample o = Tracking (get o)

-- Retrieve the effectful thunk
foreign import observe :: forall r a . Tracking r a -> Observable a

-- NOTE: Is this silly?  The region can be escaped by converting to an observable
-- and then back again.  

-- Ideally the type system would ensure that a Tracking r value can be 
-- obtained only from an Observable value.