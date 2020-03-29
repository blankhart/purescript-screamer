module Screamer.Examples.HelloWorld where

import Effect (Effect)
import Prelude
import Screamer.Component.Trans as S
import Screamer.Core as S
import Screamer.Observable as S

main :: Effect Unit
main = S.mount "main" $ do
  ticker <- S.channel 0
  jumper <- S.channel 0
  let
    -- leaky
    count = S.fold (+) 0 (S.subscribe ticker <> S.subscribe jumper)
  S.tick ticker
  pure $
    S.element "div"
      [ S.attribute "style" "color: blue;"
      ]
      [ S.signal (S.render (pure $ S.subscribe jumper))
      , S.element "br" [] []
      , S.signal count
      , S.element "br" [] []
      , S.signal $ map (_ + 2) count
      , S.element "br" [] []
      , S.signal $ map (_ + 5) count
      , S.element "br" [] []
{-
      , S.element "button"
          [ S.handler "click" \_ -> S.send ticker 0 ]
          [ S.text "Reset" ]
-}
      , S.element "button"
          [ S.handler "click" \_ -> S.send jumper 1000 ]
          [ S.text "Jump" ]
      ]

