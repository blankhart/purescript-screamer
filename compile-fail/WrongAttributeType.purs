-- expect: TypesDoNotUnify
-- mentions: three
-- `rows_` takes an Int, not a String.
module Test.CompileFail.WrongAttributeType where

import Screamer.Element (Element)
import Screamer.Html as E
import Screamer.Html.Attributes as A

bad :: Element
bad = E.textarea_ [ A.rows_ "three" ] []
