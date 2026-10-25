-- | A rainbow spiral of up to three thousand dots that follows the pointer,
-- | one signal per dot style, all updated on every animation frame. Hold
-- | the pointer down to grow the dots.
-- |
-- | A port of the rainbow spiral demo (see "History" in the README).

module Screamer.Examples.RainbowSpiral where

import Prelude

import Data.Array as Array
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Data.Number (cos, pi, sin)
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, dyn, element, fragment_)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Event as Event
import Screamer.Owned (Owned)
import Screamer.Signal (Signal, gate, sampleManyWith, sampleOn)
import Screamer.Source (SignalSource, signalSource)
import Screamer.Time as Time
import Web.DOM.Element as Element
import Web.Event.Event (currentTarget, preventDefault)
import Web.PointerEvent.PointerEvent (toMouseEvent)
import Web.UIEvent.MouseEvent (MouseEvent, clientX, clientY, toEvent)

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
-- | hidden, so only active dots follow the animation. Keeping the last
-- | position is state, so each dot makes its own `gate`.
mkDot :: Signal DotAttrs -> Int -> Owned DotStyle
mkDot dotAttrs i = do
  let isActive = dotAttrs <#> \{ max } -> Int.toNumber i < max
  activeAttrs <- gate isActive { hb: 0, pos: origin, max: 0.0 } dotAttrs
  pure
    { left: activeAttrs <#> \{ pos, max } -> px (dotCoord i pos.x sin max)
    , top: activeAttrs <#> \{ pos, max } -> px (dotCoord i pos.y cos max)
    , "border-color": activeAttrs <#> \{ hb, max } -> dotColor i hb max
    , display: isActive <#> if _ then "inline" else "none"
    }

-- | The pointer's position relative to the centre of the element handling
-- | the event, which is where the spiral starts.
fromCentre :: MouseEvent -> Effect Position
fromCentre e = case currentTarget (toEvent e) >>= Element.fromEventTarget of
  Nothing -> pure origin
  Just el -> do
    r <- Element.getBoundingClientRect el
    pure
      { x: Int.toNumber (clientX e) - r.left - r.width / 2.0
      , y: Int.toNumber (clientY e) - r.top - r.height / 2.0
      }

spiral :: Element
spiral = component do
  numerosity <- liftEffect $ signalSource 200
  heartbeat <- liftEffect $ signalSource 0
  position <- liftEffect $ signalSource origin
  isBig <- liftEffect $ signalSource false
  ticks <- Time.frames
  Event.subscribe ticks \_ -> heartbeat.modifyT1 (_ + 1)
  let
    dotAttrs = sampleManyWith { pos: position.signal, n: numerosity.signal } { hb: heartbeat.signal } toDotAttrs
    cursor = sampleOn heartbeat.signal position.signal
  pure $ E.div_ [ A.class_ "rainbow" ]
    [ animationPicker numerosity
    , E.div_
        [ A.id_ "spiral"
        , H.onPointerMove_ \e -> position.putT1 =<< fromCentre (toMouseEvent e)
        , H.onPointerDown_ \e -> preventDefault (toEvent (toMouseEvent e)) *> isBig.putT1 true
        , H.onPointerUp_ \_ -> isBig.putT1 false
        , H.onPointerLeave_ \_ -> isBig.putT1 false *> position.putT1 origin
        ]
        -- The dots are positioned relative to a point at the centre.
        [ E.div_ [ A.class_ "origin" ]
            [ dot isBig.signal
                { left: cursor <#> \{ x } -> px x
                , top: cursor <#> \{ y } -> px y
                , "border-color": pure "red"
                , display: pure "inline"
                }
                []
            , dyn $ numerosity.signal <#> \n ->
                fragment_ $ Array.range 0 (n * 3 / 2) <#> \i -> component do
                  style <- mkDot dotAttrs i
                  pure (dot isBig.signal style [])
            ]
        ]
    ]

-- | A single colored dot.
dot :: Signal Boolean -> DotStyle -> Array Element -> Element
dot isBig dotStyle =
  E.div_
    [ A.class_ (isBig <#> if _ then "big cursor" else "cursor")
    , A.style_ dotStyle
    ]

-- | Buttons choosing how many dots the spiral has.
animationPicker :: SignalSource Int -> Element
animationPicker numerosity = E.div_ [ A.class_ "picker" ]
  [ E.span_ [] [ element "Dots" ]
  , fragment_ $ counts <#> \n ->
      E.button_
        [ A.class_ (numerosity.signal <#> \m -> if m == n then "active" else "")
        , H.onClick_ \_ -> numerosity.putT1 n
        ]
        [ element (show n) ]
  ]
