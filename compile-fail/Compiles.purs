-- expect: success
-- A control: the harness itself compiles a correct snippet.
module Test.CompileFail.Compiles where

import Screamer.Element (Element)
import Screamer.Html as E
import Screamer.Html.Attributes as A

good :: Element
good = E.textarea_ [ A.rows_ 3, A.style_ { color: "red" } ] []
