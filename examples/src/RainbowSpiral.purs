-- A port of the rainbow spiral demo (see "History" in the README).

module Screamer.Examples.RainbowSpiral where

import Prelude

import Data.Array as Array
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.Number (cos, pi, sin)
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Channel (channel)
import Screamer.Core (Element, component, dyn, element, fragment_)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.EventHandler as H
import Screamer.Examples.Harness as Harness
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal, filterOn, sampleManyWith, sampleOn)
import Web.Event.Event (preventDefault)
import Web.HTML (window)
import Web.HTML.Window (cancelAnimationFrame, requestAnimationFrame)
import Web.UIEvent.MouseEvent (pageX, pageY, toEvent)

main :: Effect Unit
main = Harness.run "main" spiral

-- These are not actually the number of dots in the spiral,
-- which vary from frame to frame.  The maximum number of
-- dots is 150% of these numbers.
counts :: Array Int
counts = [ 200, 500, 1000, 2000 ]

loops :: Number
loops = 6.0

type Color = String

type Position = { x :: Number, y :: Number }

type DotStyle =
  { left :: Signal String
  , top :: Signal String
  , "border-color" :: Signal String
  , display :: Signal String
  }

type DotAttrs = { hb :: Int, max :: Number, pos :: Position }

origin :: Position
origin = { x: 0.0, y: 0.0 }

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

px :: Number -> String
px n = show n <> "px"

toDotAttrs :: { pos :: Position, n :: Int, hb :: Int } -> DotAttrs
toDotAttrs { pos, n, hb } = { hb, max, pos }
  where
  n' = Int.toNumber n
  hb' = Int.toNumber hb
  -- It's not entirely clear what this is the "max" of, but it
  -- controls the number of dots pictured in the spiral for
  -- a given frame.
  max = n' + sin (2.0 * pi * hb' / 90.0) * n' * 0.5

-- | The style of dot `i`. An inactive dot keeps its last position and is
-- | hidden, so only active dots follow the animation.
mkDot :: Signal DotAttrs -> Int -> DotStyle
mkDot dotAttrs i =
  { left: activeAttrs <#> \{ pos, max } -> px (dotCoord i pos.x sin max)
  , top: activeAttrs <#> \{ pos, max } -> px (dotCoord i pos.y cos max)
  , "border-color": activeAttrs <#> \{ hb, max } -> dotColor i hb max
  , display: isActive <#> if _ then "inline" else "none"
  }
  where
  isActive = dotAttrs <#> \{ max } -> Int.toNumber i < max
  activeAttrs = filterOn isActive { hb: 0, pos: origin, max: 0.0 } dotAttrs

spiral :: Element
spiral = component do
  numerosity <- liftEffect $ channel 200
  heartbeat <- liftEffect $ channel 0
  position <- liftEffect $ channel origin
  isBig <- liftEffect $ channel false
  everyFrame (heartbeat.modify (_ + 1))
  let
    dotAttrs = sampleManyWith { pos: position.signal, n: numerosity.signal } { hb: heartbeat.signal } toDotAttrs
    cursor = sampleOn heartbeat.signal position.signal
  pure $ E.div_
    [ A.id_ "main"
    , H.onMouseMove_ \e -> position.put { x: Int.toNumber (pageX e), y: Int.toNumber (pageY e) }
    , H.onMouseDown_ \e -> preventDefault (toEvent e) *> isBig.put true
    , H.onMouseUp_ \_ -> isBig.put false
    ]
    [ animationPicker
    , dot isBig.signal
        { left: cursor <#> \{ x } -> px x
        , top: cursor <#> \{ y } -> px y
        , "border-color": pure "red"
        , display: pure "inline"
        }
        []
    , dyn $ numerosity.signal <#> \n ->
        fragment_ $ Array.range 0 (n * 3 / 2) <#> \i -> dot isBig.signal (mkDot dotAttrs i) []
    ]

-- | A single colored dot.
dot :: Signal Boolean -> DotStyle -> Array Element -> Element
dot isBig dotStyle =
  E.div_
    [ A.class_ (isBig <#> if _ then "big cursor" else "cursor")
    , A.style_ dotStyle
    ]

animationPicker :: Element
animationPicker = element "Picker goes here"

-- | Run an action on every animation frame until the scope is disposed.
-- | Temporary, until `Screamer.Subscriptions.AnimationFrame` exists.
everyFrame :: Effect Unit -> Owned Unit
everyFrame action = do
  pending <- liftEffect $ Ref.new Nothing
  let
    schedule = do
      w <- window
      id <- requestAnimationFrame (action *> schedule) w
      Ref.write (Just id) pending
  liftEffect schedule
  onCleanup do
    w <- window
    Ref.read pending >>= case _ of
      Just id -> cancelAnimationFrame id w
      Nothing -> pure unit
