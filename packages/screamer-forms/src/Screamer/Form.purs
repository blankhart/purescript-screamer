-- | Formlets: forms that compose like applicative values.
-- |
-- | A `Form props i o` edits a state of type `i` and validates it into an
-- | `o`. The state lives in one signal source that `build` creates per instance;
-- | each field reads its part of the state through a signal and writes it
-- | back through `modifyT1`. Because the state is plain data, going back a step
-- | in a wizard or resetting the form shows the values the user entered.
-- |
-- | ```purescript
-- | type Signup = { name :: Validated String, age :: Validated String }
-- |
-- | signupForm :: forall props. Form props Signup { name :: String, age :: Number }
-- | signupForm = ado
-- |   name <- indent "Name" $ prop (Proxy :: _ "name") $ validated (nonEmpty "Enter your name") textbox
-- |   age <- indent "Age" $ prop (Proxy :: _ "age") $ validated (required "Enter your age") number
-- |   in { name, age }
-- | ```
-- |
-- | References: the formlets paper (http://homepages.inf.ed.ac.uk/slindley/papers/formlets-essence.pdf),
-- | halogen-form (https://github.com/fpco/halogen-form) and the Lumi posts
-- | (https://www.lumi.dev/blog/using-purescript-to-create-a-dsl-for-building-forms).
module Screamer.Form
  ( Form(..)
  , Context
  , Rendered
  , Errors
  , Built
  , build
  , runForm
  , focus
  , prop
  , withProps
  , indent
  , section
  , Validator
  , nonEmpty
  , required
  , mustBe
  , Validated(..)
  , fromValidated
  , isModified
  , validated
  , textbox
  , password
  , number
  , checkbox
  , SelectOption
  , select
  , Wizard(..)
  , step
  , wizard
  ) where

import Prelude

import Data.Array as Array
import Data.Bifunctor (lmap)
import Data.Either (Either(..))
import Data.Foldable (for_)
import Data.Maybe (Maybe(..), fromMaybe, isNothing)
import Data.Number as Number
import Data.String as String
import Data.Symbol (class IsSymbol)
import Effect (Effect)
import Effect.Class (liftEffect)
import Prim.Row as Row
import Screamer.Attribute (attribute)
import Screamer.Element (Element, dyn, element, fragment_, text)
import Screamer.Html as E
import Screamer.Html.Attributes (InputType(..))
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Owned (Owned(..), child)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (SignalSource, batch, signalSource)
import Screamer.Source as Source
import Type.Proxy (Proxy)
import Web.Event.Event (Event, target)
import Web.HTML.HTMLInputElement as Input
import Web.HTML.HTMLSelectElement as Select

-- | Validation errors, in the order the fields appear.
type Errors = Array String

-- | What a form is given when it is built: the form-wide props, its part of
-- | the state as a source (focused from the whole with
-- | `Screamer.Source.focus`), and whether every validation message should
-- | be shown whether or not its field was edited.
type Context props i =
  { props :: props
  , state :: SignalSource i
  , reveal :: Signal Boolean
  }

-- | A built form: its fields, in order, and its validated result.
type Rendered o =
  { fields :: Array Element
  , result :: Signal (Either Errors o)
  }

-- | A form that edits a state of type `i` and produces an `o` when the state
-- | is valid. Building runs in `Owned`, so a form can keep per-instance state
-- | (a wizard keeps its current step); fields themselves are pure elements
-- | bound to the context's signals.
newtype Form props i o = Form (Context props i -> Owned (Rendered o))

runForm :: forall props i o. Form props i o -> Context props i -> Owned (Rendered o)
runForm (Form f) = f

instance Functor (Form props i) where
  map f (Form g) = Form \c -> g c <#> \r -> r { result = map f <$> r.result }

-- | Fields of both forms, in order. Errors from both are collected.
instance Apply (Form props i) where
  apply (Form f) (Form g) = Form \c -> do
    a <- f c
    b <- g c
    pure { fields: a.fields <> b.fields, result: both <$> a.result <*> b.result }
    where
    both (Left e1) (Left e2) = Left (e1 <> e2)
    both (Left e) _ = Left e
    both _ (Left e) = Left e
    both (Right h) (Right x) = Right (h x)

-- | A form with no fields.
instance Applicative (Form props i) where
  pure a = Form \_ -> pure { fields: [], result: pure (Right a) }

-- | A form over part of a larger state.
focus :: forall props s a o. (s -> a) -> (a -> s -> s) -> Form props a o -> Form props s o
focus get set (Form f) = Form \c -> f c { state = Source.focus { get, set } c.state }

-- | A form over one field of a record state.
prop
  :: forall props l a r' r o
   . IsSymbol l
  => Row.Cons l a r' r
  => Proxy l
  -> Form props a o
  -> Form props (Record r) o
prop l (Form f) = Form \c -> f c { state = Source.prop l c.state }

-- | A form that depends on the props.
withProps :: forall props i o. (props -> Form props i o) -> Form props i o
withProps k = Form \c -> runForm (k c.props) c

-- | Put the form's fields under a label.
indent :: forall props i o. String -> Form props i o -> Form props i o
indent label (Form f) = Form \c -> f c <#> \r -> r
  { fields =
      [ E.label_ [ A.class_ "screamer-form-field" ]
          ([ E.span_ [ A.class_ "screamer-form-label" ] [ element label ] ] <> r.fields)
      ]
  }

-- | Group the form's fields in a fieldset with a legend.
section :: forall props i o. String -> Form props i o -> Form props i o
section title (Form f) = Form \c -> f c <#> \r -> r
  { fields = [ E.fieldset_ [] ([ E.legend_ [] [ element title ] ] <> r.fields) ] }

-- | Validators turn a field's result into a value or an error message.
-- | Compose them with `>=>`.
type Validator a b = a -> Either String b

-- | Reject a string that is empty or only whitespace.
nonEmpty :: String -> Validator String String
nonEmpty message s = if String.trim s == "" then Left message else Right s

-- | Reject `Nothing`.
required :: forall a. String -> Validator (Maybe a) a
required message = case _ of
  Just a -> Right a
  Nothing -> Left message

-- | Reject values that fail the predicate.
mustBe :: forall a. String -> (a -> Boolean) -> Validator a a
mustBe message ok a = if ok a then Right a else Left message

-- | Field state that remembers whether the user has edited it. A validation
-- | message is shown only once its field is `Modified`, or once the form is
-- | revealed.
data Validated a = Fresh a | Modified a

derive instance Eq a => Eq (Validated a)
derive instance Functor Validated

instance Show a => Show (Validated a) where
  show (Fresh a) = "(Fresh " <> show a <> ")"
  show (Modified a) = "(Modified " <> show a <> ")"

fromValidated :: forall a. Validated a -> a
fromValidated = case _ of
  Fresh a -> a
  Modified a -> a

isModified :: forall a. Validated a -> Boolean
isModified = case _ of
  Fresh _ -> false
  Modified _ -> true

-- | Validate a form's result. Its state becomes `Modified` on the first edit,
-- | and from then on a failing validator's message is shown after the
-- | fields.
validated :: forall props i a b. Validator a b -> Form props i a -> Form props (Validated i) b
validated v (Form f) = Form \c -> do
  r <- f c { state = Source.focus { get: fromValidated, set: \a _ -> Modified a } c.state }
  let
    checked = r.result <#> map v
    message = checked <#> case _ of
      Right (Left m) -> Just m
      _ -> Nothing
    touched = (||) <$> (isModified <$> c.state.signal) <*> c.reveal
    shown = (\t m -> if t then m else Nothing) <$> touched <*> message
  pure
    { fields: r.fields <>
        [ E.span_ [ A.class_ "screamer-form-error", A.hidden_ (isNothing <$> shown) ]
            [ text (fromMaybe "" <$> shown) ]
        ]
    , result: checked <#> (_ >>= lmap pure)
    }

-- | A text input.
textbox :: forall props. Form props String String
textbox = textInput InputText

-- | A password input.
password :: forall props. Form props String String
password = textInput InputPassword

textInput :: forall props. InputType -> Form props String String
textInput t = Form \c -> pure
  { fields: [ E.input_ [ A.type_ t, A.value_ c.state.signal, H.onInput_ (inputValue (c.state.modifyT1 <<< const)) ] [] ]
  , result: Right <$> c.state.signal
  }

-- | A number input. The state is the text as entered; the result is
-- | `Nothing` when it is blank or not a number.
number :: forall props. Form props String (Maybe Number)
number = Form \c -> pure
  { fields: [ E.input_ [ A.type_ InputNumber, A.value_ c.state.signal, H.onInput_ (inputValue (c.state.modifyT1 <<< const)) ] [] ]
  , result: c.state.signal <#> \s -> Right (Number.fromString (String.trim s))
  }

-- | A checkbox.
checkbox :: forall props. Form props Boolean Boolean
checkbox = Form \c -> pure
  { fields:
      [ E.input_
          [ A.type_ InputCheckbox
          , A.checked_ c.state.signal
          , H.onChange_ \e -> for_ (target e >>= Input.fromEventTarget) \i -> Input.checked i >>= c.state.modifyT1 <<< const
          ]
          []
      ]
  , result: Right <$> c.state.signal
  }

type SelectOption a = { label :: String, value :: a }

-- | A drop-down list. `Nothing` is shown as the placeholder.
select :: forall props a. Eq a => String -> Array (SelectOption a) -> Form props (Maybe a) (Maybe a)
select placeholder options = Form \c -> pure
  { fields:
      [ E.select_
          [ H.onChange_ \e -> for_ (target e >>= Select.fromEventTarget) \s -> do
              index <- Select.selectedIndex s
              c.state.modifyT1 \_ -> _.value <$> Array.index options (index - 1)
          ]
          ( [ E.option_ [ A.value_ "", A.selected_ (isNothing <$> c.state.signal) ] [ element placeholder ] ]
              <> Array.mapWithIndex
                (\i o -> E.option_ [ A.value_ (show i), A.selected_ (c.state.signal <#> (_ == Just o.value)) ] [ element o.label ])
                options
          )
      ]
  , result: Right <$> c.state.signal
  }

inputValue :: (String -> Effect Unit) -> Event -> Effect Unit
inputValue k e = for_ (target e >>= Input.fromEventTarget) (Input.value >=> k)

-- | Build a form over a fresh state signal source, in the current scope.
type Built i o =
  { element :: Element
  , state :: SignalSource i
  , result :: Signal (Either Errors o)
  -- Show every validation message, edited or not (for example when the
  -- user tries to submit an invalid form).
  , reveal :: Effect Unit
  -- Restore the initial state and hide the messages again.
  , reset :: Effect Unit
  }

build :: forall props i o. props -> i -> Form props i o -> Owned (Built i o)
build props initial (Form f) = do
  state <- liftEffect $ signalSource initial
  revealed <- liftEffect $ signalSource false
  r <- f { props, state, reveal: revealed.signal }
  pure
    { element: E.div_ [ A.class_ "screamer-form" ] r.fields
    , state
    , result: r.result
    , reveal: revealed.putT1 true
    , reset: batch (state.putT1 initial *> revealed.putT1 false)
    }

-- | A sequence of forms over one state, shown one step at a time. Each step's
-- | result decides what comes next, so later steps can depend on earlier
-- | answers.
data Wizard props i a = Done a | Step (Form props i (Wizard props i a))

derive instance Functor (Wizard props i)

instance Apply (Wizard props i) where
  apply = ap

instance Applicative (Wizard props i) where
  pure = Done

instance Bind (Wizard props i) where
  bind (Done a) k = k a
  bind (Step f) k = Step ((_ >>= k) <$> f)

instance Monad (Wizard props i)

-- | A wizard step showing one form.
step :: forall props i a. Form props i a -> Wizard props i a
step f = Step (Done <$> f)

type Current props i o =
  { form :: Form props i (Wizard props i o)
  , rendered :: Rendered (Wizard props i o)
  , dispose :: Effect Unit
  , reveal :: SignalSource Boolean
  , back :: Array (Form props i (Wizard props i o))
  }

-- | Show a wizard one step at a time, with Back and Next buttons. Next is
-- | hidden on the last step; pressing it on an invalid step shows that step's
-- | messages instead of moving on. The result is the last step's result.
wizard :: forall props i o. Wizard props i o -> Form props i o
wizard (Done o) = pure o
wizard (Step first) = Form \c -> do
  scope <- Owned pure
  let
    open :: Form props i (Wizard props i o) -> Array (Form props i (Wizard props i o)) -> Effect (Current props i o)
    open form back = do
      reveal <- signalSource false
      let
        Owned run = child (runForm form c { reveal = (||) <$> c.reveal <*> reveal.signal })
      r <- run scope
      pure { form, rendered: r.value, dispose: r.dispose, reveal, back }
  initial <- liftEffect $ open first []
  current <- liftEffect $ signalSource initial
  let
    go form back = do
      readT0 current.signal >>= _.dispose
      current.putT1 =<< open form back
    next = do
      cur <- readT0 current.signal
      readT0 cur.rendered.result >>= case _ of
        Right (Step form) -> go form (Array.snoc cur.back cur.form)
        Right (Done _) -> pure unit
        Left _ -> cur.reveal.putT1 true
    previous = do
      cur <- readT0 current.signal
      for_ (Array.unsnoc cur.back) \{ init, last } -> go last init
    stepResult = current.signal >>= _.rendered.result
    position = current.signal <#> \cur -> Array.length cur.back + 1
  pure
    { fields:
        [ E.div_ [ A.class_ "screamer-form-wizard", attribute "data-step" (show <$> position) ]
            [ dyn (current.signal <#> \cur -> fragment_ cur.rendered.fields)
            , E.div_ [ A.class_ "screamer-form-wizard-nav" ]
                [ E.button_
                    [ A.type_ InputButton
                    , A.class_ "screamer-form-back"
                    , A.hidden_ (current.signal <#> \cur -> Array.null cur.back)
                    , H.onClick_ \_ -> previous
                    ]
                    [ element "Back" ]
                , E.button_
                    [ A.type_ InputButton
                    , A.class_ "screamer-form-next"
                    , A.hidden_ (stepResult <#> isFinal)
                    , H.onClick_ \_ -> next
                    ]
                    [ element "Next" ]
                ]
            ]
        ]
    , result: stepResult <#> case _ of
        Right (Done o) -> Right o
        Right (Step _) -> Left [ "Complete the remaining steps" ]
        Left errors -> Left errors
    }
  where
  isFinal = case _ of
    Right (Done _) -> true
    _ -> false
