-- | The location as a signal, through a router env: the History API in the
-- | browser, or a fixed URL on a server or in a test.
-- |
-- | `location`, `navigate`, `redirect` and `link` read the env from the
-- | current scope's context (`routerKey`, default `browserRouter`), so a
-- | server root can provide `staticRouter` and render without `window`.
module Screamer.Router
  ( Location
  , RouterEnv
  , browserRouter
  , staticRouter
  , RouterKey
  , routerKey
  , withRouter
  , router
  , location
  , navigate
  , redirect
  , link
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Attribute (Attribute)
import Screamer.Context (class ContextKey, ask, provide)
import Screamer.Element (Element, component)
import Screamer.Html (a_)
import Screamer.Html.Attributes (href_)
import Screamer.Html.Handlers (onClick_)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal)
import Screamer.Source (signalSource)
import Web.Event.Event (preventDefault)
import Web.UIEvent.MouseEvent (MouseEvent, altKey, button, ctrlKey, metaKey, shiftKey, toEvent)
import Type.Proxy (Proxy(..))

type Location = { pathname :: String, search :: String, hash :: String }

-- | Where the location comes from and where navigation goes.
-- |
-- | - `current` reads the location now.
-- | - `listen` calls the action whenever the location changes (back,
-- |   forward, `push`, `replace`) until the returned action runs.
-- | - `push` adds a history entry; `replace` replaces the current one.
type RouterEnv =
  { current :: Effect Location
  , listen :: Effect Unit -> Effect (Effect Unit)
  , push :: String -> Effect Unit
  , replace :: String -> Effect Unit
  }

foreign import currentLocation :: Effect Location

foreign import onPopState :: Effect Unit -> Effect (Effect Unit)

foreign import pushState :: String -> Effect Unit

foreign import replaceState :: String -> Effect Unit

foreign import parseLocation :: String -> Location

-- | `window.location` and the History API. `push` and `replace` dispatch a
-- | `popstate` event after changing the history, so every location signal
-- | updates the same way as on back and forward.
browserRouter :: RouterEnv
browserRouter =
  { current: currentLocation
  , listen: onPopState
  , push: pushState
  , replace: replaceState
  }

-- | A fixed location, from a URL such as `/items/7?sort=asc#top` (absolute
-- | URLs work too). `push` and `replace` call the sink and change nothing:
-- | on a server the sink records a redirect. Reads no global.
staticRouter :: String -> (String -> Effect Unit) -> RouterEnv
staticRouter url sink =
  { current: pure (parseLocation url)
  , listen: \_ -> pure (pure unit)
  , push: sink
  , replace: sink
  }

-- | The router env of the current scope; default `browserRouter`.
data RouterKey

instance ContextKey RouterKey RouterEnv where
  keyName _ = "Screamer.Router.RouterKey"
  keyDefault _ = browserRouter

routerKey :: Proxy RouterKey
routerKey = Proxy

-- | Run the body with a different router env. Elements see it when they
-- | are instantiated inside the body: `Element (withRouter env (instantiate el))`.
withRouter :: forall a. RouterEnv -> Owned a -> Owned a
withRouter = provide routerKey

-- | The router env of the current scope. Its `push` and `replace` are
-- | plain effects, for event handlers.
router :: Owned RouterEnv
router = ask routerKey

-- | The current location, updated on every change the env reports.
location :: Owned (Signal Location)
location = do
  env <- router
  loc <- liftEffect $ signalSource =<< env.current
  stop <- liftEffect $ env.listen (loc.put =<< env.current)
  onCleanup stop
  pure loc.signal

-- | Push a new history entry through the current env. From an event
-- | handler, use `push` of the env that `router` returns.
navigate :: String -> Owned Unit
navigate url = router >>= \env -> liftEffect (env.push url)

-- | Replace the current history entry through the current env.
redirect :: String -> Owned Unit
redirect url = router >>= \env -> liftEffect (env.replace url)

-- | An anchor that navigates through the current env without reloading
-- | the page. Clicks with a modifier key or a button other than the main
-- | one are left to the browser, so opening in a new tab still works.
-- | When the backend is not interactive it is a plain `<a href>`.
link :: String -> Array Attribute -> Array Element -> Element
link url attrs children = component do
  env <- router
  let
    follow :: MouseEvent -> Effect Unit
    follow e =
      unless (button e /= 0 || altKey e || ctrlKey e || metaKey e || shiftKey e) do
        preventDefault (toEvent e)
        env.push url
  pure $ a_ ([ href_ url, onClick_ follow ] <> attrs) children
