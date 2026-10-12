-- expect: TypesDoNotUnify
-- mentions: three
-- `rows_` takes an Int, not a String.
module Test.CompileFail.WrongAttributeType where

import Screamer.Core (Element)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E

bad :: Element
bad = E.textarea_ [ A.rows_ "three" ] []
