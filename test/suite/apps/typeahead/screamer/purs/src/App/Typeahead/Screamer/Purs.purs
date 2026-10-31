-- | The typeahead scenario on Screamer, hand-written against Screamer's own
-- | API, after its Typeahead example: the control for
-- | `App.Typeahead.Screamer.Psx`.
module App.Typeahead.Screamer.Purs (main) where

import Prelude

import Control.Alt ((<|>))
import Data.Array as Array
import Data.Filterable (filter)
import Data.Maybe (Maybe(..), maybe)
import Data.String as String
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Event as Event
import Screamer.Resource (Remote(..), Strategy(..), keepLast, resourceWith)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (eventSource, signalSource)
import Screamer.Time as Time
import Suite.Shared.Dom (removeApp)
import Suite.Shared.Typeahead (Fixture, search)
import Web.UIEvent.KeyboardEvent (KeyboardEvent, key)
import Screamer.Element (Element, component, each, mount, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes (InputType(..))
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H
import Web.Event.Event (target)
import Web.HTML.HTMLInputElement as Input

data Key = Up | Down

-- | The selected row, kept within the results.
type Selection = { index :: Int, count :: Int }

data Step = Move Key | Results Int

select :: Step -> Selection -> Selection
select step s = case step of
  Move Down -> s { index = max 0 (min (s.count - 1) (s.index + 1)) }
  Move Up -> s { index = max 0 (s.index - 1) }
  Results count -> { index: 0, count }

type Item = { index :: Int, name :: String }

-- | What the view shows and what its handlers do.
type Props =
  { onQuery :: String -> Effect Unit
  , onKey :: KeyboardEvent -> Effect Unit
  , status :: Signal String
  , rows :: Signal (Array Item)
  , selection :: Signal Selection
  , chosen :: Signal String
  }

-- | The query is debounced and sent with `resourceWith Switch`, so an
-- | answer to an older query is never shown, and `keepLast` keeps the last
-- | answer while the next one is on its way.
typeahead :: Fixture -> Element
typeahead fixture = component do
  typed <- liftEffect eventSource
  keys <- liftEffect eventSource
  draft <- liftEffect $ signalSource ""
  chosen <- liftEffect $ signalSource ""
  settled <- Time.debounce (Milliseconds fixture.debounce) typed.event
  distinct <- Event.dropRepeats settled
  let queries = filter (\q -> String.length q >= 3) distinct
  querySignal <- Event.stepper "" queries
  raw <- resourceWith Switch querySignal \query ->
    if query == "" then pure { query, results: [] } else { query, results: _ } <$> search fixture query
  retained <- keepLast raw
  let
    answer = retained <#> case _ of
      Loaded a -> a
      _ -> { query: "", results: [] }
    shown = ado
      q <- draft.signal
      a <- answer
      in if String.length q < 3 then [] else a.results
  -- Held: while the list is empty nothing else observes the selection, and
  -- an unheld fold would pause and miss the next results' reset.
  selection <- Event.fold select { index: 0, count: 0 }
    (map Move keys.event <|> map (Results <<< Array.length) (Event.changes shown))
  let
    status = ado
      q <- draft.signal
      a <- answer
      rs <- shown
      in
        if String.length q < 3 then "Type at least three letters"
        else if a.query /= q then "Searching…"
        else if Array.length rs == 1 then "1 result"
        else show (Array.length rs) <> " results"
    choose = do
      rs <- readT0 shown
      s <- readT0 selection
      maybe (pure unit) chosen.putT1 (Array.index rs s.index)
    onKey e = case key e of
      "ArrowDown" -> keys.fireT1 Down
      "ArrowUp" -> keys.fireT1 Up
      "Enter" -> choose
      _ -> pure unit
    onQuery q = do
      draft.putT1 q
      typed.fireT1 q
    rows = shown <#> Array.mapWithIndex \index name -> { index, name }
  pure $ view
    { onQuery, onKey, status, rows, selection, chosen: chosen.signal }

selected :: Item -> Selection -> String
selected r s = if r.index == s.index then "result selected" else "result"

chosenText :: String -> String
chosenText c = if c == "" then "" else "Chosen: " <> c

view :: Props -> Element
view props =
  E.div_ [ A.class_ "typeahead", testId "typeahead" ]
    [ E.input_
        [ A.type_ InputText
        , testId "search"
        , A.placeholder_ "Search fruit"
        , H.onInput_ \e -> case Input.fromEventTarget =<< target e of
            Just input -> props.onQuery =<< Input.value input
            Nothing -> pure unit
        , H.onKeyDown_ props.onKey
        ]
        []
    , E.p_ [ testId "status" ] [ text props.status ]
    , E.ul_ [ A.class_ "results" ]
        [ each _.index props.rows (item props) ]
    , E.p_ [ testId "chosen" ] [ text (chosenText <$> props.chosen) ]
    ]

-- | A row is keyed by its place in the list, which it reads once.
item :: Props -> Signal Item -> Element
item props row = component do
  { index } <- liftEffect (readT0 row)
  pure $ E.li_ [ testId ("result-" <> show index), A.class_ (selected <$> row <*> props.selection) ] [ text (_.name <$> row) ]

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure

-- | Mounts in place of `#app`, with the scenario's fixture as the server.
main :: Fixture -> Effect Unit
main fixture = do
  removeApp
  void $ mount "#root" (typeahead fixture)
