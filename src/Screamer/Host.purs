-- | The clock, timers and animation frames, as a context value.
-- |
-- | `Screamer.Time` and `Screamer.Resource.retry` read the host from the
-- | scope they are instantiated in, so a test or another platform can
-- | `withHost` a fake one and drive time itself. The default is
-- | `browserHost`.
module Screamer.Host
  ( Host
  , browserHost
  , hostKey
  , host
  , withHost
  ) where

import Prelude

import Effect (Effect)
import Screamer.Context (Key, ask, key, provide)
import Screamer.Owned (Owned)

-- | Each scheduling function returns the action that cancels what it
-- | scheduled; cancelling twice, or after it ran, is a no-op. Callbacks
-- | are not batched by the host; `Screamer.Time` batches them.
type Host =
  { now :: Effect Number
  , setTimeout :: Number -> Effect Unit -> Effect (Effect Unit)
  , setInterval :: Number -> Effect Unit -> Effect (Effect Unit)
  , requestFrame :: (Number -> Effect Unit) -> Effect (Effect Unit)
  }

-- | `Date.now`, `setTimeout`, `setInterval` and `requestAnimationFrame`.
-- | Each global is read when it is called, so the module loads where they
-- | are missing.
foreign import browserHost :: Host

hostKey :: Key Host
hostKey = key "host" browserHost

-- | The host of the current scope.
host :: Owned Host
host = ask hostKey

-- | Run the body with a different host.
withHost :: forall a. Host -> Owned a -> Owned a
withHost = provide hostKey
