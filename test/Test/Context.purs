module Test.Context (spec) where

import Prelude

import Effect.Class (liftEffect)
import Screamer.Context (ask, key, provide, uniqueId)
import Screamer.Element (Element(..), component, dyn, each, element_, instantiate, mount, text)
import Screamer.Owned (child, runOwned)
import Screamer.Runtime (readStats)
import Screamer.Source (signalSource)
import Test.DomHelpers (innerHTML, resetBody)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Screamer.Context" do
  it "ask returns the default when nothing is provided" do
    let k = key "theme" "light"
    r <- liftEffect $ runOwned (ask k)
    r.value `shouldEqual` "light"
    liftEffect r.dispose

  it "provide shadows the default in nested scopes, and only inside its body" do
    let k = key "theme" "light"
    before <- liftEffect readStats
    r <- liftEffect $ runOwned do
      outer <- ask k
      inner <- provide k "dark" do
        a <- ask k
        b <- child (ask k)
        c <- provide k "contrast" (ask k)
        d <- ask k
        pure [ a, b.value, c, d ]
      after <- ask k
      pure ([ outer ] <> inner <> [ after ])
    r.value `shouldEqual` [ "light", "dark", "dark", "contrast", "dark", "light" ]
    liftEffect r.dispose
    after <- liftEffect readStats
    (after.liveScopes - before.liveScopes) `shouldEqual` 0

  it "keys with the same name are different keys" do
    let
      k1 = key "x" 1
      k2 = key "x" 2
    r <- liftEffect $ runOwned $ provide k1 10 do
      a <- ask k1
      b <- ask k2
      pure [ a, b ]
    r.value `shouldEqual` [ 10, 2 ]
    liftEffect r.dispose

  it "reaches dyn branches and each rows, including ones created later" do
    liftEffect resetBody
    let
      k = key "theme" "light"
      themed label = component do
        v <- ask k
        pure (element_ "i" [] [ text (pure (label <> ":" <> v)) ])
    tab <- liftEffect $ signalSource "a"
    items <- liftEffect $ signalSource [ "x" ]
    before <- liftEffect readStats
    unmount <- liftEffect $ mount "#root" $ Element $ provide k "dark" $ instantiate $
      element_ "div" []
        [ dyn (themed <$> tab.signal)
        , each identity items.signal \_ -> themed "row"
        , themed "plain"
        ]
    liftEffect (innerHTML "#root") >>= shouldEqual
      "<div><!----><i>a:dark</i><!----><!----><i>row:dark</i><!----><i>plain:dark</i></div>"
    liftEffect $ tab.put "b"
    liftEffect $ items.put [ "x", "y" ]
    liftEffect (innerHTML "#root") >>= shouldEqual
      "<div><!----><i>b:dark</i><!----><!----><i>row:dark</i><i>row:dark</i><!----><i>plain:dark</i></div>"
    liftEffect unmount
    after <- liftEffect readStats
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
      `shouldEqual` { effects: 0, scopes: 0, links: 0 }

  describe "uniqueId" do
    it "counts in instantiation order within a root, across child and provided scopes" do
      let
        k = key "k" unit
        ids = do
          a <- uniqueId
          b <- child uniqueId
          c <- provide k unit uniqueId
          d <- uniqueId
          pure [ a, b.value, c, d ]
      r1 <- liftEffect $ runOwned ids
      r2 <- liftEffect $ runOwned ids
      r1.value `shouldEqual` [ "s0", "s1", "s2", "s3" ]
      r2.value `shouldEqual` r1.value
      liftEffect (r1.dispose *> r2.dispose)

    it "gives the same ids to two instantiations of the same element" do
      liftEffect resetBody
      let
        labelled = component do
          a <- uniqueId
          b <- uniqueId
          pure (element_ "label" [] [ text (pure (a <> " " <> b)) ])
        el = element_ "div" [] [ labelled, labelled ]
      r1 <- liftEffect $ runOwned (instantiate el)
      r2 <- liftEffect $ runOwned (instantiate el)
      unmount <- liftEffect $ mount "#root" (element_ "section" [] [ Element (pure r1.value), Element (pure r2.value) ])
      liftEffect (innerHTML "#root") >>= shouldEqual
        "<section><div><label>s0 s1</label><label>s2 s3</label></div><div><label>s0 s1</label><label>s2 s3</label></div></section>"
      liftEffect (unmount *> r1.dispose *> r2.dispose)
