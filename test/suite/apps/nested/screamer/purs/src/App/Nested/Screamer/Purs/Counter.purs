-- | The child: a Screamer component with its own count, which tells its
-- | parent each new count.
module App.Nested.Screamer.Purs.Counter
  ( Input
  , counter
  ) where

import Prelude

import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, element, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H
import Screamer.Signal (Signal, readT0)
import Screamer.Source (signalSource)

type Input = { id :: Int, label :: String, start :: Int }

-- | Its own count, in a source the instance creates; `report` tells the
-- | parent each new count.
counter :: Input -> (Int -> Effect Unit) -> Element
counter input report = component do
  count <- liftEffect (signalSource input.start)
  let
    by d = do
      n <- (_ + d) <$> readT0 count.signal
      count.putT1 n
      report n
  pure $ view input count.signal by

view :: Input -> Signal Int -> (Int -> Effect Unit) -> Element
view input count by =
  E.div_ [ A.class_ "counter", testId ("counter-" <> show input.id) ]
    [ E.span_ [ A.class_ "count" ] [ element (input.label <> ": "), text (show <$> count) ]
    , E.button_ [ testId ("decrement-" <> show input.id), H.onClick_ \_ -> by (-1) ] [ element "-" ]
    , E.button_ [ testId ("increment-" <> show input.id), H.onClick_ \_ -> by 1 ] [ element "+" ]
    ]

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure
