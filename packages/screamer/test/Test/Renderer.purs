module Test.Renderer (spec) where

import Prelude

import Data.Array as Array
import Effect.Class (liftEffect)
import Effect.Class as Owned
import Effect.Ref as Ref
import Screamer.Attribute (attribute, booleanAttribute, on_, property, styleProperty)
import Screamer.Context (class ContextKey, ask, provide)
import Screamer.Element (component, dyn, each, element, element_, foreignWithFallback_, foreign_, fragment_, svgElement_, text)
import Screamer.Element.Unsafe (instantiateWith)
import Screamer.Renderer (interactive)
import Screamer.Runtime (readStats)
import Screamer.Source (signalSource)
import Screamer.Test.Dom (fakeWidget)
import Test.Backend (guardDocument, recordingBackend)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Type.Proxy (Proxy(..))

data Greeting

instance ContextKey Greeting String where
  keyName _ = "Test.Renderer.Greeting"
  keyDefault _ = "hello"

spec :: Spec Unit
spec = describe "Screamer.Renderer" do
  it "routes every node operation through the backend" do
    rec <- liftEffect $ recordingBackend true
    before <- liftEffect readStats
    on <- liftEffect $ signalSource true
    label <- liftEffect $ signalSource "a"
    items <- liftEffect $ signalSource [ 1, 2, 3 ]
    clicks <- liftEffect $ Ref.new 0
    let
      app = element_ "div" [ attribute "id" (pure "app"), on_ "click" \_ -> Ref.modify_ (_ + 1) clicks ]
        [ text label.signal
        , element_ "input" [ property "value" label.signal, booleanAttribute "disabled" on.signal, styleProperty "color" (pure "red") ] []
        , dyn (on.signal <#> if _ then element "on" else element_ "b" [] [])
        , element_ "ul" [] [ each identity items.signal \s -> element_ "li" [] [ text (show <$> s) ] ]
        , each identity items.signal \_ -> fragment_ []
        , svgElement_ "svg" [] []
        ]
    r <- liftEffect $ guardDocument do
      r <- instantiateWith rec.backend identity app
      rec.attach r.node
      label.put "b"
      on.put false
      items.put [ 3, 1 ]
      items.put []
      rec.click "#app"
      pure r
    liftEffect rec.html >>= shouldEqual
      """<div id="app">b<input style="color: red;"><!----><b></b><!----><ul><!----><!----></ul><!----><!----><svg></svg></div>"""
    liftEffect (Ref.read clicks) >>= shouldEqual 1
    liftEffect (guardDocument r.dispose)
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }
    liftEffect rec.ops >>= shouldEqual
      [ "appendChild", "clearChildren", "createAnchor", "createComment", "createElement", "createElementNS"
      , "createFragment", "createText", "enter", "firstChild", "insertBefore", "lastChild", "leave", "listen"
      , "nextSibling", "nodeType", "parentNode", "removeAttribute", "removeChild", "setAttribute", "setProperty"
      , "setStyle", "setText"
      ]

  it "attaches no listener and runs no widget setup when the backend is not interactive" do
    rec <- liftEffect $ recordingBackend false
    log <- liftEffect $ Ref.new []
    let
      widget = foreignWithFallback_
        (\host -> Owned.liftEffect (Ref.modify_ (_ <> [ "setup" ]) log) *> void (Owned.liftEffect (fakeWidget host "w")))
        "section"
        [ attribute "class" (pure "map") ]
        [ element_ "p" [] [ element "Loading the map" ] ]
      app = component do
        live <- interactive
        pure $ element_ "div" [ attribute "id" (pure "app"), on_ "click" \_ -> Ref.modify_ (_ <> [ "click" ]) log ]
          [ widget
          , foreign_ (\_ -> Owned.liftEffect (Ref.modify_ (_ <> [ "bare" ]) log)) "aside" []
          , element (show live)
          ]
    r <- liftEffect $ instantiateWith rec.backend identity app
    liftEffect $ rec.attach r.node
    liftEffect $ rec.click "#app"
    liftEffect rec.html >>= shouldEqual
      """<div id="app"><section class="map"><p>Loading the map</p></section><aside></aside>false</div>"""
    liftEffect (Ref.read log) >>= shouldEqual []
    ops <- liftEffect rec.ops
    Array.elem "listen" ops `shouldEqual` false
    liftEffect r.dispose

  it "runs the widget, without its fallback, when interactive" do
    rec <- liftEffect $ recordingBackend true
    log <- liftEffect $ Ref.new []
    let
      widget = foreignWithFallback_
        (\host -> do
            Owned.liftEffect (Ref.modify_ (_ <> [ "setup" ]) log)
            void (Owned.liftEffect (fakeWidget host "w")))
        "section"
        []
        [ element "fallback" ]
    r <- liftEffect $ instantiateWith rec.backend identity widget
    liftEffect $ rec.attach r.node
    liftEffect rec.html >>= shouldEqual """<section><i>widget w</i></section>"""
    liftEffect (Ref.read log) >>= shouldEqual [ "setup" ]
    liftEffect r.dispose

  it "instantiateWith runs the element inside the setup wrapper" do
    rec <- liftEffect $ recordingBackend true
    let
      k = Proxy :: Proxy Greeting
      greet = component do
        g <- ask k
        pure (element_ "p" [] [ element g ])
    r <- liftEffect $ instantiateWith rec.backend (provide k "bonjour") greet
    liftEffect $ rec.attach r.node
    liftEffect rec.html >>= shouldEqual "<p>bonjour</p>"
    liftEffect r.dispose
