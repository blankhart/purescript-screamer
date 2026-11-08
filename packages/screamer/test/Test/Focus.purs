module Test.Focus (spec) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Attribute (attribute, property)
import Screamer.Element (dyn, element_, fragment_, mount, text)
import Screamer.Source (signalSource)
import Screamer.Test (withoutStrict)
import Screamer.Test.Dom (resetBody)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

foreign import focus :: String -> Effect Unit
foreign import focused :: String -> Effect Boolean
foreign import warnings :: Effect Unit -> Effect (Array String)

spec :: Spec Unit
spec = describe "dyn and focus" do
  it "warns once per dyn when rebuilding a focused descendant, naming the input" do
    liftEffect resetBody
    model <- liftEffect $ signalSource ""
    stop <- liftEffect $ mount "#root" $ dyn $ model.signal <#> \value ->
      element_ "div" [] [ element_ "input" [ attribute "id" (pure "draft"), property "value" (pure value) ] [] ]
    liftEffect $ focus "#draft"
    messages <- liftEffect $ warnings $ withoutStrict $ model.putT1 "a"
    messages `shouldEqual` [ "screamer SCR004: dyn is rebuilding focused <input#draft>; keep inputs outside dyn and bind their values to signals" ]
    liftEffect (focused "#draft") >>= shouldEqual false
    liftEffect $ focus "#draft"
    liftEffect (warnings $ withoutStrict $ model.putT1 "ab") >>= shouldEqual []
    liftEffect $ focus "#draft"
    liftEffect (warnings stop) >>= shouldEqual []

  it "retains focus for static signal-bound inputs beside a rebuilding preview" do
    liftEffect resetBody
    model <- liftEffect $ signalSource ""
    stop <- liftEffect $ mount "#root" $ fragment_
      [ element_ "input" [ attribute "id" (pure "draft"), property "value" model.signal ] []
      , dyn (model.signal <#> \value -> text (pure value))
      ]
    liftEffect $ focus "#draft"
    liftEffect (warnings $ model.putT1 "a") >>= shouldEqual []
    liftEffect (focused "#draft") >>= shouldEqual true
    liftEffect stop
