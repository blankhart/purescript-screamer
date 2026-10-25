-- | The browser sources under a non-interactive root, in plain Node with
-- | no DOM: nothing may touch a browser global. `scripts/test-purs.mjs`
-- | runs this main without jsdom.
module Test.Web.Node (main) where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Screamer.Context (provide)
import Screamer.Owned (Owned, runOwned)
import Screamer.Pending (settled)
import Screamer.Renderer (rendererKey)
import Screamer.Runtime (readStats)
import Screamer.Signal (readT0)
import Screamer.Test (runSpec)
import Screamer.Web.MediaQuery as MediaQuery
import Screamer.Web.Observers as Observers
import Screamer.Web.Page as Page
import Screamer.Web.Storage as Storage
import Screamer.Web.WebSocket as WebSocket
import Test.Inert (inertBackend, noElement)
import Test.Spec (it)
import Test.Spec.Assertions (shouldEqual)

-- | Run the setup under a non-interactive root, read the value it gives,
-- | dispose, and check that nothing was left pending or alive.
onServer :: forall a. Owned (Effect a) -> Aff a
onServer setup = do
  before <- liftEffect readStats
  r <- liftEffect $ runOwned $ provide rendererKey inertBackend do
    get <- setup
    calm <- settled
    pure { get, calm }
  value <- liftEffect r.value.get
  liftEffect (readT0 r.value.calm) >>= shouldEqual true
  liftEffect r.dispose
  after <- liftEffect readStats
  { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }
    `shouldEqual` { effects: 0, scopes: 0, links: 0 }
  pure value

main :: Effect Unit
main = runSpec do
  it "Storage holds the default and drops writes" do
    v <- onServer do
      src <- Storage.localStorage "theme" "light"
      pure (src.putT1 "dark" *> readT0 src.signal)
    v `shouldEqual` "light"
    s <- onServer (readT0 <<< _.signal <$> Storage.sessionStorage "tab" "one")
    s `shouldEqual` "one"

  it "MediaQuery.matches is false" do
    v <- onServer (readT0 <$> MediaQuery.matches "(min-width: 600px)")
    v `shouldEqual` false

  it "Observers hold their initial values" do
    size <- onServer (readT0 <$> Observers.resize noElement)
    size `shouldEqual` { width: 0.0, height: 0.0 }
    seen <- onServer (readT0 <$> Observers.intersecting noElement)
    seen `shouldEqual` false

  it "Page.visible and Page.online are true" do
    v <- onServer (readT0 <$> Page.visible)
    v `shouldEqual` true
    o <- onServer (readT0 <$> Page.online)
    o `shouldEqual` true

  it "WebSocket.connect opens nothing, stays Connecting and drops sends" do
    st <- onServer do
      sock <- WebSocket.connect "ws://example.test/"
      pure (sock.send "hello" *> (show <$> readT0 sock.state))
    st `shouldEqual` "Connecting"
