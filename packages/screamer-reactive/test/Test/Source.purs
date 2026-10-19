module Test.Source (spec) where

import Prelude

import Effect.Class (liftEffect)
import Screamer.Signal (read)
import Screamer.Source (focus, prop, signalSource)
import Screamer.Test (observe)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Type.Proxy (Proxy(..))

spec :: Spec Unit
spec = describe "Screamer.Source" do
  it "focus reads through get and writes the whole through set" do
    whole <- liftEffect $ signalSource { n: 1, label: "a" }
    let
      n = focus { get: _.n, set: \v s -> s { n = v } } whole
    o <- liftEffect $ observe n.signal
    liftEffect $ n.put 5
    liftEffect $ n.modify (_ * 2)
    liftEffect $ whole.modify _ { n = 3 }
    liftEffect (read whole.signal) >>= shouldEqual { n: 3, label: "a" }
    liftEffect o.trace >>= shouldEqual [ 1, 5, 10, 3 ]
    liftEffect o.stop

  it "prop round-trips one field, and composes" do
    whole <- liftEffect $ signalSource { user: { name: "Ada", age: 36 }, ok: false }
    let
      name = prop (Proxy :: _ "name") (prop (Proxy :: _ "user") whole)
      ok = prop (Proxy :: _ "ok") whole
    liftEffect $ name.put "Grace"
    liftEffect $ ok.modify not
    liftEffect (read whole.signal) >>= shouldEqual { user: { name: "Grace", age: 36 }, ok: true }
    liftEffect (read name.signal) >>= shouldEqual "Grace"
