-- | A counter: the smallest Screamer component.
module Screamer.Examples.HelloWorld where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Channel (channel)
import Screamer.Core (Element, component, element, text)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.EventHandler as H
import Screamer.Examples.Harness as Harness

main :: Effect Unit
main = Harness.run "main" counter

counter :: Element
counter = component do
  count <- liftEffect $ channel 0
  pure $ E.div_ [ A.class_ "counter" ]
    [ E.button_ [ A.id_ "decrement", H.onClick_ \_ -> count.modify (_ - 1) ] [ element "-" ]
    , E.span_ [ A.id_ "count" ] [ text (show <$> count.signal) ]
    , E.button_ [ A.id_ "increment", H.onClick_ \_ -> count.modify (_ + 1) ] [ element "+" ]
    ]
