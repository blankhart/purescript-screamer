-- | A sign-up form built from formlets. Messages appear under a field once
-- | it has been edited, or under every field when the user submits an
-- | invalid form. Below it, a two-step wizard whose second step depends on
-- | the first answer.
module Screamer.Examples.Formlets where

import Prelude

import Data.Array as Array
import Data.Either (Either(..), either)
import Data.Maybe (Maybe(..))
import Data.Number.Format (fixed, toStringWith)
import Data.String as String
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, element, text)
import Screamer.Form (Form, Validated(..), Wizard, build, checkbox, indent, mustBe, nonEmpty, number, password, prop, required, section, select, step, textbox, validated, wizard)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes (InputType(..))
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Signal (readT0)
import Screamer.Source (signalSource)
import Type.Proxy (Proxy(..))
import Web.Event.Event (preventDefault)

main :: Effect Unit
main = Harness.run "main" $ E.div_ [] [ signup, trip ]

data Plan = Free | Pro

derive instance Eq Plan

instance Show Plan where
  show Free = "Free"
  show Pro = "Pro"

type SignupState =
  { name :: Validated String
  , email :: Validated String
  , password :: Validated String
  , age :: Validated String
  , plan :: Validated (Maybe Plan)
  , terms :: Validated Boolean
  }

type Account = { name :: String, email :: String, age :: Number, plan :: Plan }

signupForm :: forall props. Form props SignupState Account
signupForm = ado
  name <- indent "Name" $ prop (Proxy :: _ "name") $ validated (nonEmpty "Enter your name") textbox
  email <- indent "Email" $ prop (Proxy :: _ "email") $
    validated (nonEmpty "Enter your email" >=> mustBe "Enter a valid email" (String.contains (String.Pattern "@"))) textbox
  _ <- indent "Password" $ prop (Proxy :: _ "password") $
    validated (mustBe "Use at least 8 characters" ((_ >= 8) <<< String.length)) password
  age <- indent "Age" $ prop (Proxy :: _ "age") $
    validated (required "Enter your age" >=> mustBe "You must be 13 or over" (_ >= 13.0)) number
  plan <- indent "Plan" $ prop (Proxy :: _ "plan") $
    validated (required "Choose a plan") (select "Choose a plan" [ { label: "Free", value: Free }, { label: "Pro", value: Pro } ])
  _ <- indent "I accept the terms" $ prop (Proxy :: _ "terms") $
    validated (mustBe "Accept the terms to continue" identity) checkbox
  in { name, email, age, plan }

blankSignup :: SignupState
blankSignup =
  { name: Fresh ""
  , email: Fresh ""
  , password: Fresh ""
  , age: Fresh ""
  , plan: Fresh Nothing
  , terms: Fresh false
  }

signup :: Element
signup = component do
  form <- build unit blankSignup signupForm
  submitted <- liftEffect $ signalSource ""
  let
    submit = readT0 form.result >>= case _ of
      Left _ -> form.reveal
      Right a -> do
        submitted.putT1 $ "Welcome, " <> a.name <> " (" <> a.email <> ", " <> toStringWith (fixed 0) a.age <> ", " <> show a.plan <> ")"
        form.reset
  pure $ E.form_ [ A.id_ "signup", H.onSubmit_ \e -> preventDefault e *> submit ]
    [ E.h2_ [] [ element "Sign up" ]
    , form.element
    , E.button_ [ A.type_ InputSubmit ] [ element "Create account" ]
    , E.p_ [ A.id_ "status" ]
        [ text
            ( form.result <#> case _ of
                Left errors -> plural (Array.length errors) <> " to fix"
                Right _ -> "Ready"
            )
        ]
    , E.output_ [ A.id_ "submitted" ] [ text submitted.signal ]
    ]
  where
  plural = case _ of
    1 -> "1 field"
    n -> show n <> " fields"

type TripState = { kind :: Validated (Maybe String), city :: Validated String, nights :: Validated String }

tripWizard :: forall props. Wizard props TripState String
tripWizard = do
  kind <- step $ section "Step 1: where to?" $ indent "Kind of trip" $ prop (Proxy :: _ "kind") $
    validated (required "Choose a kind of trip") (select "Choose" [ { label: "City break", value: "city" }, { label: "Camping", value: "camping" } ])
  case kind of
    "city" -> step $ section "Step 2: which city?" $ indent "City" $ prop (Proxy :: _ "city")
      $ map ("City break in " <> _)
      $ validated (nonEmpty "Enter a city") textbox
    _ -> step $ section "Step 2: how long?" $ indent "Nights" $ prop (Proxy :: _ "nights")
      $ map (\n -> "Camping for " <> toStringWith (fixed 0) n <> " nights")
      $
        validated (required "Enter a number of nights" >=> mustBe "At least one night" (_ >= 1.0)) number

trip :: Element
trip = component do
  form <- build unit { kind: Fresh Nothing, city: Fresh "", nights: Fresh "" } (wizard tripWizard)
  pure $ E.div_ [ A.id_ "trip" ]
    [ E.h2_ [] [ element "Plan a trip" ]
    , form.element
    , E.p_ [ A.id_ "plan" ] [ text (form.result <#> either (const "Not finished yet") identity) ]
    ]
