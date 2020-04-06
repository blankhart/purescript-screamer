-- https://github.com/luwes/sinuous/wiki/Choose-your-own-reactive-library

module Screamer.Core where

import Debug.Trace

import Prelude
import Screamer.Observable

import Data.Maybe (Maybe)
import Data.Nullable (Nullable)
import Data.Nullable as Nullable
import Effect (Effect)
import Unsafe.Coerce (unsafeCoerce)

foreign import data Document :: Type

foreign import data E :: Type

foreign import data V :: Type

-- Morally this is a newtype over forall e . Coercible e => Effect e
-- where Coercible is evidence that e is coercible to E, the types
-- that the sinuous variant of hyperscript can render as a DOM element.
-- Performing the coercion requires evaluating the effectful
-- computation.
-- Reading a sinuous observable is effectful because it represents
-- a time-varying quantity.
newtype Element = Element (Effect E)

newtype Attribute = Attribute { key :: String, value :: Effect V }

foreign import data Event :: Type

-- Document

foreign import documentImpl :: Document

document :: Document
document = documentImpl

foreign import querySelectorImpl :: Document -> String -> Effect (Nullable Element)

-- QuerySelector

querySelector :: Document -> String -> Effect (Maybe Element)
querySelector doc sel = Nullable.toMaybe <$> querySelectorImpl doc sel

-- QuerySelectorAll

foreign import querySelectorAll :: Document -> String -> Effect (Array Element)

-- Run an element

foreign import mount :: String -> Element -> Effect Unit

-- HTML Element creation

-- Rename to html_
foreign import element_ :: String -> Array Attribute -> Array Element -> Element

foreign import svgElement_ :: String -> Array Attribute -> Array Element -> Element

foreign import elements_ :: forall a. Signal (Array a) -> (a -> Element) -> Element

attribute_ :: forall v . IsValue v => String -> v -> Attribute
attribute_ key v = Attribute { key, value: value v }

foreign import on_ :: String -> (Event -> Effect Unit) -> Attribute

--  Primitive types coercible to a sinuous HTML (SVG) element.  Since running a signal is effectful, the opaque type `Element` represents an effectful computation, and is distinct from an actual DOM `Element`.

class IsElement a where
  element :: a -> Element

-- Need instance IsElement E

instance elementIsElement :: IsElement Element where
  element = identity

instance stringIsElement :: IsElement String where
  element = Element <<< pure <<< unsafeCoerce

instance intIsElement :: IsElement Int where
  element = Element <<< pure <<< unsafeCoerce

instance numberIsElement :: IsElement Number where
  element = Element <<< pure <<< unsafeCoerce

--  NOTE: This doesn't actually have much meaning on its own.  A dynamic component would wrap a Signal (Effect a), but only because it would be a Signal Element.
instance effectfulIsElement :: IsElement a => IsElement (Signal (Effect a)) where
  element = _effectfulSignal

-- Need instance Signal Element

else instance observableIsElement :: IsElement a => IsElement (Signal a) where
  element = Element <<< pure <<< unsafeCoerce

--  Primitive types coercible to a Sinuous HTML attribute value.

class IsValue v where
  value :: v -> Effect V

instance booleanIsValue :: IsValue Boolean where
  value = pure <<< unsafeCoerce

instance stringIsValue :: IsValue String where
  value = pure <<< unsafeCoerce

instance intIsValue :: IsValue Int where
  value = pure <<< unsafeCoerce

instance numberIsValue :: IsValue Number where
  value = pure <<< unsafeCoerce

-- Just for style tag...
instance recordIsValue :: IsValue (Record a) where
  value = pure <<< unsafeCoerce

instance effectfulIsValue :: IsValue v => IsValue (Signal (Effect v)) where
  value = _effectfulSignal

else instance observableIsValue :: IsValue a => IsValue (Signal a) where
  value = pure <<< unsafeCoerce

-- While handled through the FFI, morally b ~ Effect (Signal a)
foreign import _effectfulSignal :: forall a b . Signal (Effect a) -> b

-- NOT REAL

foreign import tutorial :: Effect Unit

foreign import tick :: Channel Int -> Effect Unit

foreign import component :: forall a . IsElement a => Effect (Signal a) -> Element
