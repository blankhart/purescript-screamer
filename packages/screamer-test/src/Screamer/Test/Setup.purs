-- | Node-only DOM test bootstrap. Call from a preload before importing
-- | application/test modules. Requires jsdom and Node 22.15 or later.
-- | The compiled module has a stable path even for git Spago dependencies:
-- | `output/Screamer.Test.Setup/index.js`.
module Screamer.Test.Setup
  ( setup
  , setupWith
  ) where

import Prelude

import Effect (Effect)

-- | Install jsdom globals and stub CSS imports. Repeated calls are harmless.
setup :: Effect Unit
setup = setupWith { stubCss: true }

-- | Disable CSS stubbing when testing a custom stylesheet loader. Existing
-- | globals are preserved (except window); no layout engine is installed.
foreign import setupWith :: { stubCss :: Boolean } -> Effect Unit
