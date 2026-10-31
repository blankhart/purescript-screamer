-- | The nested scenario on Screamer, hand-written against Screamer's own
-- | API: the control for `App.Nested.Screamer.Psx`.
module App.Nested.Screamer.Purs (main) where

import Prelude

import Data.Array as Array
import Data.Foldable (foldl, sum)
import Data.Map as Map
import Data.Tuple (Tuple(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Signal (Signal, readT0)
import Screamer.Source (batch, signalSource)
import Suite.Shared.Dom (removeApp)
import Screamer.Element (Element, component, each, element, mount, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H
import App.Nested.Screamer.Purs.Counter as Counter

-- | What the view shows and what its handlers do.
type Props =
  { children :: Signal (Array Counter.Input)
  , total :: Signal Int
  , add :: Effect Unit
  , remove :: Int -> Effect Unit
  , report :: Int -> Int -> Effect Unit
  }

type Fixture = { counters :: Array Counter.Input }

-- | The parent keeps the children it shows and the counts they report.
nested :: Fixture -> Element
nested fixture = component do
  children <- liftEffect $ signalSource fixture.counters
  counts <- liftEffect $ signalSource (Map.fromFoldable (map (\c -> Tuple c.id c.start) fixture.counters))
  next <- liftEffect $ Ref.new (1 + foldl (\n c -> max n c.id) 0 fixture.counters)
  let
    add = do
      id <- Ref.modify (_ + 1) next <#> (_ - 1)
      batch do
        children.modifyT1 (_ <> [ { id, label: "Counter " <> show id, start: 0 } ])
        counts.modifyT1 (Map.insert id 0)
    remove id = batch do
      children.modifyT1 (Array.filter \c -> c.id /= id)
      counts.modifyT1 (Map.delete id)
    report id n = counts.modifyT1 (Map.insert id n)
  pure $ view { children: children.signal, total: sum <$> counts.signal, add, remove, report }

view :: Props -> Element
view props =
  E.section_ [ A.class_ "nested", testId "nested" ]
    [ E.p_ [ testId "total" ] [ element "Total: ", text (show <$> props.total) ]
    , E.ul_ [ A.class_ "counters" ] [ each _.id props.children (child props) ]
    , E.button_ [ testId "add", H.onClick_ \_ -> props.add ] [ element "Add a counter" ]
    ]

-- | A row reads its child's input once.
child :: Props -> Signal Counter.Input -> Element
child props row = component do
  c <- liftEffect (readT0 row)
  pure $ E.li_ [ A.class_ "child" ]
    [ Counter.counter c (props.report c.id)
    , E.button_ [ testId ("remove-" <> show c.id), H.onClick_ \_ -> props.remove c.id ] [ element "Remove" ]
    ]

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure

-- | Mounts in place of `#app`, starting from the scenario's fixture.
main :: Fixture -> Effect Unit
main fixture = do
  removeApp
  void $ mount "#root" (nested fixture)
