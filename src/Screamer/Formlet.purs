--  Objective:
--  https://github.com/lumihq/purescript-lumi-components/blob/v3.0.4/src/Lumi/Components/Form.purs

--  Resources:
--  Formlets paper: http://homepages.inf.ed.ac.uk/slindley/papers/formlets-essence.pdf
--  Halogen formlet library: https://github.com/fpco/halogen-form
--  React-basic formlet library: https://pursuit.purescript.org/packages/purescript-lumi-components/docs/Lumi.Components.Form; posts https://www.lumi.dev/blog/using-purescript-to-create-a-dsl-for-building-forms and https://www.lumi.dev/blog/announcing-lumi-components; demo https://lumihq.github.io/purescript-lumi-components/

--  TODO: if the UI representation allows for side effects to be performed when it is rendered, then it is possible to have a dummy form field that fetches some remote data that is used within the form
--  Screamer UI as an Element can "perform side effects as it is rendered" in principle because that is true of the underlying framework.

--  Components created from a "FormBuilder" (the blog post's "Form"): https://github.com/lumihq/purescript-lumi-components/blob/v3.0.4/src/Lumi/Components/Form.purs#L122

module Screamer.Formlets.Form where


{-
import Prelude

foreign import data Element :: Type

newtype Form i o =
  Form (i -> { element :: (i -> Effect Unit) -> Element, result :: o })

type Validator i o = i -> Either String o

type Validated a = { value :: a, modified :: Boolean }

newtype Wizard i a = Wizard (Form i a)

wizard :: forall i. Wizard i ~> Form i
wizard (Wizard form) = form

step :: forall i. Form i ~> Wizard i
step = Wizard
-}
