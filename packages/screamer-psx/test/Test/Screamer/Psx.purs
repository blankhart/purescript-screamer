module Test.Screamer.Psx where

import Prelude

import Effect (Effect)
import Effect.Console (log)
import Effect.Exception (throw)
import Effect.Ref as Ref
import Screamer.Element (mount)
import Screamer.Psx as B
import Screamer.Test.Dom (resetBody)

foreign import dispatch :: String -> String -> Effect Boolean

main :: Effect Unit
main = do
  resetBody
  calls <- Ref.new 0
  dispose <- mount "#root"
    ( B.root
        [ B.form [ B.onSubmit (Ref.modify_ (_ + 1) calls) ] B.none
        , B.a [ B.href "#target", B.onClick (Ref.modify_ (_ + 1) calls) ] B.none
        ]
    )
  submitted <- dispatch "form" "submit"
  unless submitted (throw "submit must prevent default")
  clicked <- dispatch "a" "click"
  when clicked (throw "click must preserve default")
  count <- Ref.read calls
  unless (count == 2) (throw "both handlers must run once")
  dispose
  log "screamer-psx: all tests passed"
