-- https://github.com/luwes/sinuous-rainbow-spiral/blob/master/src/main.js

module Screamer.Examples.RainbowSpiral where

import Prelude
import Debug.Trace
import Effect.Console (log)

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

type Color = String

type Dot =
  { position :: Position
  , color :: Color
  , isActive :: Boolean
  }

dotColor :: Int -> Int -> Number -> Color
dotColor i hb max = "hsl(" <> hue <> ",100%,50%)"
  where
    hue = show (Int.round (f * 255.0 + Int.toNumber hb * 10.0) `mod` 255)
    f = Int.toNumber i / max * loops

dotPosition :: Int -> Position -> Number -> Position
dotPosition i {x,y} max = { x: x + m * sin theta, y: y + m * cos theta }
  where
    m = 20.0 + Int.toNumber i * 2.0
    theta = 2.0 * pi * Int.toNumber i / max * loops

type Position = { x :: Number, y :: Number }

main :: Effect Unit
main = S.mount "main" =<< do

  { signal: numerosity, put: putNumerosity } <- S.channel 200

  { signal: heartbeat, modify: modifyHeartbeat } <- S.channel 0

  { signal: position, put: putPosition } <- S.channel { x: 0.0, y: 0.0 }

  { signal: isBig, put: putBig } <- S.channel false

  let

    maxHb = maxFn <$> numerosity <*> heartbeat
      where
        maxFn n hb = -- trace "Running maxFn..." \_ ->
          Int.toNumber n + sin (2.0 * pi * (Int.toNumber hb) / 90.0) * Int.toNumber n * 0.5

    posHb = S.sampleOn heartbeat position

    dotAttrs = -- trace "Running dotAttrs..." \_ ->
      attrs <$> maxHb <*> heartbeat <*> posHb
        where
          attrs max hb pos = -- trace "Running attrs..." \_ ->
            { hb, pos, max } -- inner loop, once per frame

    mkDot i = -- trace "Running mkDot..." \_ ->
      dotAttrs <#> \{ hb, pos, max } -> -- inner loop, once per dot per frame
        let x =
              { position: dotPosition i pos max
              , color: dotColor i hb max
              , isActive: Int.toNumber i < max
              }
        in
    --        if hb < 10
    --          then
    --            trace ("Updating dot " <> show i <> "...") \_ -> x
    --          else
                  x

    dots =
      trace "Running dots..." \_ ->
        numerosity <#> \n -> map mkDot (A.range 0 (n * 3 / 2))

    runHeartbeat = do
      -- hb <- S.get heartbeat
      -- when (hb < 10) do
        -- log "Starting update..."
      modifyHeartbeat (_ + 1)
      -- when (hb < 10) do
        -- log "Requesting animation frame..."
      HTML.window >>= void <<< HTML.requestAnimationFrame runHeartbeat

  runHeartbeat

  pure $
    S.div_
      [ S.id_ "main"
      -- Ensure full width or use window events
      , S.onMouseMove_ \e -> putPosition { x: S.pageX_ e, y: S.pageY_ e }
      , S.onMouseDown_ \e -> S.preventDefault_ e *> putBig true
      , S.onMouseUp_ \e -> putBig false
      ]
      [ animationPicker
      , S.element $ position <#> \p ->
          dot isBig (pure { position: p, color: "red", isActive: true }) [coords p]
      , S.element $ (S.fragment_ <<< map (\attrs -> dot isBig attrs [])) <$> dots
      ]

coords :: Position -> Element
coords {x,y} =
  S.span_
    [S.class_ "label"]
    [S.element $ show x <> ", " <> show y]

-- | Represents a single colored dot.
dot :: Signal Boolean -> Signal Dot -> Array Element -> Element
dot isBig theDot =
  -- Runs on every mouse move as to the cursor dot
  -- but for every numerosity reset as to the spiral dots
  trace "Running dot..." \_ ->
  S.div_
    -- CSS classes concat with " "
    -- missing "label" class in original example
    -- the style x and y objects could just be directly built
    [ S.class_ ((\big -> if big then "big cursor" else "cursor") <$> isBig)
    , S.style_ $ theDot <#> \d ->
      -- inner loop, once per dot per frame
      -- possibly try static style shapes
      -- trace "Updating styles..." \_ ->
        { -- transform is slower; have not set "will-change"
          -- "transform": "translate(" <> show d.position.x <> "px," <> show d.position.y <> "px)"
          "left": show d.position.x <> "px"
        , "top": show d.position.y <> "px"
        , "border-color": d.color
        , "visibility": if d.isActive then "visible" else "hidden"
        }
    ]

animationPicker :: Element
animationPicker = S.element "Picker goes here"
