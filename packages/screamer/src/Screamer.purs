-- | The Screamer prelude: what most components need, in one import.
-- |
-- | `Signal` and `Event` are exported as types only, since many of their
-- | operators share names; import `Screamer.Signal` and `Screamer.Event`
-- | qualified for those.
module Screamer
  ( module Screamer.Element
  , module Screamer.Signal
  , module Screamer.Event
  , module Screamer.Source
  , module Screamer.Owned
  , module Effect.Class
  ) where

import Effect.Class (liftEffect)
import Screamer.Element (Element, component, dyn, dynKeyed, each, mount, suspense, text)
import Screamer.Event (Event)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal)
import Screamer.Source (batch, eventSource, signalSource)
