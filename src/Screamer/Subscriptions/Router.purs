-- | The browser location as a signal, through the History API.
module Screamer.Subscriptions.Router
  ( Location
  , location
  , navigate
  , redirect
  , link
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Channel (channel)
import Screamer.Core (Attribute, Element)
import Screamer.DOM.Attribute (href_)
import Screamer.DOM.Element (a_)
import Screamer.DOM.EventHandler (onClick_)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal)
import Web.Event.Event (preventDefault)
import Web.UIEvent.MouseEvent (MouseEvent, altKey, button, ctrlKey, metaKey, shiftKey, toEvent)

type Location = { pathname :: String, search :: String, hash :: String }

foreign import currentLocation :: Effect Location

-- | Call the action on every `popstate`, until the returned action runs.
foreign import onPopState :: Effect Unit -> Effect (Effect Unit)

foreign import pushState :: String -> Effect Unit

foreign import replaceState :: String -> Effect Unit

-- | The current location, updated on `popstate` (back and forward) and by
-- | `navigate` and `redirect`.
location :: Owned (Signal Location)
location = do
  loc <- liftEffect $ channel =<< currentLocation
  stop <- liftEffect $ onPopState (loc.put =<< currentLocation)
  onCleanup stop
  pure loc.signal

-- | Push a new history entry and update every `location` signal.
navigate :: String -> Effect Unit
navigate = pushState

-- | Replace the current history entry and update every `location` signal.
redirect :: String -> Effect Unit
redirect = replaceState

-- | An anchor that navigates without reloading the page. Clicks with a
-- | modifier key or a button other than the main one are left to the
-- | browser, so opening in a new tab still works.
link :: String -> Array Attribute -> Array Element -> Element
link url attrs = a_ ([ href_ url, onClick_ follow ] <> attrs)
  where
  follow :: MouseEvent -> Effect Unit
  follow e =
    unless (button e /= 0 || altKey e || ctrlKey e || metaKey e || shiftKey e) do
      preventDefault (toEvent e)
      navigate url
