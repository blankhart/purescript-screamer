-- | The todo scenario on Screamer, hand-written against Screamer's own API:
-- | the control for `App.Todo.Screamer.Psx`.
module App.Todo.Screamer.Purs (main) where

import Prelude

import Data.Array as Array
import Data.Foldable (foldl)
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Signal (Signal, readT0)
import Screamer.Source (batch, signalSource)
import Suite.Shared.Dom (removeApp)
import Data.Maybe (Maybe(..))
import Screamer.Element (Element, component, each, element, mount, text)
import Screamer.Attribute (Attribute, attribute)
import Screamer.Html.Attributes (InputType(..))
import Screamer.Html.Attributes as A
import Screamer.Html as E
import Screamer.Html.Handlers as H
import Web.Event.Event (target)
import Web.HTML.HTMLInputElement as Input

type Todo = { id :: Int, text :: String, done :: Boolean }

type Fixture = { todos :: Array Todo }

data Filter = All | Active | Completed

derive instance Eq Filter

shown :: Filter -> Todo -> Boolean
shown filter todo = case filter of
  All -> true
  Active -> not todo.done
  Completed -> todo.done

-- | What the view shows and what its handlers do.
type Props =
  { todos :: Signal (Array Todo)
  , draft :: Signal String
  , filter :: Signal Filter
  , setDraft :: String -> Effect Unit
  , add :: Effect Unit
  , toggle :: Int -> Effect Unit
  , remove :: Int -> Effect Unit
  , show :: Filter -> Effect Unit
  }

todoApp :: Fixture -> Element
todoApp fixture = component do
  todos <- liftEffect $ signalSource fixture.todos
  draft <- liftEffect $ signalSource ""
  filter <- liftEffect $ signalSource All
  next <- liftEffect $ Ref.new (1 + foldl (\n todo -> max n todo.id) 0 fixture.todos)
  let
    add = do
      id <- Ref.modify (_ + 1) next
      text <- readT0 draft.signal
      batch do
        todos.modifyT1 (_ <> [ { id: id - 1, text, done: false } ])
        draft.putT1 ""
    toggle id = todos.modifyT1 $ map \todo -> if todo.id == id then todo { done = not todo.done } else todo
    remove id = todos.modifyT1 $ Array.filter \todo -> todo.id /= id
  pure $ view
    { todos: todos.signal
    , draft: draft.signal
    , filter: filter.signal
    , setDraft: draft.putT1
    , add
    , toggle
    , remove
    , show: filter.putT1
    }

view :: Props -> Element
view props =
  E.section_ [ A.class_ "todo", testId "todo" ]
    [ E.h1_ [] [ element "Todos" ]
    , E.div_ [ A.class_ "new" ]
        [ E.input_
            [ A.type_ InputText
            , testId "draft"
            , A.value_ props.draft
            , H.onInput_ \e -> case Input.fromEventTarget =<< target e of
                Just input -> props.setDraft =<< Input.value input
                Nothing -> pure unit
            ]
            []
        , E.button_ [ testId "add", H.onClick_ \_ -> props.add, A.disabled_ ((_ == "") <$> props.draft) ] [ element "Add" ]
        ]
    , E.ul_ [ A.class_ "items" ] [ each _.id (Array.filter <$> (shown <$> props.filter) <*> props.todos) (item props) ]
    , E.p_ [ testId "left" ] [ text ((\ts -> show (Array.length (Array.filter (not <<< _.done) ts)) <> " left") <$> props.todos) ]
    , E.div_ [ A.class_ "filters" ]
        [ E.button_ [ testId "all", H.onClick_ \_ -> props.show All, A.disabled_ ((_ == All) <$> props.filter) ] [ element "All" ]
        , E.button_ [ testId "active", H.onClick_ \_ -> props.show Active, A.disabled_ ((_ == Active) <$> props.filter) ] [ element "Active" ]
        , E.button_ [ testId "completed", H.onClick_ \_ -> props.show Completed, A.disabled_ ((_ == Completed) <$> props.filter) ] [ element "Completed" ]
        ]
    ]

item :: Props -> Signal Todo -> Element
item props todo = component do
  { id } <- liftEffect (readT0 todo)
  pure $ E.li_ [ A.class_ ((\t -> if t.done then "item done" else "item") <$> todo) ]
    [ E.input_ [ A.type_ InputCheckbox, testId ("toggle-" <> show id), A.checked_ (_.done <$> todo), H.onChange_ \_ -> props.toggle id ] []
    , E.span_ [] [ text (_.text <$> todo) ]
    , E.button_ [ testId ("remove-" <> show id), H.onClick_ \_ -> props.remove id ] [ element "Remove" ]
    ]

testId :: String -> Attribute
testId = attribute "data-testid" <<< pure

-- | Mounts in place of `#app`, starting from the scenario's fixture.
main :: Fixture -> Effect Unit
main fixture = do
  removeApp
  void $ mount "#root" (todoApp fixture)
