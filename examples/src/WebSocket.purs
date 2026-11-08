-- | A chat box over a WebSocket. The socket opens with the component and
-- | reconnects after abnormal closes, and closes when it is unmounted.
module Screamer.Examples.WebSocket where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe(..))
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, each, element, text)
import Screamer.Event as Event
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes (InputType(..))
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Signal (readT0)
import Screamer.Source (signalSource)
import Screamer.Web.WebSocket (ReconnectState(..), connectWith, defaultReconnectOptions)
import Web.Event.Event (preventDefault, target)
import Web.HTML.HTMLInputElement as Input

main :: Effect Unit
main = Harness.run "main" (chat "wss://echo.websocket.org")

type Line = { index :: Int, text :: String, mine :: Boolean }

chat :: String -> Element
chat url = component do
  socket <- connectWith defaultReconnectOptions url
  draft <- liftEffect $ signalSource ""
  lines <- liftEffect $ signalSource ([] :: Array Line)
  let
    -- One `modifyT1`, so that lines added in one timestep compose and get
    -- distinct indices.
    add text mine = lines.modifyT1 \ls -> ls <> [ { index: Array.length ls, text, mine } ]
    submit = do
      text <- readT0 draft.signal
      connected <- isConnected <$> readT0 socket.state
      when (connected && text /= "") do
        socket.send text
        add text true
        draft.putT1 ""
  Event.subscribe socket.messages \m -> add m false
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
                Just input -> draft.putT1 =<< Input.value input
                Nothing -> pure unit
            ]
            []
        , E.button_ [ A.type_ InputSubmit, A.disabled_ (not <<< isConnected <$> socket.state) ] [ element "Send" ]
        ]
    ]
  where
  isConnected :: ReconnectState -> Boolean
  isConnected = case _ of
    Connected -> true
    _ -> false

  status :: ReconnectState -> String
  status = case _ of
    ConnectingAttempt _ -> "Connecting to " <> url
    Connected -> "Connected to " <> url
    Reconnecting r -> "Retrying connection (attempt " <> show r.attempt <> ")"
    Disconnected info -> "Disconnected: " <> show info.code <> " " <> info.reason
    ConnectionFailed _ -> "Could not open the socket"
