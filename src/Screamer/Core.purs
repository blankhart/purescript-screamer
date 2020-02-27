-- https://github.com/luwes/sinuous/wiki/Choose-your-own-reactive-library

module Screamer.Core where

import Prelude
import Screamer.Observable

import Data.Maybe (Maybe)
import Data.Nullable (Nullable)
import Data.Nullable as Nullable
import Effect (Effect)
import Effect.Console (log)
import Unsafe.Coerce (unsafeCoerce)

foreign import data Document :: Type

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

foreign import attribute :: String -> String -> Attribute

foreign import handler :: String -> (Event -> Effect Unit) -> Attribute

foreign import element :: String -> Array Attribute -> Array Element -> Element

-- Primitive types coercible to an HTML (SVG?) element

class IsElement e

instance elementIsElement :: IsElement Element
instance stringIsElement :: IsElement String
instance intIsElement :: IsElement Int
instance numberIsElement :: IsElement Number
instance observableIsElement :: IsElement a => IsElement (Signal a)

coerce :: forall a . IsElement a => a -> Element
coerce = unsafeCoerce

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
