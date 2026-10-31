-- | The counter scenario on Screamer, hand-written against Screamer's own
-- | API: the control for `App.Counter.Screamer.Psx`.
module App.Counter.Screamer.Purs (main) where

import Prelude

import Data.Array ((..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, dyn, element, fragment_, mount, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H
import Screamer.Signal (Signal)
import Screamer.Source (signalSource)
import Suite.Shared.Dom (removeApp)

type Props = { label :: String, max :: Int }

data Msg = Increment | Decrement | Reset

update :: Int -> Msg -> Int
update n = case _ of
  Increment -> n + 1
  Decrement -> n - 1
  Reset -> 0

view :: Props -> Signal Int -> (Msg -> Effect Unit) -> Element
view props n send =
  E.section_ [ A.class_ "counter", testId "counter" ]
    [ E.h2_ [ testId "label" ] [ element (props.label <> ": "), text (show <$> n) ]
    , E.button_ [ testId "decrement", H.onClick_ \_ -> send Decrement, A.disabled_ ((_ <= 0) <$> n) ] [ element "-" ]
    , E.button_ [ testId "increment", H.onClick_ \_ -> send Increment, A.disabled_ ((_ >= props.max) <$> n) ] [ element "+" ]
    , dyn $ n <#> \count ->
        if count == 0 then fragment_ []
        else E.button_ [ testId "reset", H.onClick_ \_ -> send Reset ] [ element "Reset" ]
    , E.ol_ [ A.class_ "pips" ]
        (map (\i -> E.li_ [ A.class_ ((\count -> if i <= count then "pip filled" else "pip") <$> n) ] []) (1 .. props.max))
    ]

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure

-- | Mounts in place of `#app`, with the scenario's fixture as the props.
main :: Props -> Effect Unit
main props = do
  removeApp
  void $ mount "#root" $ component do
    n <- liftEffect (signalSource 0)
    pure $ view props n.signal \msg -> n.modifyT1 (\count -> update count msg)
