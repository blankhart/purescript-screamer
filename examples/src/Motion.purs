-- | Tasks that move between two lists: `crossfade` carries a task from one
-- | list to the other, `flipMoves` slides the rows around it, new tasks fade
-- | in, and a `tween` eases the progress bar. All of it honours reduced
-- | motion.
module Screamer.Examples.Motion where

import Prelude

import Data.Array as Array
import Data.Int (toNumber)
import Data.Time.Duration (Milliseconds(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (Element, component, each, element, text)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Motion (crossfade, cubicOut, flipMoves, tween)
import Screamer.Signal (Signal, readT0)
import Screamer.Source (signalSource)

main :: Effect Unit
main = Harness.run "main" tasks

type Task = { id :: Int, label :: String, done :: Boolean }

initial :: Array Task
initial =
  [ { id: 1, label: "Water the plants", done: false }
  , { id: 2, label: "Answer the letter", done: false }
  , { id: 3, label: "Fix the gate", done: true }
  , { id: 4, label: "Buy bread", done: false }
  ]

motion :: { duration :: Milliseconds, easing :: String }
motion = { duration: Milliseconds 400.0, easing: "cubic-bezier(0.2, 0, 0, 1)" }

tasks :: Element
tasks = component do
  all <- liftEffect $ signalSource initial
  nextId <- liftEffect $ Ref.new 5
  let
    todo = Array.filter (not <<< _.done) <$> all.signal
    done = Array.filter _.done <$> all.signal
    toggle id = all.modifyT1 (map \t -> if t.id == id then t { done = not t.done } else t)
    add = do
      id <- Ref.modify' (\i -> { state: i + 1, value: i }) nextId
      all.modifyT1 (_ <> [ { id, label: "Task " <> show id, done: false } ])
    share ts = if Array.null ts then 0.0 else toNumber (Array.length (Array.filter _.done ts)) / toNumber (Array.length ts)
  progress <- tween { duration: Milliseconds 400.0, easing: cubicOut } (share <$> all.signal)
  pure $ E.div_ [ A.id_ "motion" ]
    [ E.div_ [ A.class_ "toolbar" ]
        [ E.button_ [ A.id_ "add", H.onClick_ \_ -> add ] [ element "Add a task" ]
        , E.button_ [ A.id_ "reverse", H.onClick_ \_ -> all.modifyT1 Array.reverse ] [ element "Reverse" ]
        ]
    , E.div_ [ A.class_ "progress" ]
        [ E.div_ [ A.id_ "fill", A.style_ { width: progress <#> \p -> show (p * 100.0) <> "%" } ] [] ]
    , crossfade motion \{ send, receive } -> flipMoves motion $ E.div_ [ A.class_ "columns" ]
        let
          row t = send (_.id <$> t) $ receive (_.id <$> t) $
            E.li_ [ H.onClick_ \_ -> readT0 t >>= \x -> toggle x.id ] [ text (_.label <$> t) ]

          column :: String -> String -> Signal (Array Task) -> Element
          column id title items = E.section_ []
            [ E.h2_ [] [ element title ]
            , E.ul_ [ A.id_ id ] [ each _.id items row ]
            ]
        in
          [ column "todo" "To do" todo, column "done" "Done" done ]
    ]
