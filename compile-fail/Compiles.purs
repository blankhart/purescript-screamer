-- expect: success
-- A control: the harness itself compiles a correct snippet.
module Test.CompileFail.Compiles where

import Screamer.Core (Element)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E

good :: Element
good = E.textarea_ [ A.rows_ 3, A.style_ { color: "red" } ] []
