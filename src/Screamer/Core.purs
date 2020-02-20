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

foreign import on :: String -> (Event -> Effect Unit) -> Attribute

foreign import element :: String -> Array Attribute -> Array Element -> Element

-- Primitive types coercible to an HTML (SVG?) element

class IsElement e

instance elementIsElement :: IsElement Element 
instance stringIsElement :: IsElement String 
instance intIsElement :: IsElement Int 
instance numberIsElement :: IsElement Number
instance observableIsElement :: IsElement a => IsElement (Observable a)

coerce :: forall a . IsElement a => a -> Element 
coerce = unsafeCoerce

text :: String -> Element 
text = unsafeCoerce

integer :: Int -> Element 
integer = unsafeCoerce

number :: Number -> Element
number = unsafeCoerce 

observable :: forall a . IsElement a => Observable a -> Element 
observable = unsafeCoerce

tracking :: forall r a . IsElement a => Tracking r a -> Element 
tracking = observe >>> observable

-- h(type: string, props: object, ...children).
-- props must be an object

-- foreign import observable :: Observable String -> Element
-- foreign import observable :: Observable Element -> Element
-- foreign import observable :: Observable (Array Element) -> Element


type Sink a = a -> Effect Unit

-- type Component

-- type Subscription

foreign import tutorial :: Effect Unit 

foreign import mount :: Effect Element -> Effect Unit

foreign import tick :: Observable Int -> Effect Unit

hello :: Effect Unit 
hello = do 
  counter <- new 0
  mount $ pure $
    element "div" 
      [ attribute "style" "color: blue;"
      ]
      [ observable counter
      , element "br" [] []
      , tracking $ map (_ + 2) (sample counter)
      , element "br" [] []
      , tracking $ map (_ + 5) (sample counter)
      , element "br" [] []
      , element "button" [ on "click" \_ -> put 0 counter
      ] [ text "Reset" ]
      ] 
  tick counter

