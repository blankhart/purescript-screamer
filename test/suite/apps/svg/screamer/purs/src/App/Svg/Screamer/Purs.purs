-- | The svg scenario on Screamer, hand-written against Screamer's own API:
-- | the control for `App.Svg.Screamer.Psx`.
module App.Svg.Screamer.Purs (main) where

import Prelude

import Control.Apply (lift2)
import Data.Array as Array
import Data.Maybe (Maybe(..), fromMaybe, isNothing)
import Data.String as String
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (signalSource)
import Suite.Shared.Dom (removeApp)
import Screamer.Element (Element, component, dyn, element, fragment_, mount, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H
import Screamer.Svg as Svg

type Fixture = { values :: Array Int, max :: Int }

-- | What the view shows and what its handlers do.
type Props =
  { values :: Signal (Array Int)
  , selected :: Signal (Maybe Int)
  , count :: Int
  , select :: Int -> Effect Unit
  , grow :: Effect Unit
  }

-- | A bar's left edge and top, in the chart's coordinates.
left :: Int -> Int
left i = 10 + 20 * i

barTop :: Int -> Int
barTop v = 55 - 4 * v

-- | The line through the tops of the bars.
trend :: Array Int -> String
trend values = String.joinWith " " (Array.mapWithIndex point values)
  where
  point i v = (if i == 0 then "M " else "L ") <> show (left i + 8) <> " " <> show (barTop v)

value :: Int -> Array Int -> Int
value i values = fromMaybe 0 (Array.index values i)

caption :: Maybe Int -> Array Int -> String
caption selected values = case selected of
  Just i -> "Bar " <> show i <> ": " <> show (value i values)
  Nothing -> "Click a bar"

chart :: Fixture -> Element
chart fixture = component do
  values <- liftEffect $ signalSource fixture.values
  selected <- liftEffect $ signalSource Nothing
  let
    grow = readT0 selected.signal >>= case _ of
      Just i -> values.modifyT1 \vs -> fromMaybe vs (Array.modifyAt i (\v -> min fixture.max (v + 1)) vs)
      Nothing -> pure unit
  pure $ view { values: values.signal, selected: selected.signal, count: Array.length fixture.values, select: selected.putT1 <<< Just, grow }

view :: Props -> Element
view props =
  E.figure_ [ A.class_ "chart", testId "chart" ]
    [ Svg.svg_ [ Svg.viewBox_ "0 0 120 60", attribute "width" (pure "360"), attribute "height" (pure "180") ]
        [ Svg.g_ [ A.class_ "bars" ] (map bar (Array.range 0 (props.count - 1)))
        , Svg.path_ [ A.class_ "trend", Svg.d_ (trend <$> props.values), Svg.fill_ "none", attribute "stroke" (pure "gray") ] []
        , Svg.line_ [ Svg.x1_ "5", attribute "y1" (pure "55"), attribute "x2" (pure "115"), attribute "y2" (pure "55"), attribute "stroke" (pure "black") ] []
        , dyn (lift2 marker props.selected props.values)
        , Svg.text_ [ Svg.x_ "5", attribute "y" (pure "8") ] [ element "Values" ]
        ]
    , E.figcaption_ [ testId "caption" ] [ text (lift2 caption props.selected props.values) ]
    , E.button_ [ testId "grow", H.onClick_ \_ -> props.grow, A.disabled_ (isNothing <$> props.selected) ] [ element "Grow" ]
    ]
  where
  bar i = Svg.rect_
    [ testId ("bar-" <> show i)
    , Svg.x_ (show (left i))
    , attribute "y" (show <<< barTop <<< value i <$> props.values)
    , attribute "width" (pure "16")
    , attribute "height" (show <<< (4 * _) <<< value i <$> props.values)
    , Svg.fill_ ((\s -> if s == Just i then "orange" else "steelblue") <$> props.selected)
    , H.onClick_ \_ -> props.select i
    ]
    []
  marker selected values = case selected of
    Just i -> Svg.circle_ [ Svg.cx_ (show (left i + 8)), attribute "cy" (pure (show (barTop (value i values)))), Svg.r_ "2", Svg.fill_ "orange" ] []
    Nothing -> fragment_ []

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure

-- | Mounts in place of `#app`, starting from the scenario's fixture.
main :: Fixture -> Effect Unit
main fixture = do
  removeApp
  void $ mount "#root" (chart fixture)
