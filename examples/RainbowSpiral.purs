-- https://github.com/luwes/sinuous-rainbow-spiral/blob/master/src/main.js

module Screamer.Examples.RainbowSpiral where

import Prelude

import Data.Array as A
import Data.Int as Int
import Effect (Effect)
import Math (pi, cos, sin)
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

counts :: Array Int
counts = [200, 500, 1000, 2000]

loops :: Number
loops = 6.0

type Dot =
  { x :: Signal Number
  , y :: Signal Number
  , color :: Signal String
  --, isActive :: Signal Boolean
  }

-- New strategy: Allocate a single array of signals
-- The array depends on numerosity (assuming sin x is maximum value)
-- and so may be reallocated from time to time.
-- But then within that, dots render only if they are "active" which
-- is determined by max.
-- Additionally, with this change (and even on the current version) it
-- should be possible to ditch map mini.  But we do still need a way to
-- render a Signal (Array Element) without mapping.

main :: Effect Unit
main = S.mount "main" =<< do

  -- NOTE: Allow channels to be the same type as signals
  -- with a phantom parameter
  numerosity <- S.channel 200

  heartbeat <- S.channel 0
  
  position <- S.channel { x: 0.0, y: 0.0 }
  let positionHb = S.sampleOn heartbeat position

  isBig <- S.channel false

  -- optimize; use builder; use STArray
  let
    maxFn n b = n + Int.round (sin (2.0 * pi * (Int.toNumber b) / 90.0) * Int.toNumber n * 0.5)
    maxHb = maxFn <$> numerosity <*> heartbeat

  let
    mkDot max i =
      let
        m = 20.0 + Int.toNumber i * 2.0
        f = Int.toNumber i / Int.toNumber max * loops
        theta = f * 2.0 * pi
      in -- These should update together so could all be one signal on the heartbeat
        { x: (\{ x } -> x + sin theta * m) <$> positionHb
        , y: (\{ y } -> y + cos theta * m) <$> positionHb
        , color:
            let hue c =
                  show (Int.round (f * 255.0 + Int.toNumber c * 10.0) `mod` 255)
            in (\c -> "hsl(" <> hue c <> ",100%,50%)") <$> S.subscribe heartbeat
        }
    mkDotArray max = mkDot max <$> A.range 0 max
    -- Signal (Array (Signal Dot))
    -- The position changes on each mouse move,
    -- But the style changes on each heartbeat.
    dots = mkDotArray <$> maxHb

  let
    runHeartbeat = do
      S.modify (_ + 1) heartbeat
      HTML.window >>= void <<< HTML.requestAnimationFrame runHeartbeat

  runHeartbeat

  pure $
    S.div_
      [ S.id_ "main"
      -- Ensure full width or use window events
      , S.onMouseMove_ \e -> S.send position { x: S.pageX_ e, y: S.pageY_ e }
      , S.onMouseDown_ \e -> S.preventDefault_ e *> S.send isBig true
      , S.onMouseUp_ \e -> S.send isBig false
      ]
      [ animationPicker
      , S.element $ position <#> \p ->
          dot (S.subscribe isBig) { x: pure p.x, y: pure p.y, color: pure "red" } [coords p]
      , S.elements_ dots \attrs ->
          dot (S.subscribe isBig) attrs []
      ]

coords :: { x :: Number, y :: Number } -> Element
coords {x,y} =
  S.span_
    [S.class_ "label"]
    [S.element $ show x <> ", " <> show y]

-- | Represents a single colored dot.
dot :: Signal Boolean -> Dot -> Array Element -> Element
dot isBig d =
  S.div_
    -- CSS classes concat with " "
    -- missing "label" class in original example
    -- the style x and y objects could just be directly built
    [ S.class_ ((\big -> if big then "big cursor" else "cursor") <$> isBig)
    , S.style_ $
      { left: d.x <#> \x -> show x <> "px"
      , top: d.y <#> \y -> show y <> "px"
      , "border-color": d.color
      }
    ]

animationPicker :: Element
animationPicker = S.element "Picker goes here"
