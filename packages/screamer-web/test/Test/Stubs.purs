-- | Stand-ins for browser APIs, for the jsdom tests.
module Test.Stubs where

import Prelude

import Effect (Effect)
import Web.DOM.Element (Element)

foreign import installMatchMedia :: Effect Unit
foreign import uninstallMatchMedia :: Effect Unit
foreign import setMedia :: String -> Boolean -> Effect Unit

foreign import installObservers :: Effect Unit
foreign import uninstallObservers :: Effect Unit
foreign import resizeTo :: Number -> Number -> Effect Unit
foreign import intersect :: Boolean -> Effect Unit
foreign import liveObservers :: Effect Int
foreign import newElement :: Effect Element

foreign import clearStorage :: Effect Unit
foreign import otherTabWrites :: String -> String -> Effect Unit
foreign import storedLocal :: String -> Effect String

foreign import setVisibility :: String -> Effect Unit
foreign import setOnline :: Boolean -> Effect Unit
