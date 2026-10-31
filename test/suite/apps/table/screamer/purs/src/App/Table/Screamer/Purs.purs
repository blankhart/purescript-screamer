-- | The table scenario on Screamer, hand-written against Screamer's own
-- | API: the control for `App.Table.Screamer.Psx`.
module App.Table.Screamer.Purs (main) where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Signal (Signal, readT0)
import Screamer.Source (signalSource)
import Suite.Shared.Dom (removeApp)
import Suite.Shared.Table (TableRow)
import Suite.Shared.Table as Table
import Screamer.Element (Element, component, each, element, mount, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H

-- | What the view shows and what its handlers do.
type Props =
  { rows :: Signal (Array TableRow)
  , selected :: Signal (Maybe Int)
  , buttons :: Array { id :: String, text :: String, action :: Effect Unit }
  , select :: Int -> Effect Unit
  , remove :: Int -> Effect Unit
  }

table :: Number -> Element
table seed = component do
  rows <- liftEffect $ signalSource []
  selected <- liftEffect $ signalSource Nothing
  source <- liftEffect $ Ref.new (Table.source seed)
  let
    make n = do
      made <- Table.rows n <$> Ref.read source
      Ref.write made.source source
      pure made.rows
    buttons =
      [ { id: "run", text: "Create 1,000 rows", action: make 1000 >>= rows.putT1 }
      , { id: "runlots", text: "Create 10,000 rows", action: make 10000 >>= rows.putT1 }
      , { id: "add", text: "Append 1,000 rows", action: make 1000 >>= \made -> rows.modifyT1 (_ <> made) }
      , { id: "update", text: "Update every 10th row", action: rows.modifyT1 Table.updateEvery }
      , { id: "clear", text: "Clear", action: rows.putT1 [] }
      , { id: "swaprows", text: "Swap Rows", action: rows.modifyT1 Table.swap }
      ]
    remove id = rows.modifyT1 (Array.filter \r -> r.id /= id)
  pure $ view { rows: rows.signal, selected: selected.signal, buttons, select: selected.putT1 <<< Just, remove }

view :: Props -> Element
view props =
  E.div_ [ A.class_ "container", testId "table" ]
    [ E.div_ [ A.class_ "jumbotron" ]
        [ E.div_ [ A.class_ "row" ]
            [ E.div_ [ A.class_ "col-md-6" ] [ E.h1_ [] [ element "PSX table" ] ]
            , E.div_ [ A.class_ "col-md-6" ] (map button props.buttons)
            ]
        ]
    , E.table_ [ A.class_ "table table-hover table-striped test-data" ]
        [ E.tbody_ [] [ each _.id props.rows (row props) ] ]
    , E.span_ [ A.class_ "preloadicon glyphicon glyphicon-remove", ariaHidden ] []
    ]
  where
  button b =
    E.div_ [ A.class_ "col-sm-6 smallpad" ]
      [ E.button_ [ attribute "type" (pure "button"), A.class_ "btn btn-primary btn-block", A.id_ b.id, testId b.id, H.onClick_ \_ -> b.action ] [ element b.text ] ]

row :: Props -> Signal TableRow -> Element
row props r = component do
  { id } <- liftEffect (readT0 r)
  pure $ E.tr_ [ A.class_ ((\s -> if s == Just id then "danger" else "row") <$> props.selected) ]
    [ E.td_ [ A.class_ "col-md-1" ] [ element (show id) ]
    , E.td_ [ A.class_ "col-md-4" ] [ E.a_ [ testId ("select-" <> show id), H.onClick_ \_ -> props.select id ] [ text (_.label <$> r) ] ]
    , E.td_ [ A.class_ "col-md-1" ]
        [ E.a_ [ testId ("remove-" <> show id), H.onClick_ \_ -> props.remove id ]
            [ E.span_ [ A.class_ "glyphicon glyphicon-remove", ariaHidden ] [] ]
        ]
    , E.td_ [ A.class_ "col-md-6" ] []
    ]

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure

ariaHidden :: Attribute
ariaHidden = attribute "aria-hidden" (pure "true")

-- | Mounts in place of `#app`, with the scenario's seed.
main :: { seed :: Number } -> Effect Unit
main fixture = do
  removeApp
  void $ mount "#root" (table fixture.seed)
