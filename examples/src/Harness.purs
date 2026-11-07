-- | Mounts an example and exposes its unmount action and the core's
-- | counters as `window.screamerExample`, for the browser smoke tests, and
-- | the development tools as `window.__SCREAMER_DEVTOOLS__`, for
-- | `npm run inspect`.
module Screamer.Examples.Harness (run) where

import Prelude

import Effect (Effect)
import Screamer.Devtools (exposeGlobal)
import Screamer.Element (Element, mount)
import Screamer.Runtime (Stats, readStats)

foreign import expose :: { unmount :: Effect Unit, stats :: Effect Stats } -> Effect Unit

run :: String -> Element -> Effect Unit
run selector app = do
  exposeGlobal
  unmount <- mount selector app
  expose { unmount, stats: readStats }
