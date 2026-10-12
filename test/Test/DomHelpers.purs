-- | jsdom helpers for the DOM tests.
module Test.DomHelpers
  ( resetBody
  , innerHTML
  , click
  , currentTag
  , liveListeners
  , mutationsDuring
  , rowNodes
  , sameNode
  , textsOf
  , propertyOf
  ) where

import Prelude

import Effect (Effect)
import Web.DOM.Node (Node)
import Web.Event.Event (Event)

-- | Replace the body with `<main id="root"></main>`.
foreign import resetBody :: Effect Unit

foreign import innerHTML :: String -> Effect String

-- | Dispatch a click on the first element matching the selector.
foreign import click :: String -> Effect Unit

-- | Event listeners added and not yet removed, across all targets.
foreign import liveListeners :: Effect Int

-- | Run an action and return the number of distinct nodes it mutated under the selector.
foreign import mutationsDuring :: String -> Effect Unit -> Effect Int

-- | The `data-key` and node of each element matching the selector, in document order.
foreign import rowNodes :: String -> Effect (Array { key :: String, node :: Node })

foreign import sameNode :: Node -> Node -> Boolean

-- | The text content of each element matching the selector.
foreign import textsOf :: String -> Effect (Array String)

-- | A string property of the first element matching the selector.
foreign import propertyOf :: String -> String -> Effect String

-- | The tag name of the event's current target.
foreign import currentTag :: Event -> String
