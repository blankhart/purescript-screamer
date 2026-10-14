-- | Drag circles around an SVG canvas. The drag state is an `Event.fold`
-- | over pointer events, so the only source is the event stream itself, and
-- | every pointer event is one step, even several in one handler.
module Screamer.Examples.Draggable where

import Prelude

import Data.Array as Array
import Data.Int as Int
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Event as Event
import Screamer.EventSource (eventSource)
import Screamer.Core (Element, component, element)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.Svg as Svg
import Screamer.DOM.EventHandler as H
import Screamer.Examples.Harness as Harness
import Screamer.Signal (Signal)
import Web.PointerEvent.PointerEvent (PointerEvent, toMouseEvent)
import Web.UIEvent.MouseEvent (clientX, clientY)

main :: Effect Unit
main = Harness.run "main" draggable

type Point = { x :: Number, y :: Number }

data Pointer
  = Down Int Point
  | Move Point
  | Up

type Drag =
  { positions :: Array Point
  -- The circle being dragged, and the pointer's offset from its centre.
  , dragging :: Maybe { index :: Int, offset :: Point }
  }

start :: Drag
start =
  { positions: [ { x: 80.0, y: 80.0 }, { x: 200.0, y: 120.0 }, { x: 320.0, y: 80.0 } ]
  , dragging: Nothing
  }

step :: Pointer -> Drag -> Drag
step event drag = case event, drag.dragging of
  Down index p, _ -> case Array.index drag.positions index of
    Just c -> drag { dragging = Just { index, offset: { x: p.x - c.x, y: p.y - c.y } } }
    Nothing -> drag
  Move p, Just { index, offset } ->
    drag { positions = fromMaybe' drag.positions (Array.updateAt index { x: p.x - offset.x, y: p.y - offset.y } drag.positions) }
  Move _, Nothing -> drag
  Up, _ -> drag { dragging = Nothing }
  where
  fromMaybe' d = case _ of
    Just a -> a
    Nothing -> d

point :: PointerEvent -> Point
point e = { x: Int.toNumber (clientX m), y: Int.toNumber (clientY m) }
  where
  m = toMouseEvent e

draggable :: Element
draggable = component do
  pointer <- liftEffect eventSource
  let
    drag = Event.fold step start pointer.event
    colours = [ "tomato", "seagreen", "steelblue" ]
    circle i colour =
      Svg.circle_
        [ A.id_ ("circle-" <> show i)
        , Svg.cx_ (position i _.x)
        , Svg.cy_ (position i _.y)
        , Svg.r_ "30"
        , Svg.fill_ colour
        , Svg.stroke_ (drag <#> \d -> if map _.index d.dragging == Just i then "black" else "none")
        , H.onPointerDown_ \e -> pointer.fire (Down i (point e))
        ]
        []
    position :: Int -> (Point -> Number) -> Signal String
    position i coord = drag <#> \d -> case Array.index d.positions i of
      Just p -> show (coord p)
      Nothing -> "0"
  pure $ E.div_ []
    [ E.p_ [] [ element "Drag the circles." ]
    , Svg.svg_
        [ Svg.width_ "400"
        , Svg.height_ "200"
        , Svg.viewBox_ "0 0 400 200"
        , A.style_ { "touch-action": "none", border: "1px solid #ccc", display: "block" }
        , H.onPointerMove_ \e -> pointer.fire (Move (point e))
        , H.onPointerUp_ \_ -> pointer.fire Up
        ]
        (Array.mapWithIndex circle colours)
    ]
