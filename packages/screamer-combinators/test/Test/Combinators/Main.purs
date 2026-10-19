module Test.Combinators.Main (main) where

import Prelude

import Effect (Effect)
import Screamer.Test (runSpec)
import Test.Event as Event
import Test.Flatten as Flatten
import Test.Host as Host
import Test.Sharing as Sharing
import Test.Time as Time

main :: Effect Unit
main = runSpec do
  Event.spec
  Flatten.spec
  Sharing.spec
  Time.spec
  Host.spec
