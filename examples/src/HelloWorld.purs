module Screamer.Examples.HelloWorld where

import Control.Bind
import Data.String (split, Pattern(..), toUpper)
import Data.String.CodeUnits (toCharArray)
import Effect (Effect)
import Effect.Console (log)
import Prelude
import Screamer.Core.Sinuous as S
import Screamer.Observable as S
import Screamer.DOM.Element as S
import Screamer.DOM.Event as S
import Screamer.DOM.EventHandler as S
import Screamer.Internal as S
import Unsafe.Coerce (unsafeCoerce)

{-
consolation :: Effect (S.Signal Int)
consolation = do
  log "Ran effect"
  S.subscribe <$> S.channel 3
-}

main :: Effect Unit
main = log "Hello world!"

{-

main :: Effect Unit
main = S.mount "main" =<< do
  ticker <- S.channel 0
  jumper <- S.channel 0
  inputChan <- S.channel "type here"
  clicked <- S.channel "unclicked"
  let
    tangle = S.sampleOn (S.subscribe jumper) (S.subscribe inputChan)
    count = S.fold (+) 0 (S.subscribe ticker <> S.subscribe jumper)
    uppercased = toUpper <$> S.subscribe inputChan
    letters = split (Pattern "") <$> uppercased
  S.tick ticker
  -- Referential transparency failure occurs here because it runs the effect
  log $ unsafeCoerce $ S.component consolation
  pure $
    S.element_ "div"
      [ S.attribute_ "style" "color: blue;"
      ]
      [ S.element "Tangle:"
      , S.element tangle
      , S.br_ [] []
      , S.element count
      , S.br_ [] []
      , S.element $ map (_ + 2) count
      , S.br_ [] []
      , S.element $ map (_ + 5) count
      , S.element_ "br" [] []
      , S.element_ "button"
          [ S.on_ "click" \_ -> do
              S.send jumper 1000
              S.send clicked "clicked!"
          ]
          [ S.element "Jump" ]
      , S.element uppercased
      , S.br_ [] []
      , input (uppercased <> S.subscribe clicked) inputChan
      , S.br_ [] []
      , S.div_ [] [ S.elements_ letters \s -> S.element s ]
--      , S.component consolation
      ]

input :: S.Signal String -> S.Channel String -> S.Element
input s c = do
  S.element_ "input"
    [ S.onInput_ \i -> do
        log $ "Got " <> unsafeCoerce i
        S.send c (S.inputValue i)
    , S.attribute_ "value" s
    ]
    []

-}