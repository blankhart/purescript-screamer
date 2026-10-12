-- | Mounts an example and exposes its unmount action and the core's
-- | counters as `window.screamerExample`, for the browser smoke tests.
module Screamer.Examples.Harness (run) where

import Prelude

import Effect (Effect)
import Screamer.Core (Element, mount)
import Screamer.Reactive.Core (Stats, readStats)

foreign import expose :: { unmount :: Effect Unit, stats :: Effect Stats } -> Effect Unit

run :: String -> Element -> Effect Unit
run selector app = do
  unmount <- mount selector app
  expose { unmount, stats: readStats }
