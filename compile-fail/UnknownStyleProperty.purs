-- expect: TypesDoNotUnify
-- mentions: colour
-- "colour" is not a CSS property, so it is not a label of CssProperties.
module Test.CompileFail.UnknownStyleProperty where

import Screamer.Element (Element)
import Screamer.Html as E
import Screamer.Html.Attributes as A

bad :: Element
bad = E.div_ [ A.style_ { colour: "red" } ] []
