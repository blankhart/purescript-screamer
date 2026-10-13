module Test.Formlet (spec) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Exception (throw)
import Effect.Ref as Ref
import Screamer.Channel (channel)
import Screamer.Core (component, dyn, mount, text)
import Screamer.Formlet (Built, Form, Validated(..), Wizard, build, checkbox, indent, mustBe, nonEmpty, number, prop, required, select, step, textbox, validated, wizard)
import Screamer.Reactive.Core (readStats)
import Screamer.Signal (read)
import Test.DomHelpers (click, innerHTML, resetBody, selectIndex, setChecked, textsOf, typeInto, visibleTextsOf)
import Test.Observe (observe)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Type.Proxy (Proxy(..))

type Person =
  { name :: Validated String
  , age :: Validated String
  , plan :: Validated (Maybe String)
  , agree :: Boolean
  }

type Signup = { name :: String, age :: Number, plan :: String, agree :: Boolean }

blank :: Person
blank = { name: Fresh "", age: Fresh "", plan: Fresh Nothing, agree: false }

personForm :: Form Unit Person Signup
personForm = ado
  name <- indent "Name" $ prop (Proxy :: _ "name") $ validated (nonEmpty "Enter a name") textbox
  age <- indent "Age" $ prop (Proxy :: _ "age") $
    validated (required "Enter a number" >=> mustBe "Must be 18 or over" (_ >= 18.0)) number
  plan <- indent "Plan" $ prop (Proxy :: _ "plan") $
    validated (required "Choose a plan") (select "Choose" [ { label: "Basic", value: "basic" }, { label: "Pro", value: "pro" } ])
  agree <- indent "Agree" $ prop (Proxy :: _ "agree") checkbox
  in { name, age, plan, agree }

field :: Int -> String -> String
field n el = ".screamer-form > label:nth-child(" <> show n <> ") " <> el

-- | Mount a form under `#root` and return what `build` gave.
mountForm :: forall i o. i -> Form Unit i o -> Effect (Built i o)
mountForm initial form = do
  resetBody
  ref <- Ref.new Nothing
  _ <- mount "#root" $ component do
    built <- build unit initial form
    liftEffect $ Ref.write (Just built) ref
    pure built.element
  Ref.read ref >>= case _ of
    Just built -> pure built
    Nothing -> throw "form was not built"

type Trip = { kind :: Validated (Maybe String), city :: Validated String, nights :: Validated String }

data Stay = City String | Camping Number

derive instance Eq Stay

instance Show Stay where
  show (City c) = "City " <> show c
  show (Camping n) = "Camping " <> show n

tripWizard :: Wizard Unit Trip Stay
tripWizard = do
  kind <- step $ indent "Kind" $ prop (Proxy :: _ "kind") $
    validated (required "Choose a kind") (select "Choose" [ { label: "City", value: "city" }, { label: "Camping", value: "camping" } ])
  if kind == "city" then
    step $ map City $ indent "City" $ prop (Proxy :: _ "city") $ validated (nonEmpty "Enter a city") textbox
  else
    step $ map Camping $ indent "Nights" $ prop (Proxy :: _ "nights") $ validated (required "Enter a number") number

