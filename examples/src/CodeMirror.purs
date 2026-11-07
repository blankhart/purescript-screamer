-- | Embedding a JS widget that owns its DOM subtree: CodeMirror 6 wrapped
-- | as an `Element` with `foreign_`. The editor is created when the element
-- | is instantiated and destroyed with its scope; `doc` and `readOnly` flow
-- | in with `subscribe`, and edits flow out through `onChange` in `batch`.
module Screamer.Examples.CodeMirror where

import Prelude

import Data.String as String
import Effect (Effect)
import Effect.Class (liftEffect)
import Screamer.Element (Element, component, element, foreign_, text)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes as A
import Screamer.Html.Handlers as H
import Screamer.Owned (onCleanup)
import Screamer.Signal (readT0, Signal, subscribe)
import Screamer.Source (batch, signalSource)
import Web.DOM.Element as DOM

main :: Effect Unit
main = Harness.run "main" $ E.div_ []
  [ page "editor-1" "-- First editor\nmain = log \"hello\"\n"
  , page "editor-2" "Second editor, independent of the first.\n"
  ]

type Editor =
  { setText :: String -> Effect Unit
  , setReadOnly :: Boolean -> Effect Unit
  , destroy :: Effect Unit
  }

foreign import createImpl :: DOM.Element -> String -> (String -> Effect Unit) -> Effect Editor

-- | A CodeMirror editor. `doc` is the external value: the editor is
-- | replaced only when it differs from the editor's text, so typing does
-- | not loop or move the caret. `onChange` sees the user's edits only.
codeMirror
  :: { doc :: Signal String
     , onChange :: String -> Effect Unit
     , readOnly :: Signal Boolean
     }
  -> Element
codeMirror cfg = foreign_ setup "div" [ A.class_ "editor" ]
  where
  setup host = do
    initial <- liftEffect $ readT0 cfg.doc
    editor <- liftEffect $ createImpl host initial (batch <<< cfg.onChange)
    onCleanup editor.destroy
    subscribe cfg.doc editor.setText
    subscribe cfg.readOnly editor.setReadOnly

page :: String -> String -> Element
page id initial = component do
  doc <- liftEffect $ signalSource initial
  readOnly <- liftEffect $ signalSource false
  pure $ E.section_ [ A.id_ id ]
    [ codeMirror { doc: doc.signal, onChange: doc.putT1, readOnly: readOnly.signal }
    , E.p_ []
        [ E.span_ [ A.class_ "count" ] [ text (doc.signal <#> \d -> show (String.length d) <> " characters") ]
        , element " "
        , E.button_ [ A.class_ "reset", H.onClick_ \_ -> doc.putT1 initial ] [ element "Reset" ]
        , element " "
        , E.button_ [ A.class_ "read-only", H.onClick_ \_ -> readOnly.modifyT1 not ]
            [ text (readOnly.signal <#> if _ then "Make editable" else "Make read-only") ]
        ]
    , E.pre_ [ A.class_ "preview" ] [ text doc.signal ]
    ]
