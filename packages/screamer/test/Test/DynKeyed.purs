module Test.DynKeyed (spec) where

import Prelude

import Data.Foldable (for_)
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer (dynKeyed)
import Screamer.Element (component, element_, mount, text, withEnter, withLeave)
import Screamer.Element.Unsafe (instantiateWith)
import Screamer.Owned (onCleanup)
import Screamer.Renderer (browserBackend)
import Screamer.Signal (readT0, subscribe)
import Screamer.Source (batch, signalSource)
import Screamer.Test.Dom (resetBody, textsOf)
import Test.Backend (guardDocument, hydrating, recordingBackend)
import Test.Hooks (leaks, noLeak, recordEnter)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

-- Captures the actual node as well as browser-owned editable state.
foreign import editInput :: Effect (Effect Boolean)

spec :: Spec Unit
spec = describe "dynKeyed" do
  it "retains input identity, focus, selection and local state while delivering live inputs" do
    liftEffect resetBody
    values <- liftEffect $ signalSource { key: "a", label: "one" }
    setups <- liftEffect $ Ref.new []
    cleanups <- liftEffect $ Ref.new []
    observed <- liftEffect $ Ref.new []
    let
      app = dynKeyed _.key values.signal \input -> component do
        initial <- liftEffect $ readT0 input
        liftEffect $ Ref.modify_ (_ <> [ initial ]) setups
        onCleanup $ Ref.modify_ (_ <> [ initial.key ]) cleanups
        subscribe input \value -> Ref.modify_ (_ <> [ { owner: initial.key, value } ]) observed
        pure $ element_ "section" []
          [ element_ "input" [] []
          , element_ "p" [] [ text (_.label <$> input) ]
          ]
    l <- leaks do
      stop <- liftEffect $ mount "#root" app
      unchanged <- liftEffect editInput
      liftEffect $ values.putT1 { key: "a", label: "two" }
      liftEffect (textsOf "#root p") >>= shouldEqual [ "two" ]
      liftEffect unchanged >>= shouldEqual true
      liftEffect (Ref.read setups) >>= shouldEqual [ { key: "a", label: "one" } ]
      liftEffect (Ref.read cleanups) >>= shouldEqual []
      -- Only the final write is delivered when the outermost batch returns.
      during <- liftEffect $ batch do
        values.putT1 { key: "a", label: "skipped" }
        batch $ values.putT1 { key: "a", label: "three" }
        textsOf "#root p"
      during `shouldEqual` [ "two" ]
      liftEffect (textsOf "#root p") >>= shouldEqual [ "three" ]
      liftEffect unchanged >>= shouldEqual true
      liftEffect $ values.putT1 { key: "b", label: "four" }
      liftEffect (Ref.read cleanups) >>= shouldEqual [ "a" ]
      liftEffect $ values.putT1 { key: "a", label: "five" }
      liftEffect (Ref.read setups) >>= shouldEqual
        [ { key: "a", label: "one" }, { key: "b", label: "four" }, { key: "a", label: "five" } ]
      liftEffect (Ref.read cleanups) >>= shouldEqual [ "a", "b" ]
      liftEffect (Ref.read observed) >>= shouldEqual
        [ { owner: "a", value: { key: "a", label: "one" } }
        , { owner: "a", value: { key: "a", label: "two" } }
        , { owner: "a", value: { key: "a", label: "three" } }
        , { owner: "b", value: { key: "b", label: "four" } }
        , { owner: "a", value: { key: "a", label: "five" } }
        ]
      liftEffect stop
      liftEffect (Ref.read cleanups) >>= shouldEqual [ "a", "b", "a" ]
      liftEffect $ values.putT1 { key: "c", label: "disposed" }
      liftEffect (Ref.read setups) >>= shouldEqual
        [ { key: "a", label: "one" }, { key: "b", label: "four" }, { key: "a", label: "five" } ]
    l `shouldEqual` noLeak

  it "constructs purely and keeps simultaneous and repeated mounts independent" do
    liftEffect resetBody
    values <- liftEffect $ signalSource 1
    setups <- liftEffect $ Ref.new 0
    cleanups <- liftEffect $ Ref.new 0
    let
      app = dynKeyed identity values.signal \input -> component do
        liftEffect $ Ref.modify_ (_ + 1) setups
        onCleanup $ Ref.modify_ (_ + 1) cleanups
        pure $ element_ "p" [] [ text (show <$> input) ]
    liftEffect (Ref.read setups) >>= shouldEqual 0
    l <- leaks do
      stop1 <- liftEffect $ mount "#root" app
      stop2 <- liftEffect $ mount "#root" app
      liftEffect (Ref.read setups) >>= shouldEqual 2
      liftEffect stop1
      liftEffect $ values.putT1 2
      liftEffect (textsOf "#root p") >>= shouldEqual [ "2" ]
      liftEffect (Ref.read setups) >>= shouldEqual 3
      liftEffect (Ref.read cleanups) >>= shouldEqual 2
      liftEffect stop2
      for_ [ 1, 2, 3 ] \_ -> do
        stop <- liftEffect $ mount "#root" app
        liftEffect stop
      liftEffect (Ref.read setups) >>= shouldEqual 6
      liftEffect (Ref.read cleanups) >>= shouldEqual 6
    l `shouldEqual` noLeak

  it "disposes outgoing resources immediately and cancels pending leave work on return or unmount" do
    liftEffect resetBody
    values <- liftEffect $ signalSource "a"
    disposed <- liftEffect $ Ref.new []
    leaving <- liftEffect $ Ref.new 0
    dones <- liftEffect $ Ref.new ([] :: Array (Effect Unit))
    let
      leave _ done = do
        onCleanup $ Ref.modify_ (_ + 1) leaving
        liftEffect $ Ref.modify_ (_ <> [ done ]) dones
      app = withLeave leave $ dynKeyed identity values.signal \input -> component do
        initial <- liftEffect $ readT0 input
        onCleanup $ Ref.modify_ (_ <> [ initial ]) disposed
        subscribe input \_ -> pure unit
        pure $ element_ "p" [] [ text input ]
    l <- leaks do
      stop <- liftEffect $ mount "#root" app
      liftEffect $ values.putT1 "b"
      liftEffect (Ref.read disposed) >>= shouldEqual [ "a" ]
      liftEffect (textsOf "#root p") >>= shouldEqual [ "a", "b" ]
      liftEffect $ values.putT1 "a"
      liftEffect (Ref.read disposed) >>= shouldEqual [ "a", "b" ]
      liftEffect (Ref.read leaving) >>= shouldEqual 1
      liftEffect (textsOf "#root p") >>= shouldEqual [ "b", "a" ]
      liftEffect stop
      liftEffect (Ref.read disposed) >>= shouldEqual [ "a", "b", "a" ]
      liftEffect (Ref.read leaving) >>= shouldEqual 2
      liftEffect $ Ref.read dones >>= \ds -> for_ ds identity
      liftEffect (textsOf "#root p") >>= shouldEqual []
    l `shouldEqual` noLeak

  it "uses a noninteractive renderer without global DOM operations or animation hooks" do
    rec <- liftEffect $ recordingBackend false
    values <- liftEffect $ signalSource { key: 1, label: "one" }
    entered <- liftEffect $ Ref.new []
    left <- liftEffect $ Ref.new 0
    let
      app = withEnter { appear: true } (recordEnter entered)
        $ withLeave (\_ _ -> liftEffect $ Ref.modify_ (_ + 1) left)
        $ dynKeyed _.key values.signal \input -> element_ "p" [] [ text (_.label <$> input) ]
    l <- leaks do
      r <- liftEffect $ guardDocument $ instantiateWith rec.backend identity app
      liftEffect $ rec.attach r.node
      liftEffect rec.html >>= shouldEqual "<!----><p>one</p><!---->"
      liftEffect $ guardDocument $ values.putT1 { key: 1, label: "two" }
      liftEffect rec.html >>= shouldEqual "<!----><p>two</p><!---->"
      liftEffect $ guardDocument $ values.putT1 { key: 2, label: "three" }
      liftEffect rec.html >>= shouldEqual "<!----><p>three</p><!---->"
      liftEffect (Ref.read entered) >>= shouldEqual []
      liftEffect (Ref.read left) >>= shouldEqual 0
      liftEffect $ guardDocument r.dispose
    l `shouldEqual` noLeak

  it "suppresses hydration enter hooks and enters only when identity subsequently changes" do
    liftEffect resetBody
    values <- liftEffect $ signalSource { key: 1, label: "one" }
    entered <- liftEffect $ Ref.new []
    l <- leaks do
      r <- liftEffect $ instantiateWith (hydrating browserBackend) identity
        $ withEnter { appear: true } (recordEnter entered)
        $ dynKeyed _.key values.signal \input -> element_ "p" [] [ text (_.label <$> input) ]
      liftEffect (Ref.read entered) >>= shouldEqual []
      liftEffect $ values.putT1 { key: 1, label: "two" }
      liftEffect (Ref.read entered) >>= shouldEqual []
      liftEffect $ values.putT1 { key: 2, label: "three" }
      liftEffect (Ref.read entered) >>= shouldEqual [ "three" ]
      liftEffect r.dispose
    l `shouldEqual` noLeak
