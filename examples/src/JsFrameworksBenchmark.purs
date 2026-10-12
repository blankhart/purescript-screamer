module Screamer.Examples.JsFrameworksBenchmark where

-- https://github.com/krausest/js-framework-benchmark

-- https://gist.githubusercontent.com/utkarshkukreti/ad83e5a0eb7e6f456e20be0778aae843/raw/2d5ca8641f267aef08d7d658e0fa4ab24b997c21/Screen%2520Shot%25202018-08-24%2520at%25202.04.20%2520PM.png

-- http://localhost:8080/webdriver-ts-results/table.html

-- https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/sinuous/src/main.js

import Prelude

import Data.Array (mapWithIndex)
import Data.Array as Array
import Data.Array.ST as STArray
import Data.Foldable (for_)
import Data.FoldableWithIndex (forWithIndex_)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Maybe as Maybe
import Data.Unfoldable (replicateA)
import Effect (Effect)
import Effect.Random as Random
import Partial.Unsafe (unsafePartial)
import Screamer.Core.Sinuous (Element)
import Screamer.Core.Sinuous as S
import Screamer.DOM.Attribute as S
import Screamer.DOM.Element as S
import Screamer.DOM.Event (Mouse, target)
import Screamer.DOM.EventHandler as S
import Screamer.Observable (Channel, Signal)
import Screamer.Observable as S
import Web.DOM.Element as Element
import Web.DOM.Node as Node
import Web.Event.Event (Event)
import Web.Event.Event as Event

---------------------------------------------------
-- Main

main :: Effect Unit
main = S.mount "main" =<< doJsBenchmark

---------------------------------------------------
-- Row operations

type Row = { id :: Int, label :: Channel String, highlight :: Channel String }

randomRows :: Int -> Int -> Effect (Array Row)
randomRows nextId length =
  Array.mapWithIndex numbering <$> replicateA length row
  where
    choose array = do
      index <- Random.randomInt 0 (Array.length array)
      pure $ unsafePartial $ Array.unsafeIndex array index
    row = do
      adjective <- choose adjectives
      color <- choose colors
      noun <- choose nouns
      label <- S.channel (adjective <> " " <> color <> " " <> noun)
      highlight <- S.channel ""
      pure { label, highlight }
    numbering index { label, highlight } = { id: nextId + index, label, highlight }

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

  nextId <- S.channel 1

  deselect <- S.channel (pure unit)

  let

    new n = do
      id <- S.get nextId.signal
      nextId.modify (_ + n)
      randomRows id n

    clear = do
      table.put []

    create n = do
      table.put =<< new n

    append n = do
      rows <- new n
      table.modify (_ <> rows)

    remove id = do
      table.modify (Array.filter (\a -> a.id /= id))

    select highlight = do
      S.emit deselect.signal
      highlight.put "danger"
      deselect.put (highlight.put "")

    updateEvery nth = do 
      rows <- S.get table.signal
      forWithIndex_ rows \ix row ->
        when (ix `mod` nth == 0) $
          row.label.modify (_ <> " !!!")

    swap = table.modify $ \array -> STArray.run do
      rows <- STArray.thaw array
      a' <- STArray.peek 1 rows
      b' <- STArray.peek 998 rows
      case a', b' of
        Just a, Just b -> do
          _ <- STArray.poke 998 a rows
          _ <- STArray.poke 1 b rows
          pure unit
        _, _ -> pure unit
      pure rows

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
      ]
      [ S.tbody_ [] [S.elements_ table.signal (row' select remove)] ]
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

row' :: (Channel String -> Effect Unit) -> (Int -> Effect Unit) -> Row -> Element
row' select remove { id, label, highlight } =
  S.tr_
    [ S.class_ highlight.signal
    , S.onClick_ \_ -> select highlight ]
    [ S.td_ [ S.class_ "col-md-1" ] [ S.element id ]
    , S.td_ [ S.class_ "col-md-4" ] [ S.a_ [] [ S.element label.signal ] ]
    , S.td_
      [ S.class_ "col-md-1" ]
      [ S.a_ 
        []
        [ S.span_
          [ S.class_ "glyphicon glyphicon-remove"
          , S.attribute_ "aria-hidden" "true"
          , S.onClick_ \_ -> remove id
          ]
          []
        ]
      ]
    , S.td_ [ S.class_ "col-md-6" ] []
    ]