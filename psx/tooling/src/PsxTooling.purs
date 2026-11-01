-- | Compile PSX tools into the consumer workspace without runtime adapter dependencies.
module PsxTooling (cli, suite, removeApp) where

import Prelude (Unit)
import Psx.Cli (main) as Cli
import Suite.Main (main) as Suite
import Suite.Shared.Dom (removeApp) as Dom
import Effect (Effect)

cli :: Effect Unit
cli = Cli.main
suite :: Effect Unit
suite = Suite.main
removeApp :: Effect Unit
removeApp = Dom.removeApp
