-- | Attributes: what an element sets on its DOM node. Each is a value that
-- | `Screamer.Element.element_` applies when the element is instantiated;
-- | one bound to a `Signal` stays up to date while the element lives.
module Screamer.Attribute
  ( Attribute
  , property
  , attribute
  , booleanAttribute
  , styleProperty
  , attributes
  , on_
  , unsafeOn_
  , class AttrValue
  , toSignal
  ) where

import Prelude

import Effect (Effect)
import Screamer.Signal (Signal)
import Web.Event.Event (Event)

foreign import data Attribute :: Type

-- | Set a DOM property.
foreign import property :: forall a. String -> Signal a -> Attribute

-- | Set an attribute.
foreign import attribute :: String -> Signal String -> Attribute

-- | Add an attribute when true and remove it when false.
foreign import booleanAttribute :: String -> Signal Boolean -> Attribute

-- | Set one CSS property, by its CSS name.
foreign import styleProperty :: String -> Signal String -> Attribute

-- | Several attributes as one.
foreign import attributes :: Array Attribute -> Attribute

-- | Listen for an event. The handler runs inside `batch`, and the listener
-- | is removed when the element's scope is disposed.
foreign import on_ :: String -> (Event -> Effect Unit) -> Attribute

-- | `on_` for a handler that expects a more specific event type. The caller
-- | asserts that events of this name have that type; the generated handlers
-- | in `Screamer.Html.Handlers` are the intended users.
foreign import unsafeOn_ :: forall e. String -> (e -> Effect Unit) -> Attribute

-- | Attribute values: a constant of type `a`, or a `Signal a`.
class AttrValue v a | v -> a where
  toSignal :: v -> Signal a

instance AttrValue (Signal a) a where
  toSignal = identity
else instance AttrValue a a where
  toSignal = pure
