-- | A search box over a slow, flaky fake server. The query is debounced,
-- | deduplicated and filtered to three or more characters; each query is
-- | sent with `resourceWith Switch` and `retry`, so a slow answer to an old
-- | query is never shown; `keepLast` keeps the previous results on screen
-- | while the next ones load; and the selection is an `Event.fold` over key
-- | presses and new results.
module Screamer.Examples.Typeahead where

import Prelude

import Control.Alt ((<|>))
import Data.Array as Array
import Data.Filterable (filter)
import Data.Int (toNumber)
import Data.Maybe (Maybe(..), fromMaybe)
import Data.String as String
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Aff (Aff, delay, error, message, throwError)
import Effect.Class (liftEffect)
import Effect.Random (randomInt)
import Effect.Ref as Ref
import Screamer.Core (Element, component, each, text)
import Screamer.DOM.Attribute (InputType(..))
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.EventHandler as H
import Screamer.Event as Event
import Screamer.EventSource (eventSource)
import Screamer.Examples.Harness as Harness
import Screamer.Owned (hold)
import Screamer.Resource (Backoff(..), Remote(..), Strategy(..), isLoading, keepLast, resourceWith, retry)
import Screamer.Signal (read)
import Screamer.SignalSource (signalSource)
import Screamer.Time as Time
import Web.Event.Event (preventDefault, target)
import Web.HTML.HTMLInputElement as Input
import Web.UIEvent.KeyboardEvent (key, toEvent)

main :: Effect Unit
main = Harness.run "main" typeahead

fruits :: Array String
fruits =
  [ "apple", "apricot", "avocado", "banana", "bilberry", "blackberry", "blackcurrant", "blueberry"
  , "boysenberry", "cherry", "cloudberry", "coconut", "cranberry", "currant", "damson", "date"
  , "dragonfruit", "durian", "elderberry", "feijoa", "fig", "gooseberry", "grape", "grapefruit"
  , "guava", "huckleberry", "jackfruit", "kiwi", "kumquat", "lemon", "lime", "lingonberry", "loquat"
  , "lychee", "mango", "mangosteen", "melon", "mulberry", "nectarine", "orange", "papaya"
  , "passionfruit", "peach", "pear", "persimmon", "pineapple", "plum", "pomegranate", "quince"
  , "raspberry", "redcurrant", "salak", "satsuma", "strawberry", "tamarind", "tangerine", "yuzu"
  ]

-- | A fake server: answers after 50 to 400 ms, and fails every third
-- | request, which `retry` hides.
type Server = String -> Aff (Array String)

server :: Effect Server
server = do
  requests <- Ref.new 0
  pure \query -> do
    n <- liftEffect $ Ref.modify (_ + 1) requests
    latency <- liftEffect $ randomInt 50 400
    delay (Milliseconds (toNumber latency))
    when (n `mod` 3 == 0) $ throwError (error "server busy")
    pure $ Array.take 8 $ Array.filter (String.contains (String.Pattern query)) fruits

data Key = Up | Down

-- | The selected row, kept within the results.
type Selection = { index :: Int, count :: Int }

data Step = Move Key | Results Int

select :: Step -> Selection -> Selection
select step s = case step of
  Move Down -> s { index = min (s.count - 1) (s.index + 1) }
  Move Up -> s { index = max 0 (s.index - 1) }
  Results count -> { index: 0, count }

typeahead :: Element
typeahead = component do
  search <- liftEffect server
  typed <- liftEffect eventSource
  keys <- liftEffect eventSource
  draft <- liftEffect $ signalSource ""
  chosen <- liftEffect $ signalSource ""
  settled <- Time.debounce (Milliseconds 150.0) typed.event
  let
    queries = filter (\q -> String.length q >= 3) (Event.dropRepeats settled)
    policy = { retries: 3, backoff: Exponential { initial: Milliseconds 100.0, max: Milliseconds 1000.0 } }
  raw <- resourceWith Switch (Event.stepper "" queries) \q ->
    if q == "" then pure [] else retry policy search q
  let
    results = keepLast raw
    shown = results <#> case _ of
      Loaded rs -> rs
      _ -> []
  -- Held: while the list is empty nothing else observes the selection, and
  -- an unheld fold would pause and miss the next results' reset.
  selection <- hold $ Event.fold select { index: 0, count: 0 }
    (map Move keys.event <|> map (Results <<< Array.length) (Event.changes shown))
  let
    status = ado
      q <- draft.signal
      r <- raw
      rs <- shown
      in
        if String.length q < 3 then "Type at least three letters"
        else if isLoading r then "Searching…"
        else case r of
          Failed e -> "Search failed: " <> message e
          _ -> count (Array.length rs)
    choose = do
      rs <- read shown
      s <- read selection
      for_ (Array.index rs s.index) chosen.put
    onKey e = case key e of
      "ArrowDown" -> preventDefault (toEvent e) *> keys.fire Down
      "ArrowUp" -> preventDefault (toEvent e) *> keys.fire Up
      "Enter" -> preventDefault (toEvent e) *> choose
      _ -> pure unit
    rows = shown <#> Array.mapWithIndex \index name -> { index, name }
  pure $ E.div_ []
    [ E.input_
        [ A.id_ "search"
        , A.type_ InputText
        , A.placeholder_ "Search fruit"
        , A.autocomplete_ "off"
        , H.onInput_ \e -> case Input.fromEventTarget =<< target e of
            Just input -> do
              q <- Input.value input
              draft.put q
              typed.fire q
            Nothing -> pure unit
        , H.onKeyDown_ onKey
        ]
        []
    , E.p_ [ A.id_ "status" ] [ text status ]
    , E.ul_ [ A.id_ "results" ]
        [ each _.name rows \row ->
            E.li_
              [ A.class_ (selected <$> row <*> selection) ]
              [ text (_.name <$> row) ]
        ]
    , E.p_ [ A.id_ "chosen" ] [ text (chosen.signal <#> \c -> if c == "" then "" else "Chosen: " <> c) ]
    ]
  where
  count n = show n <> if n == 1 then " result" else " results"
  selected r s = if r.index == s.index then "selected" else ""
  for_ m f = fromMaybe (pure unit) (f <$> m)
