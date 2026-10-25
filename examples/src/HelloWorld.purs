-- | A counter: the smallest Screamer component.
module Screamer.Examples.HelloWorld where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, element, text)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Source (signalSource)

main :: Effect Unit
main = Harness.run "main" counter

counter :: Element
counter = component do
  count <- liftEffect $ signalSource 0
  pure $ E.div_ [ A.class_ "counter" ]
    [ E.button_ [ A.id_ "decrement", H.onClick_ \_ -> count.modifyT1 (_ - 1) ] [ element "-" ]
    , E.span_ [ A.id_ "count" ] [ text (show <$> count.signal) ]
    , E.button_ [ A.id_ "increment", H.onClick_ \_ -> count.modifyT1 (_ + 1) ] [ element "+" ]
    ]
