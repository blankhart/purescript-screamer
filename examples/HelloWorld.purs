module Screamer.Examples.HelloWorld where

import Data.String (toUpper)
import Effect (Effect)
import Effect.Console (log)
import Prelude
import Screamer.Core as S
import Screamer.Observable as S
import Unsafe.Coerce (unsafeCoerce)

consolation :: Effect (S.Signal Int)
consolation = do
  log "Ran effect"
  S.subscribe <$> S.channel 3

main :: Effect Unit
main = S.mount "main" $ do
  ticker <- S.channel 0
  jumper <- S.channel 0
  inputChan <- S.channel "type here"
  clicked <- S.channel "unclicked"
  tangle <- flip S.trial (pure unit) do
    cuckoo <- S.channel 9
    S.send jumper 400
    j <- S.get (S.subscribe jumper <> S.subscribe cuckoo)
    S.send ticker (-j)
    log $ "Ran...!"
    S.get (S.subscribe cuckoo)
  let
    count = S.fold (+) 0 (S.subscribe ticker <> S.subscribe jumper)
    uppercased = toUpper <$> S.subscribe inputChan
  S.tick ticker
  -- Referential transparency failure occurs here because it runs the effect
  log $ unsafeCoerce $ S.component consolation
  pure $
    S.element "div"
      [ S.attribute "style" "color: blue;"
      ]
      [ S.text "Tangle:"
      , S.signal tangle
      , S.element "br" [] []
      , S.signal count
      , S.element "br" [] []
      , S.signal $ map (_ + 2) count
      , S.element "br" [] []
      , S.signal $ map (_ + 5) count
      , S.element "br" [] []
{-
      , S.element "button"
          [ S.on "click" \_ -> S.send ticker 0 ]
          [ S.text "Reset" ]
-}
      , S.element "button"
          [ S.on "click" \_ -> do
              S.send jumper 1000
              S.send clicked "clicked!"
          ]
          [ S.text "Jump" ]
      , S.signal uppercased
      , S.element "br" [] []
      , input (uppercased <> S.subscribe clicked) inputChan
--      , S.component consolation
      ]

input :: S.Signal String -> S.Channel String -> S.Element
input s c = do
  S.element "input"
    [ S.on "input" \i -> do
        let t = i # S.property "target" # S.property "value"
        log $ "Sending " <> t
        log $ "Got " <> unsafeCoerce i
        S.send c t
    , S.attribute "value" s
    ]
    []
