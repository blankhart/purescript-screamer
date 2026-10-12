-- https://github.com/luwes/sinuous-rainbow-spiral/blob/master/src/main.js

module Screamer.Examples.RainbowSpiral where

import Prelude
import Effect.Console (log)

import Data.Array as A
import Data.Int as Int
import Effect (Effect)
import Data.Number (pi, cos, sin)
import Screamer.Core (Element)
import Screamer.Core as S
import Screamer.DOM.Attribute as S
import Screamer.DOM.Element as S
import Screamer.DOM.Event as S
import Screamer.DOM.EventHandler as S
import Screamer.Observable (Signal)
import Screamer.Observable as S
import Web.HTML as HTML
import Web.HTML.Window as HTML

-- These are not actually the number of dots in the spiral,
-- which vary from frame to frame.  The maximum number of
-- dots is 150% of these numbers.
counts :: Array Int
counts = [200, 500, 1000, 2000]

loops :: Number
loops = 6.0

type DotStyle =
  { "left" :: Signal String
  , "top" :: Signal String
  , "border-color" :: Signal String
  , "display" :: Signal String
  }

dotColor :: Int -> Int -> Number -> Color
dotColor i hb max = "hsl(" <> hue <> ",100%,50%)"
  where
    hue = show (Int.round (f * 255.0 + Int.toNumber hb * 10.0) `mod` 255)
    f = Int.toNumber i / max * loops

dotCoord :: Int -> Number -> (Number -> Number) -> Number -> Number
dotCoord i c trig max = c + m * trig theta
  where
    m = 20.0 + Int.toNumber i * 2.0
    theta = 2.0 * pi * Int.toNumber i / max * loops

type Color = String

type Position = { x :: Number, y :: Number }

origin :: Position
origin = { x: 0.0, y: 0.0 }

-- What if you want to close a websocket, say?
-- Then the websocket channel would depend on the other variable.
-- What if you have dependent channels? Difficult to have in same record.
-- But should a separate component be enforced?

main :: Effect Unit
main = S.mount "main" =<< do

  -- Props...

  -- State/inputs (Props -> Channels)
  { signal: numerosity, put: putNumerosity } <- S.channel 200

  { signal: heartbeat, modify: modifyHeartbeat } <- S.channel 0

  { signal: position, put: putPosition } <- S.channel origin

  { signal: isBig, put: putBig } <- S.channel false

  let

    -- A difficulty with components is that there is a lot of computed
    -- state that may need to be shared between initialization and view,
    -- which would need access to the same channel.

    dotAttrs = S.sampleManyWith
      { pos: position, n: numerosity } -- sampled
      { hb: heartbeat } -- tracked
      \{ pos, n, hb } ->
        let n' = Int.toNumber n
            hb' = Int.toNumber hb
            -- It's not entirely clear what this is the "max" of, but it
            -- controls the number of dots pictured in the spiral for
            -- a given frame.
            max = n' + sin (2.0 * pi * hb' / 90.0) * n' * 0.5
        in  { hb, max, pos }

    mkDot i =
      { "left": activeAttrs <#> \{pos, max} ->
          show (dotCoord i pos.x sin max) <> "px"
      , "top": activeAttrs <#> \{pos, max} ->
          show (dotCoord i pos.y cos max) <> "px"
      , "border-color":
          activeAttrs <#> \{hb, max} -> dotColor i hb max
      , "display": isActive <#> \active ->
          if active then "inline" else "none"
      }
      where
        isActive = S.distinct $ dotAttrs <#> \{max} -> Int.toNumber i < max
        activeAttrs = S.filterOn isActive nullAttrs dotAttrs
        nullAttrs = { hb: 0, pos: origin, max: 0.0 }

    -- Instead of reallocating the dot array once per frame,
    -- just turn off the display property for unused dots.
    dots = numerosity <#> \n ->
      map mkDot (A.range 0 (n * 3 / 2))

    runHeartbeat = do
      modifyHeartbeat (_ + 1)
      HTML.window >>= void <<< HTML.requestAnimationFrame runHeartbeat

  -- Initialize/run (Props -> Channels -> Effect Unit)
  runHeartbeat

  -- Destroy...
  -- Passed to the component computed's cleanup function

  -- View :: Props -> Channels -> Element
  pure $
    S.div_
      [ S.id_ "main"
      , S.onMouseMove_ \e -> putPosition { x: S.pageX_ e, y: S.pageY_ e }
      , S.onMouseDown_ \e -> S.preventDefault_ e *> putBig true
      , S.onMouseUp_ \e -> putBig false
      ]
      [ animationPicker
      , S.element $
          let pos = S.sampleOn heartbeat position
          in dot isBig
              { "left": pos <#> \{x} -> show x <> "px"
              , "top": pos <#> \{y} -> show y <> "px"
              , "border-color": pure "red"
              , "display": pure "inline"
              } [] -- coords p
      , S.element $
          (S.fragment_ <<< map (\attrs -> dot isBig attrs [])) <$> dots
      ]

coords :: Position -> Element
coords {x,y} =
  S.span_
    [S.class_ "label"]
    [S.element $ show x <> ", " <> show y]

-- | Represents a single colored dot.
dot :: Signal Boolean -> DotStyle -> Array Element -> Element
dot isBig dotStyle =
  S.div_
    -- CSS classes concat with " "
    -- missing "label" class in original example
    [ S.class_ ((\big -> if big then "big cursor" else "cursor") <$> isBig)
    , S.style_ dotStyle
    ]

animationPicker :: Element
animationPicker = S.element "Picker goes here"
