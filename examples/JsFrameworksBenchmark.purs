module Screamer.Examples.JsFrameworksBenchmark where

-- https://github.com/krausest/js-framework-benchmark

-- https://gist.githubusercontent.com/utkarshkukreti/ad83e5a0eb7e6f456e20be0778aae843/raw/2d5ca8641f267aef08d7d658e0fa4ab24b997c21/Screen%2520Shot%25202018-08-24%2520at%25202.04.20%2520PM.png

-- http://localhost:8080/webdriver-ts-results/table.html

-- https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/sinuous/src/main.js

import Prelude

import Data.Array (mapWithIndex)
import Data.Array as Array
import Data.Array.ST as STArray
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Maybe as Maybe
import Data.Unfoldable (replicateA)
import Effect (Effect)
import Effect.Random as Random
import Screamer.Core (Element)
import Screamer.Core as S
import Screamer.DOM.Attribute as S
import Screamer.DOM.Element as S
import Screamer.DOM.Event (Mouse, target)
import Screamer.DOM.EventHandler as S
import Screamer.Observable (Signal)
import Screamer.Observable as S
import Web.DOM.Element as Element
import Web.DOM.Node as Node
import Web.Event.Event (Event)
import Web.Event.Event as Event

-- NOTE: A strategy would be to allocate an array of Signal Row
-- and then have each signal update based on the related array.

main :: Effect Unit
main = S.mount "main" =<< doJsBenchmark

---------------------------------------------------
-- Row operations

-- TODO: Implement a distinct combinator, so that updates occur only when attributes change
type Row = { id :: Int, label :: String, selected :: Signal String }

randomRows :: Signal (Maybe Int) -> Int -> Int -> Effect (Array Row)
randomRows sel nextId length = Array.mapWithIndex f <$> replicateA length row
  where
    choose array = do
      index <- Random.randomInt 0 (Array.length array)
      pure $ Maybe.fromMaybe "" $ Array.index array index
    row = do
      adjective <- choose adjectives
      color <- choose colors
      noun <- choose nouns
      pure $ adjective <> " " <> color <> " " <> noun
    f index label =
      let
        id = nextId + index
      in
        { id: nextId + index
        , label
        , selected: sel <#> \sid -> if sid == Just id then "danger" else ""
        }

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

-- NOTE: STArray creates an interesting question for the Screamer interface.
-- The STRef itself does not change, so the question is how to create an
-- observable from it.

doJsBenchmark :: Effect Element
doJsBenchmark = do

  table <- S.channel []

  selected <- S.channel Nothing -- maybe -1

  nextId <- S.channel 1

  let

    new n = do
      id <- S.get nextId.signal
      nextId.modify (_ + n)
      randomRows selected.signal id n

    clear = do
      table.put []
      selected.put Nothing

    create n = do
      table.put =<< new n

    append n = do
      rows <- new n
      table.modify (_ <> rows)

    remove id = do
      let dummy = { id, label: "", selected: pure "" }
      table.modify (Array.deleteBy (\a b -> a.id == b.id) dummy)

    select id = do
      selected.put (Just id)

    updateEvery nth = table.modify (mapWithIndex updateLabel)
      where
        updateLabel ix row =
          if ix `mod` nth == 0 then row { label = row.label <> " !!!" } else row
        {-
        f index row | index `mod` nth == 0 = row { label = row.label <> " !!!" }
        f _ row = row
        -}

    swap = table.modify $ \arr -> fromMaybe arr do
      rowA <- arr Array.!! 1
      rowB <- arr Array.!! 998
      arrA <- Array.updateAt 1 rowB arr
      arrB <- Array.updateAt 998 rowA arrA
      pure arrB

    {-
      \array -> STArray.run do
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
    -}

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
    handleTableClick event =
      case Just (target event) >>= Node.fromEventTarget >>= Element.fromNode of
        Just element -> do
          action <- Element.getAttribute "data-action" element
          id <- map Int.fromString <$> Element.getAttribute "data-id" element
          case action, id of
            Just "Select", Just (Just id') -> select id'
            Just "Remove", Just (Just id') -> remove id'
            _, _ -> pure unit
        Nothing -> pure unit

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
    [ S.class_ (S.distinct selected) ]
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
