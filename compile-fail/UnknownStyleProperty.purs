-- expect: TypesDoNotUnify
-- mentions: colour
-- "colour" is not a CSS property, so it is not a label of CssProperties.
module Test.CompileFail.UnknownStyleProperty where

import Screamer.Core (Element)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E

bad :: Element
bad = E.div_ [ A.style_ { colour: "red" } ] []
