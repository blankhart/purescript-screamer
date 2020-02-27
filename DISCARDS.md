```purescript

-- foreign import observable :: Observable String -> Element
-- foreign import observable :: Observable Element -> Element
-- foreign import observable :: Observable (Array Element) -> Element

foreign import data Subscription :: Type -> Type

type SubscriptionSpec props state msg = {
  initialize :: {
    props :: props,
    sink :: Sink msg
  } -> Effect state,
  update :: {
    props :: props,
    state :: state,
    sink :: Sink msg
  } -> Effect state,
  destroy :: {
    props :: props,
    state :: state,
    sink :: Sink msg
  } -> Effect Unit
}

type Sink msg = msg -> Effect Unit

--  Use object wrappers to guarantee objects where useful to ensure
--  changes can be identified with reference equality; or use
--  Purescript to require that they be Record types
--  props, state must be row types ?  No, better keep flexibility and do it through the FFI

--  state has type { a :: Int, b :: String }
--  Mutable state has type { a :: Observable Int, b :: Observable String }
--  Immutable state wraps Mutable state; references insert the observable
--  Tracking is built on Immutable values
--  Mutable can be converted to Immutable through unsafeCoerce
--  Use ST phantom type to localize state mutation, so that the only way for components to communicate is through messages
--  The message type is specific to this particular component, so that it can communicate with itself and child components.  The component can expose its message handler to its children, but not to its parent.  (The parent would have the handler definition, but would have no way of calling it.)
type Component props state msg =
  --  All component state will be mutable. If it doesn't change, it should not need to be recomputed.  The only difference would be a constant that needs to be shared between the update and render functions and that would be expensive to compute from the props alone (i.e., is not actually stateful).  But in principle this could be done at the parent level.
  --  NOTE: Should this function be able to perform arbitrary effects?
  { initialize :: props -> (msg -> Effect Unit) -> Effect state
  --  The update function is itself the message sink available to the initialize and render functions, and does not take itself as a parameter.  All state mutation must be routed through the component's update function.  Possibly also call this function "handle" as in "handle msg" since it can perform arbitrary I/O.
  --  NOTE: Since this can perform arbitrary effects, it does not constrain the component from exposing the state to arbitrary buyers.  Doing that would require separating effects from state updates - the update function would need to be bifurcated into an ST-style action (the update) and an Effect-style action (the effects) a la the Elm architecture.  That does not seem practical here.
  , update :: props -> state -> msg -> Effect Unit
  --  The render function is pure, returning an Element rather than an Effect Element, and therefore does not allow state to be modified when rendering.
  --  There doesn't seem to be a good way to constrain event handlers to returning a message internal to the component.  If the handler returned a msg, the framework would need to convert that into an Effect Unit by invoking the update function when the handler was inserted.  That is the point of passing in the Update msg parameter.  The way to do it will be to pass the sink down a level to the onClick, etc., functions, so that the user-supplied function must return a msg.
  --  With this model the handler would have the type:
  --
  --  on :: forall msg . String -> Sink msg -> (Event -> msg) -> Attribute
  --
  --  The user then would supply a pure function from Event -> msg, and the underlying implementation would invoke the update function.
  --  For form controls, it will be useful to have special constructors in a specific module such as:
  --    syncInput :: Observable String -> Array Attribute -> Element
  --  where the Array Attribute does not contain a value placeholder, and any "oninput" action of type (msg -> Effect Unit) is executed after, and in addition to, effectfully syncing the value.
  --  Formlets...?  Individual form elements would be components.
  , render :: props -> (msg -> Effect Unit) -> immutable -> Element
  }


foreign import component ::
  forall props state msg . Component props state msg -> props -> Element

{-
--  Shouldn't subsriptions just be part of component state?  Or is the issue that they need a callback of type Sink msg so they are able to send messages?
--  Unless they will be converted into observables like the rest of the application state they should be handled separately.
  , subscriptions :: { -- Why does the subscription have access to state?
      props :: props, state :: Immutable state
    } -> Array (Subscription msg)
-}


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

-- Just use lambdas / functor / applicative
tracking :: forall r a . IsElement a => Tracking r a -> Element
tracking = observe >>> observable


module Screamer.Observable where

import Effect (Effect)
import Prelude

foreign import kind Region

foreign import kind Port
foreign import data Input :: Port
foreign import data Output :: Port

foreign import data Observable :: Port -> Region -> Type -> Type

type Channel r a = Observable Input r a
type Signal r a = Observable Output r a

-- Emit

foreign import emit :: forall r a . Signal r a -> Effect a

--------------------------------------------------------
-- Channel
-- Signals are read-only but have input ports.
-- Channels are write-only output ports.
-- Values are sent to a signal via channels.

foreign import channel_ :: forall r a c. (c -> Signal r c) -> a -> Effect (Channel r a)

channel :: forall r a. a -> Effect (Channel r a)
channel = channel_ constant

foreign import send_ :: forall r a. (Channel r a) -> a -> Effect Unit

send :: forall a. Channel r a -> a -> Effect Unit
send = send_

-- foreign import modify :: forall r a . (a -> a) -> Ref r a -> Signal r Unit

foreign import subscribe :: forall r a . Channel r a -> Signal r a

--------------------------------------------------------
-- Signal

foreign import constant :: forall r a . a -> Signal r a

instance functorSignal :: Functor (Signal r) where
  map = map_

instance applySignal :: Apply (Signal r) where
  apply = ap

instance applicativeSignal :: Applicative (Signal r) where
  pure = pure_

instance bindSignal :: Bind (Signal r) where
  bind = bind_

instance monadSignal :: Monad (Signal r)

instance semigroupSignal :: Semigroup (Signal r a) where
  append = merge_

instance monoidSignal :: Monoid a => Monoid (Signal r a) where
  mempty = constant mempty

-- Via channels

foreign import map_ :: forall r a b . (a -> b) -> Signal r a -> Signal r b

foreign import pure_ :: forall r a . a -> Signal r a

foreign import bind_ :: forall r a b . Signal r a -> (a -> Signal r b) -> Signal r b

foreign import merge_ :: forall r a b . Signal r a -> (a -> Signal r b) -> Signal r b



```
