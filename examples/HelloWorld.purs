module Screamer.Examples.HelloWorld where

import Effect (Effect)
import Prelude
import Screamer.Core as S
import Screamer.Observable as S

main :: Effect Unit
main = S.mount "main" $ do
  counter <- S.channel 0
  jumper <- S.channel 0
  let
    count = S.subscribe counter <> S.subscribe jumper
  S.tick counter
  pure $
    S.element "div"
      [ S.attribute "style" "color: blue;"
      ]
      [ S.signal count
      , S.element "br" [] []
      , S.signal $ map (_ + 2) count
      , S.element "br" [] []
      , S.signal $ map (_ + 5) count
      , S.element "br" [] []
      , S.element "button"
          [ S.handler "click" \_ -> S.send counter 0 ]
          [ S.text "Reset" ]
      , S.element "button"
          [ S.handler "click" \_ -> S.send jumper 1000 ]
          [ S.text "Jump" ]
      ]

