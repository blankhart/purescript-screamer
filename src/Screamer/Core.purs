-- https://github.com/luwes/sinuous/wiki/Choose-your-own-reactive-library

module Screamer.Core where

import Debug.Trace

import Prelude
import Screamer.Observable

import Data.Maybe (Maybe)
import Data.Nullable (Nullable)
import Data.Nullable as Nullable
import Effect (Effect)
import Effect.Console (log)
import Unsafe.Coerce (unsafeCoerce)

foreign import data Document :: Type

-- Running a signal is effectful because it is a time-varying quantity.
foreign import data Element :: Type

foreign import data Attribute :: Type

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

-- HTML Element creation

foreign import attribute :: forall v . IsValue v => String -> v -> Attribute

foreign import on :: String -> (Event -> Effect Unit) -> Attribute

foreign import element :: String -> Array Attribute -> Array Element -> Element

foreign import property :: forall a b c . a -> b -> c

--  Primitive types coercible to a sinuous HTML (SVG) element.  Since running a signal is effectful, the opaque type `Element` represents an effectful computation, and is distinct from an actual DOM `Element`.

class IsElement e

instance elementIsElement :: IsElement Element
instance stringIsElement :: IsElement String
instance intIsElement :: IsElement Int
instance numberIsElement :: IsElement Number
instance observableIsElement :: IsElement a => IsElement (Signal a)

--  Primitive types coercible to a Sinuous HTML attribute value.

class IsValue a

instance stringIsValue :: IsValue String
instance intIsValue :: IsValue Int
instance numberIsValue :: IsValue Number
instance observableIsValue :: IsValue a => IsValue (Signal a)

text :: String -> Element
text = unsafeCoerce

integer :: Int -> Element
integer = unsafeCoerce

number :: Number -> Element
number = unsafeCoerce

signal :: forall a . IsElement a => Signal a -> Element
signal = unsafeCoerce

foreign import mount :: String -> Effect Element -> Effect Unit

-- NOT REAL

foreign import tutorial :: Effect Unit

foreign import tick :: Channel Int -> Effect Unit

foreign import component :: forall a . IsElement a => Effect (Signal a) -> Element
