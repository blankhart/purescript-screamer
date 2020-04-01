-- https://github.com/luwes/sinuous/wiki/Choose-your-own-reactive-library

module Screamer.Core where

import Debug.Trace

import Prelude
import Screamer.Observable

import Data.Traversable (sequence)
import Data.Maybe (Maybe)
import Data.Nullable (Nullable)
import Data.Nullable as Nullable
import Effect (Effect)
import Effect.Console (log)
import Unsafe.Coerce (unsafeCoerce)

foreign import data Document :: Type

foreign import data E :: Type

foreign import data V :: Type

-- Running a signal is effectful because it is a time-varying quantity.
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

foreign import element_ :: String -> Array Attribute -> Array Element -> Element

attribute_ :: forall v . IsValue v => String -> v -> Attribute
attribute_ key v = Attribute { key, value: value v }

foreign import on_ :: String -> (Event -> Effect Unit) -> Attribute

-- Internal, highly unsafe accessor for JavaScript object property

foreign import property :: forall a b c . a -> b -> c

--  Primitive types coercible to a sinuous HTML (SVG) element.  Since running a signal is effectful, the opaque type `Element` represents an effectful computation, and is distinct from an actual DOM `Element`.

class IsElement a where
  element :: a -> Element

instance elementIsElement :: IsElement Element where
  element = identity

instance stringIsElement :: IsElement String where
  element = Element <<< pure <<< unsafeCoerce

instance intIsElement :: IsElement Int where
  element = Element <<< pure <<< unsafeCoerce

instance numberIsElement :: IsElement Number where
  element = Element <<< pure <<< unsafeCoerce

instance effectfulIsElement :: IsElement a => IsElement (Signal (Effect a)) where
  element = Element <<< _effectfulSignal

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

instance effectfulIsValue :: IsValue v => IsValue (Signal (Effect v)) where
  value = _effectfulSignal

else instance observableIsValue :: IsValue a => IsValue (Signal a) where
  value = pure <<< unsafeCoerce

foreign import _effectfulSignal :: forall a b . Signal (Effect a) -> b

-- NOT REAL

foreign import tutorial :: Effect Unit

foreign import tick :: Channel Int -> Effect Unit

foreign import component :: forall a . IsElement a => Effect (Signal a) -> Element
