-- https://github.com/luwes/sinuous-rainbow-spiral/blob/master/src/main.js

module Screamer.Examples.RainbowSpiral where

import Data.Array as A
import Effect (Effect)
import Math (pi, round, cos, sin)
import Prelude
import Screamer.Core (Element)
import Screamer.Core as S
import Screamer.Observable (Signal)
import Screamer.Observable as S
import Screamer.DOM.Element as S
import Screamer.DOM.Event as S
import Screamer.DOM.EventHandler as S
import Web.HTML as HTML

counts :: Array Int
counts = [200, 500, 1000, 2000]

loops :: Int
loops = 6

type Dot = { x :: Effect Number, y :: Effect Number, color :: Effect String }

main :: Effect Unit
main = S.mount "main" =<< do

  window <- HTML.window

  numerosity <- S.channel 200
  heartbeat <- S.channel 0

  pos <- S.channel { x: 0, y: 0 }
  isBig <- S.channel false

  -- optimize
  let range n hb = 0..(n + round (sin (2.0 * pi * hb / 90.0) * n * 0.5))
  let array = range <$> numerosity <*> heartbeat -- Signal (Array Int)

  let
    makeDot max i =
      let m = 20 + i * 2
      in
        { x:
          let
            f = i / max * loops
            theta = f * 2 * pi
          in sample pos >>= \{ x } -> pure (x + sin theta * m)
        , y:
          let
            f = i / max * loops
            theta = f * 2 * pi
          in sample pos >>= \{ y } -> pure (y + cos theta * m)
        , color:
          let
            f = i / max * loops
            hue c = (f * 255 + c * 10) % 255
          in sample counter >>= \c -> pure ("hsl('" + hue c + ",100%,50%)'")
        }

  dots <- map makeDot <$> array -- Effect (Signal Array Dot)

  pure $
    S.div_
      [ S.id_ "main"
      -- Ensure full width
      , S.onMouseMove_ \e -> S.send { x: S.pageX e, y: S.pageY e } pos
      , S.onMouseDown_ \e -> S.preventDefault e >> S.send true isBig
      , S.onMouseUp_ \e -> S.send false isBig
      ]
      [ animationPicker,

        dot (S.subscribe isBig) (S.subscribe pos) "red" [coords { x, y }],
        S.elements_ dots \{ x, y, color } ->
          dot (S.subscribe isBig) { x, y, color } []
      ]

coords :: { x :: Number, y :: Number } -> Element
coords {x, y} = S.span_ [S.class_ "label"] [S.element $ show x <> "," <> show y]

-- | Represents a single colored dot.
dot :: Signal Boolean -> Dot -> Array Element -> Element
dot isBig {x, y, color } = do
  x' <- x
  y' <- y
  c' <- color
  S.div_
  -- CSS classes concat with " "
  -- missing "label" class in original example
  [ S.class_ ((\big -> if big then "big cursor" else "cursor") <$> isBig)
  , S.style_
    { left: show x' <> "px"
    , top: show y' <> "px"
    , borderColor: c'
    }
  ]

animationPicker :: Element
animationPicker = S.element "Picker"

{-
  increment();

  function increment() {
    counter(counter() + 1);
    debounceRendering(increment);
  }

  const cache = [];
  const cursors = computed(() =>
    Array(max()).fill(0).map((_, i) => cache[i] || (cache[i] = makeCursor(i))));

  function makeCursor(i) {
    // `sample` gets the observable value without making itself a dependency.
    // The only observable dependency in these functions is `max()` which is
    // derived from `counter()`. In other words only when `counter()` is
    // updated with a new value does the element's style get updated.
    return {
      x() {
        let f = i / max() * LOOPS,
          θ = f * 2 * Math.PI,
          m = 20 + i * 2;
        return (sample(x) + Math.sin(θ) * m) | 0;
      },
      y() {
        let f = i / max() * LOOPS,
          θ = f * 2 * Math.PI,
          m = 20 + i * 2;
        return (sample(y) + Math.cos(θ) * m) | 0;
      },
      color() {
        let f = i / max() * LOOPS,
          hue = (f * 255 + sample(counter) * 10) % 255;
        return 'hsl(' + hue + ',100%,50%)';
      }
    };
  }

}

-}
