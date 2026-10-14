module Test.TypedDom (spec) where

import Prelude

import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.SignalSource (signalSource)
import Screamer.Core (element, mount)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.DOM.EventHandler as H
import Screamer.DOM.Svg as Svg
import Test.DomHelpers (click, innerHTML, propertyOf, resetBody)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Web.UIEvent.MouseEvent as MouseEvent

spec :: Spec Unit
spec = describe "Screamer.DOM" do
  it "value_ sets the value property" do
    liftEffect resetBody
    v <- liftEffect $ signalSource "hello"
    _ <- liftEffect $ mount "#root" $ E.input_ [ A.value_ v.signal, A.type_ A.InputText ] []
    liftEffect (propertyOf "#root input" "value") >>= shouldEqual "hello"
    liftEffect $ v.put "world"
    liftEffect (propertyOf "#root input" "value") >>= shouldEqual "world"
    liftEffect (innerHTML "#root") >>= shouldEqual """<input type="text">"""

  it "aria-label sets an attribute" do
    liftEffect resetBody
    _ <- liftEffect $ mount "#root" $ E.button_ [ A.ariaLabel_ "Close", A.attr_ "data-x" "1" ] []
    liftEffect (innerHTML "#root") >>= shouldEqual """<button aria-label="Close" data-x="1"></button>"""

  it "disabled_ toggles a boolean attribute" do
    liftEffect resetBody
    off <- liftEffect $ signalSource true
    _ <- liftEffect $ mount "#root" $ E.button_ [ A.disabled_ off.signal ] []
    liftEffect (innerHTML "#root") >>= shouldEqual """<button disabled=""></button>"""
    liftEffect $ off.put false
    liftEffect (innerHTML "#root") >>= shouldEqual """<button></button>"""

  it "accept-charset and http-equiv keep their hyphens" do
    liftEffect resetBody
    _ <- liftEffect $ mount "#root" $ E.div_ []
      [ E.form_ [ A.accept_charset_ "utf-8" ] [], E.meta_ [ A.http_equiv_ "refresh" ] [] ]
    liftEffect (innerHTML "#root") >>= shouldEqual
      """<div><form accept-charset="utf-8"></form><meta http-equiv="refresh"></div>"""

  it "prints numeric and enumerated values" do
    liftEffect resetBody
    _ <- liftEffect $ mount "#root" $ E.textarea_ [ A.rows_ 3, A.wrap_ A.WrapHard, A.dir_ A.DirRtl ] []
    liftEffect (innerHTML "#root") >>= shouldEqual """<textarea rows="3" wrap="hard" dir="rtl"></textarea>"""

  it "style_ sets CSS properties from a record" do
    liftEffect resetBody
    colour <- liftEffect $ signalSource "red"
    _ <- liftEffect $ mount "#root" $ E.div_ [ A.style_ { color: colour.signal, "margin-top": "2px" } ] []
    liftEffect (innerHTML "#root") >>= shouldEqual """<div style="color: red; margin-top: 2px;"></div>"""
    liftEffect $ colour.put "blue"
    liftEffect (innerHTML "#root") >>= shouldEqual """<div style="color: blue; margin-top: 2px;"></div>"""

  it "creates SVG elements in the SVG namespace" do
    liftEffect resetBody
    _ <- liftEffect $ mount "#root" $ Svg.svg_ [ Svg.viewBox_ "0 0 10 10" ]
      [ Svg.clipPathEl_ [ A.id_ "c" ] [], Svg.circle_ [ Svg.r_ "4", Svg.clipPath_ "url(#c)" ] [] ]
    liftEffect (innerHTML "#root") >>= shouldEqual
      """<svg viewBox="0 0 10 10"><clipPath id="c"></clipPath><circle r="4" clip-path="url(#c)"></circle></svg>"""

  it "passes a MouseEvent to a click handler" do
    liftEffect resetBody
    seen <- liftEffect $ Ref.new 0
    _ <- liftEffect $ mount "#root" $ E.button_ [ H.onClick_ \e -> Ref.write (MouseEvent.clientX e) seen ] [ element "go" ]
    liftEffect $ click "#root button"
    liftEffect (Ref.read seen) >>= shouldEqual 12