spec :: Spec Unit
spec = describe "Screamer.Formlet" do
  it "collects every field's errors and updates the result as fields are edited" do
    form <- liftEffect $ mountForm blank personForm
    observer <- liftEffect $ observe form.result
    liftEffect (read form.result) >>= shouldEqual (Left [ "Enter a name", "Enter a number", "Choose a plan" ])
    liftEffect do
      typeInto (field 1 "input") "Ada"
      typeInto (field 2 "input") "36"
      selectIndex (field 3 "select") 2
      setChecked (field 4 "input") true
    liftEffect (read form.result) >>= shouldEqual (Right { name: "Ada", age: 36.0, plan: "pro", agree: true })
    liftEffect (read form.state.signal) >>= shouldEqual
      { name: Modified "Ada", age: Modified "36", plan: Modified (Just "pro"), agree: true }
    trace <- liftEffect observer.trace
    trace `shouldEqual`
      [ Left [ "Enter a name", "Enter a number", "Choose a plan" ]
      , Left [ "Enter a number", "Choose a plan" ]
      , Left [ "Choose a plan" ]
      , Right { name: "Ada", age: 36.0, plan: "pro", agree: false }
      , Right { name: "Ada", age: 36.0, plan: "pro", agree: true }
      ]
    liftEffect observer.stop

  it "writes state changes back to the fields" do
    form <- liftEffect $ mountForm blank personForm
    liftEffect $ form.state.put { name: Fresh "Grace", age: Fresh "85", plan: Fresh (Just "basic"), agree: true }
    liftEffect (read form.result) >>= shouldEqual (Right { name: "Grace", age: 85.0, plan: "basic", agree: true })
    liftEffect (innerHTML (field 3 "select")) >>= shouldEqual
      """<option value="">Choose</option><option value="0">Basic</option><option value="1">Pro</option>"""
    liftEffect (selectedIndexOf (field 3 "select")) >>= shouldEqual 1

  it "shows a validation message after an edit and clears it when fixed" do
    form <- liftEffect $ mountForm blank personForm
    let errors = liftEffect (visibleTextsOf ".screamer-form-error")
    errors >>= shouldEqual []
    liftEffect $ typeInto (field 2 "input") "12"
    errors >>= shouldEqual [ "Must be 18 or over" ]
    liftEffect $ typeInto (field 2 "input") ""
    errors >>= shouldEqual [ "Enter a number" ]
    liftEffect $ typeInto (field 2 "input") "40"
    errors >>= shouldEqual []
    liftEffect $ typeInto (field 1 "input") "  "
    errors >>= shouldEqual [ "Enter a name" ]
    liftEffect form.reveal
    errors >>= shouldEqual [ "Enter a name", "Choose a plan" ]
    liftEffect form.reset
    errors >>= shouldEqual []
    liftEffect (read form.state.signal) >>= shouldEqual blank

  it "releases every observer when a form inside dyn is switched away" do
    liftEffect resetBody
    shown <- liftEffect $ channel false
    _ <- liftEffect $ mount "#root" $ dyn $ shown.signal <#> case _ of
      true -> component (_.element <$> build unit blank personForm)
      false -> text (pure "hidden")
    before <- liftEffect readStats
    liftEffect do
      shown.put true
      typeInto (field 1 "input") "Ada"
      typeInto (field 2 "input") "7"
      selectIndex (field 3 "select") 1
    liftEffect (visibleTextsOf ".screamer-form-error") >>= shouldEqual [ "Must be 18 or over" ]
    liftEffect $ shown.put false
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }
    liftEffect (innerHTML "#root") >>= shouldEqual "<!---->hidden<!---->"

  describe "wizard" do
    let
      start = { kind: Fresh Nothing, city: Fresh "", nights: Fresh "" }
      labels = liftEffect (textsOf ".screamer-form-label")
      buttons = liftEffect (visibleTextsOf ".screamer-form-wizard-nav button")
      errors = liftEffect (visibleTextsOf ".screamer-form-error")

    it "moves through steps chosen by earlier answers" do
      form <- liftEffect $ mountForm start (wizard tripWizard)
      labels >>= shouldEqual [ "Kind" ]
      buttons >>= shouldEqual [ "Next" ]
      -- Next on an invalid step shows its messages and stays put.
      liftEffect $ click ".screamer-form-next"
      labels >>= shouldEqual [ "Kind" ]
      errors >>= shouldEqual [ "Choose a kind" ]
      liftEffect $ selectIndex "select" 2
      liftEffect $ click ".screamer-form-next"
      labels >>= shouldEqual [ "Nights" ]
      errors >>= shouldEqual []
      liftEffect (read form.result) >>= shouldEqual (Left [ "Enter a number" ])
      -- Back keeps the answers; choosing differently changes the next step.
      liftEffect $ click ".screamer-form-back"
      labels >>= shouldEqual [ "Kind" ]
      liftEffect (selectedIndexOf "select") >>= shouldEqual 2
      liftEffect $ selectIndex "select" 1
      liftEffect $ click ".screamer-form-next"
      labels >>= shouldEqual [ "City" ]
      buttons >>= shouldEqual [ "Back", "Next" ]
      liftEffect (read form.result) >>= shouldEqual (Left [ "Enter a city" ])
      liftEffect $ typeInto "input" "Lisbon"
      -- The last step has no Next.
      buttons >>= shouldEqual [ "Back" ]
      liftEffect (read form.result) >>= shouldEqual (Right (City "Lisbon"))

    it "disposes each step it leaves" do
      _ <- liftEffect $ mountForm start (wizard tripWizard)
      mounted <- liftEffect readStats
      liftEffect do
        selectIndex "select" 1
        click ".screamer-form-next"
        click ".screamer-form-back"
      again <- liftEffect readStats
      (again.liveScopes - mounted.liveScopes) `shouldEqual` 0
      (again.liveEffects - mounted.liveEffects) `shouldEqual` 0

foreign import selectedIndexOf :: String -> Effect Int
