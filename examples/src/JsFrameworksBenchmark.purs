module Screamer.Examples.JsFrameworksBenchmark where

-- https://github.com/krausest/js-framework-benchmark

-- https://gist.githubusercontent.com/utkarshkukreti/ad83e5a0eb7e6f456e20be0778aae843/raw/2d5ca8641f267aef08d7d658e0fa4ab24b997c21/Screen%2520Shot%25202018-08-24%2520at%25202.04.20%2520PM.png

-- http://localhost:8080/webdriver-ts-results/table.html

-- https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/sinuous/src/main.js

import Prelude

import Data.Array as Array
import Data.Array.ST as STArray
import Data.FoldableWithIndex (forWithIndex_)
import Data.Maybe (Maybe(..))
import Data.Unfoldable (replicateA)
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Random as Random
import Effect.Ref as Ref
import Partial.Unsafe (unsafePartial)
import Screamer.Channel (Channel, batch, channel)
import Screamer.Core (Element, component, each, element)
import Screamer.DOM.Attribute (InputType(..))
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.EventHandler as H
import Screamer.Examples.Harness as Harness
import Screamer.Signal (Signal, read)

---------------------------------------------------
-- Main

main :: Effect Unit
main = Harness.run "main" benchmark

---------------------------------------------------
-- Row operations

type TableRow = { id :: Int, label :: Channel String, highlight :: Channel String }

randomRows :: Int -> Int -> Effect (Array TableRow)
randomRows nextId length =
  Array.mapWithIndex numbering <$> replicateA length row
  where
  choose array = do
    index <- Random.randomInt 0 (Array.length array - 1)
    pure $ unsafePartial $ Array.unsafeIndex array index
  row = do
    adjective <- choose adjectives
    color <- choose colors
    noun <- choose nouns
    label <- channel (adjective <> " " <> color <> " " <> noun)
    highlight <- channel ""
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

benchmark :: Element
benchmark = component do
  table <- liftEffect $ channel []
  nextId <- liftEffect $ Ref.new 1
  -- The highlight of the selected row, cleared when another is selected.
  selected <- liftEffect $ Ref.new Nothing

  let
    new n = do
      id <- Ref.modify' (\i -> { state: i + n, value: i }) nextId
      randomRows id n

    clear = table.put []

    create n = table.put =<< new n

    append n = do
      rows <- new n
      table.modify (_ <> rows)

    remove id = table.modify (Array.filter (\a -> a.id /= id))

    select highlight = batch do
      Ref.read selected >>= case _ of
        Just previous -> previous.put ""
        Nothing -> pure unit
      highlight.put "danger"
      Ref.write (Just highlight) selected

    updateEvery nth = batch do
      rows <- read table.signal
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
    E.div_
      [ A.class_ "container" ]
      [ E.div_
          [ A.class_ "jumbotron" ]
          [ E.div_
              [ A.class_ "row" ]
              [ E.div_
                  [ A.class_ "col-md-6" ]
                  [ E.h1_ [] [ element "Screamer" ] ]
              , E.div_ [ A.class_ "col-md-6" ] buttons
              ]
          ]
      , E.table_
          [ A.class_ "table table-hover table-striped test-data" ]
          [ E.tbody_ [] [ each _.id table.signal (row' select remove) ] ]
      , E.span_
          [ A.class_ "preloadicon glyphicon glyphicon-remove"
          , A.ariaHidden_ "true"
          ]
          []
      ]

button' :: { id :: String, text :: String, handler :: Effect Unit } -> Element
button' { id, text, handler } =
  E.div_ [ A.class_ "col-sm-6 smallpad" ]
    [ E.button_
        [ A.type_ InputButton
        , A.class_ "btn btn-primary btn-block"
        , A.id_ id
        , H.onClick_ \_ -> handler
        ]
        [ element text ]
    ]

-- | A row's fields never change for a given key, so the row reads them once.
row' :: (Channel String -> Effect Unit) -> (Int -> Effect Unit) -> Signal TableRow -> Element
row' select remove rowSignal = component do
  { id, label, highlight } <- liftEffect $ read rowSignal
  pure $ E.tr_
    [ A.class_ highlight.signal
    , H.onClick_ \_ -> select highlight
    ]
    [ E.td_ [ A.class_ "col-md-1" ] [ element id ]
    , E.td_ [ A.class_ "col-md-4" ] [ E.a_ [] [ element label.signal ] ]
    , E.td_
        [ A.class_ "col-md-1" ]
        [ E.a_
            []
            [ E.span_
                [ A.class_ "glyphicon glyphicon-remove"
                , A.ariaHidden_ "true"
                , H.onClick_ \_ -> remove id
                ]
                []
            ]
        ]
    , E.td_ [ A.class_ "col-md-6" ] []
    ]
