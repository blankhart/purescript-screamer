module Test.Source (spec) where

import Prelude

import Effect.Class (liftEffect)
import Screamer.Signal (readT0)
import Screamer.Source (batch, focus, prop, signalSource)
import Screamer.Test (observe)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Type.Proxy (Proxy(..))

spec :: Spec Unit
spec = describe "Screamer.Source" do
  it "writes in a batch take effect in the next timestep, and readT1 shows them" do
    s <- liftEffect $ signalSource 1
    let
      n = focus { get: (_ * 10), set: \v _ -> v / 10 } s
    seen <- liftEffect $ batch do
      s.putT1 2
      s.modifyT1 (_ + 1)
      t0 <- readT0 s.signal
      t1 <- s.readT1
      n1 <- n.readT1
      pure [ t0, t1, n1 ]
    seen `shouldEqual` [ 1, 3, 30 ]
    liftEffect (readT0 s.signal) >>= shouldEqual 3

  it "focus reads through get and writes the whole through set" do
    whole <- liftEffect $ signalSource { n: 1, label: "a" }
    let
      n = focus { get: _.n, set: \v s -> s { n = v } } whole
    o <- liftEffect $ observe n.signal
    liftEffect $ n.putT1 5
    liftEffect $ n.modifyT1 (_ * 2)
    liftEffect $ whole.modifyT1 _ { n = 3 }
    liftEffect (readT0 whole.signal) >>= shouldEqual { n: 3, label: "a" }
    liftEffect o.trace >>= shouldEqual [ 1, 5, 10, 3 ]
    liftEffect o.stop

  it "prop round-trips one field, and composes" do
    whole <- liftEffect $ signalSource { user: { name: "Ada", age: 36 }, ok: false }
    let
      name = prop (Proxy :: _ "name") (prop (Proxy :: _ "user") whole)
      ok = prop (Proxy :: _ "ok") whole
    liftEffect $ name.putT1 "Grace"
    liftEffect $ ok.modifyT1 not
    liftEffect (readT0 whole.signal) >>= shouldEqual { user: { name: "Grace", age: 36 }, ok: true }
    liftEffect (readT0 name.signal) >>= shouldEqual "Grace"
