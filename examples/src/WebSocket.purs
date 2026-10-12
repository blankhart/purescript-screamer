-- | A chat box over a WebSocket. The socket opens with the component and
-- | closes when it is unmounted.
module Screamer.Examples.WebSocket where

import Prelude

import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Channel (channel)
import Screamer.Core (Element, component, each, element, text)
import Screamer.DOM.Attribute (InputType(..))
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.EventHandler as H
import Screamer.Examples.Harness as Harness
import Screamer.Owned (subscribe)
import Screamer.Signal (read)
import Screamer.Subscriptions.WebSocket (ConnectionState(..), connect)
import Web.Event.Event (preventDefault, target)
import Web.HTML.HTMLInputElement as Input

main :: Effect Unit
main = Harness.run "main" (chat "wss://echo.websocket.org")

type Line = { index :: Int, text :: String, mine :: Boolean }

chat :: String -> Element
chat url = component do
  socket <- connect url
  draft <- liftEffect $ channel ""
  lines <- liftEffect $ channel ([] :: Array Line)
  count <- liftEffect $ channel 0
  let
    add text mine = do
      index <- read count.signal
      count.put (index + 1)
      lines.modify (_ <> [ { index, text, mine } ])
    submit = do
      text <- read draft.signal
      when (text /= "") do
        socket.send text
        add text true
        draft.put ""
  subscribe socket.message case _ of
    Just m -> add m.data false
    Nothing -> pure unit
  pure $ E.div_ []
    [ E.p_ [ A.id_ "status" ] [ text (socket.state <#> status) ]
    , E.ul_ [ A.id_ "lines" ]
        [ each _.index lines.signal \line ->
            E.li_ [ A.class_ (line <#> \l -> if l.mine then "mine" else "theirs") ] [ text (_.text <$> line) ]
        ]
    , E.form_ [ H.onSubmit_ \e -> preventDefault e *> submit ]
        [ E.input_
            [ A.id_ "draft"
            , A.type_ InputText
            , A.value_ draft.signal
            , A.placeholder_ "Say something"
            , H.onInput_ \e -> case Input.fromEventTarget =<< target e of
                Just input -> draft.put =<< Input.value input
                Nothing -> pure unit
            ]
            []
        , E.button_ [ A.type_ InputSubmit, A.disabled_ (socket.state <#> (_ /= Open)) ] [ element "Send" ]
        ]
    ]
  where
  status = case _ of
    Connecting -> "Connecting to " <> url
    Open -> "Connected to " <> url
    Closing -> "Closing"
    Closed -> "Disconnected"
