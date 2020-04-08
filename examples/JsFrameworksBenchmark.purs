module Screamer.Examples.JsFrameworksBenchmark where

-- https://github.com/krausest/js-framework-benchmark

import Prelude

import Data.Array (mapWithIndex)
import Data.Array as Array
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.Maybe as Maybe
import Data.Unfoldable (replicateA)
import Effect (Effect)
import Effect.Random as Random
import Screamer.Core as S
import Screamer.Core (Element)
import Screamer.DOM.Attribute as S
import Screamer.DOM.Element as S
import Screamer.DOM.Event (Mouse)
import Screamer.DOM.EventHandler as S
import Screamer.Observable as S
import Web.DOM.Element as Element
import Web.DOM.Node as Node
import Web.Event.Event (Event)
import Web.Event.Event as Event

main :: Effect Unit
main = S.mount "main" =<< doJsBenchmark 

---------------------------------------------------
-- Row operations

-- TODO: Implement a distinct combinator, so that updates only occur when attributes change
type Row = { id :: Int, label :: String, selected :: Boolean }

randomRows :: Int -> Int -> Effect (Array Row)
randomRows nextId length = Array.mapWithIndex f <$> replicateA length row
  where
    choose array = do
      index <- Random.randomInt 0 (Array.length array)
      pure $ Maybe.fromMaybe "" $ Array.index array index
    row = do
      adjective <- choose adjectives
      color <- choose colors
      noun <- choose nouns
      pure $ adjective <> " " <> color <> " " <> noun
    f index label = { id: nextId + index, label, selected: false }

adjectives :: Array String
adjectives =
  ["pretty", "large", "big", "small", "tall", "short", "long", "handsome",
   "plain", "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful",
   "mushy", "odd", "unsightly", "adorable", "important", "inexpensive",
   "cheap", "expensive", "fancy"]

colors :: Array String
colors =
  ["red", "yellow", "blue", "green", "pink", "brown", "purple", "brown",
   "white", "black", "orange"]

nouns :: Array String
nouns =
  ["table", "chair", "house", "bbq", "desk", "car", "pony", "cookie",
   "sandwich", "burger", "pizza", "mouse", "keyboard"]

---------------------------------------------------
-- Application

doJsBenchmark :: Effect Element
doJsBenchmark = do 

  table <- S.channel []

  selected <- S.channel Nothing

  nextId <- S.channel 1
  
  let 

    clear = do 
      table.put []
      selected.put Nothing 
    
    create n = do 
      append n
      selected.put Nothing

    append n = do 
      id <- S.get nextId.signal
      nextId.modify (_ + n)
      rows <- randomRows id n
      table.modify (_ <> rows)

    remove id = do 
      table.modify (Array.filter (\row -> row.id /= id))

    -- 'danger'
    select id = do 
      table.modify \rows -> rows <#> case _ of
        row | row.id == id -> row { selected = true }
            | row.selected -> row { selected = false }
            | otherwise -> row

    updateEvery nth = table.modify (mapWithIndex f)
      where
        f index row | index `mod` nth == 0 = row { label = row.label <> " !!!" }
        f _ row = row
 
    swap = table.modify \rows -> 
      case Array.index rows 1, Array.index rows 998 of
        Just a, Just b ->
          let
            f 1 _ = b
            f 998 _ = a
            f _ row = row
          in
            mapWithIndex f rows
        _, _ -> rows

    -- const removeOrSelect = (e) => e.target.matches('.remove') ? remove(e) : select(e);
    -- const select = (e) => selected(getParentId(e.target));

    buttons :: Array Element
    buttons =
      button' <$>
      [ { id: "run", text: "Create 1,000 rows", handler: create 1000 }
      , { id: "runlots", text: "Create 10,000 rows", handler: create 10000 }
      , { id: "add", text: "Append 1,000 rows", handler: append 1000 }
      , { id: "update", text: "Update every 10th row", handler: updateEvery 10 }
      , { id: "clear", text: "Clear", handler: clear }
      , { id: "swaprows", text: "Swap Rows", handler: swap }
      ]


    handleTableClick :: Mouse -> Effect Unit
    handleTableClick event = pure unit -- FIXME
{-
      let maybeElement = event # Event.target >>= Node.fromEventTarget >>= Element.fromNode
      case maybeElement of
        Just element -> do
          action <- Element.getAttribute "data-action" element
          id <- map Int.fromString <$> Element.getAttribute "data-id" element
          case action, id of
            Just "Select", Just (Just id') -> pure $ Select id'
            Just "Remove", Just (Just id') -> pure $ Remove id'
            _, _ -> pure NoOp
        Nothing -> pure NoOp
-}

  pure $
    S.div_ 
    [ S.class_ "container" ]
    [ S.div_ 
      [ S.class_ "jumbotron" ]
      [ S.div_
        [ S.class_ "row" ]
        [ S.div_ 
          [ S.class_ "col-md-6" ]
          [ S.h1_ [] [ S.element "Screamer" ] ]
        , S.div_ [ S.class_ "col-md-6" ] buttons
        ]
      ]
    , S.table_
      [ S.class_ "table table-hover table-striped test-data"
      , S.onClick_ handleTableClick
      ]
      [ S.tbody_ [] [S.elements_ table.signal row'] ]
    , S.span_
      [ S.class_ "preloadicon glyphicon glyphicon-remove"
      , S.attribute_ "aria-hidden" "true"
      ]
      []
    ]

button' :: { id :: String, text :: String, handler :: Effect Unit } -> Element
button' { id, text, handler } =
  S.div_ [ S.class_ "col-sm-6 smallpad" ]
    [ S.button_
      [ S.type_ "button"
      , S.class_ "btn btn-primary btn-block"
      , S.id_ id
      , S.onClick_ \_ -> handler
      ]
      [ S.element text ]
    ]

row' :: Row -> Element
row' { id, label, selected } =
  S.tr_ 
    [ S.class_ "danger" ] -- FIXME
    [ S.td_ 
      [ S.class_ "col-md-1" ] 
      [ S.element id ]
    , S.td_ 
      [ S.class_ "col-md-4" ]
      [ S.a_ 
        [ S.href_ "#", S.attribute_ "data-action" "Select", S.attribute_ "data-id" (show id)  ]
        [ S.element label ]
      ]
    , S.td_ 
      [ S.class_ "col-md-1" ]
      [ S.a_ 
        [ S.href_ "#" ]
        [ S.span_
          [ S.class_ "glyphicon glyphicon-remove"
          , S.attribute_ "aria-hidden" "true"
          , S.attribute_ "data-action" "Remove"
          , S.attribute_ "data-id" (show id)
          ]
          []
        ]
      ]
    , S.td_ [ S.class_ "col-md-6" ] []
    ]