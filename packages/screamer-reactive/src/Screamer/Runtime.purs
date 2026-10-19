-- | The reactive runtime. Its foreign module is `src/Screamer/Runtime.ts`,
-- | which the other foreign modules import at run time as
-- | `../Screamer.Runtime/foreign.js`, so every module shares one graph.
module Screamer.Runtime
  ( Stats
  , readStats
  ) where

import Effect (Effect)

-- | Introspection counters, maintained in development builds.
type Stats =
  { liveEffects :: Int
  , liveScopes :: Int
  , links :: Int
  , effectRuns :: Int
  , steps :: Int
  }

foreign import readStats :: Effect Stats
