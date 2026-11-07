module Test.Devtools.Inspect (spec) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Effect (Effect)
import Effect.Class (class MonadEffect, liftEffect)
import Effect.Exception (message, try)
import Effect.Ref as Ref
import Screamer.Devtools (decodeRecording, defaultLogOptions, encodeRecording, exposeGlobal, leaks, nodesOf, recordingSize, replay, scopeOf, setConsistencyCheck, setTrackOrigins, startLog, startRecording)
import Screamer.Element (Element, component, element_, mount, named, text)
import Screamer.Owned (Owned)
import Screamer.Signal (dropRepeats)
import Screamer.Source (signalSource)
import Screamer.Test.Dom (innerHTML, resetBody)
import Test.Devtools.Dom (firstChild, globalSnapshotText, querySelector, setTextOf)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (fail, shouldEqual)
import Web.DOM.Node (Node)

foreign import sameNodes :: Array Node -> Array Node -> Boolean

-- | Fail with the text unless it contains the pattern.
shouldContain :: forall m. MonadEffect m => String -> String -> m Unit
shouldContain text pattern = liftEffect $ unless (contains (Pattern pattern) text) $ throwIt (show pattern <> " not in:\n" <> text)

foreign import throwIt :: String -> Effect Unit

-- | A counter whose source the component creates; `put` lets the test write
-- | to it, as an event handler would.
counter :: Ref.Ref (Int -> Effect Unit) -> Element
counter put = component do
  count <- liftEffect $ signalSource 0
  liftEffect $ Ref.write count.putT1 put
  pure (element_ "p" [] [ text (show <$> count.signal) ] :: Element)

spec :: Spec Unit
spec = describe "inspection" do
  describe "the page and the tree" do
    it "maps a node to the innermost scope that built it, and a path to its nodes" do
      liftEffect resetBody
      shown <- liftEffect $ signalSource 1
      unmount <- liftEffect $ mount "#root" $ named "App" $ element_ "div" []
        [ named "Title" (element_ "h1" [] [ text (pure "Hi") ])
        , element_ "span" [] [ text (show <$> shown.signal) ]
        ]
      h1 <- liftEffect $ querySelector "h1"
      hi <- liftEffect $ firstChild h1
      span <- liftEffect $ querySelector "span"
      liftEffect (scopeOf hi) >>= shouldEqual (Just "root/provide/named:App/named:Title")
      liftEffect (scopeOf span) >>= shouldEqual (Just "root/provide/named:App")
      nodes <- liftEffect $ nodesOf "root/provide/named:App/named:Title"
      sameNodes nodes [ h1 ] `shouldEqual` true
      liftEffect (nodesOf "root/nowhere") >>= (Array.length >>> shouldEqual 0)
      liftEffect unmount
      liftEffect (scopeOf span) >>= shouldEqual Nothing

  describe "why and whyNot" do
    it "explain an effect's last run, and an effect held by dropRepeats" do
      liftEffect resetBody
      n <- liftEffect $ signalSource 1
      log <- liftEffect $ startLog defaultLogOptions
      let
        tens :: Owned Element
        tens = do
          t <- dropRepeats ((_ / 10) <$> n.signal)
          pure (element_ "i" [] [ text (show <$> t) ])
      unmount <- liftEffect $ mount "#root" $ element_ "div" []
        [ element_ "b" [] [ text (show <$> n.signal) ], component tens ]
      liftEffect $ n.putT1 2
      why <- liftEffect $ log.why 0
      why.summary `shouldContain` "effect 0 in root/provide last ran in round 0 because derived signal 4 updated, which follows signal source 3 written by an event handler"
      whyNot <- liftEffect $ log.whyNot 1
      whyNot.summary `shouldContain` "effect 1 in root/provide has not run since it was created:\n  stateful signal (Signal.dropRepeatsBy) 5: upstream signal source 3 changed since, but this node did not update"
      liftEffect log.stop
      liftEffect unmount

  describe "creation sites" do
    it "name where a leaked scope was created" do
      liftEffect resetBody
      liftEffect $ setTrackOrigins true
      ref <- liftEffect $ Ref.new (pure unit)
      l <- liftEffect $ leaks (mount "#root" (text (pure "x")) >>= flip Ref.write ref)
      liftEffect $ setTrackOrigins false
      liftEffect $ join (Ref.read ref)
      case Array.head l.scopes of
        Just s -> liftEffect $ s.origin `shouldContain` "Screamer.Element"
        Nothing -> fail "expected a leak"

  describe "recordings" do
    it "replay the writes a program received into a fresh mount" do
      liftEffect resetBody
      put <- liftEffect $ Ref.new (\_ -> pure unit)
      recorder <- liftEffect startRecording
      unmount <- liftEffect $ mount "#root" (counter put)
      liftEffect $ Ref.read put >>= \p -> p 1 *> p 2
      recording <- liftEffect recorder.stop
      liftEffect unmount
      recordingSize recording `shouldEqual` { steps: 2, writes: 2, opaque: 0, external: 0 }
      case decodeRecording (encodeRecording recording) of
        Left e -> fail e
        Right again -> do
          liftEffect resetBody
          r <- liftEffect $ replay again (mount "#root" (counter put))
          { applied: r.applied, skipped: r.skipped } `shouldEqual` { applied: 2, skipped: 0 }
          liftEffect (innerHTML "#root") >>= shouldEqual "<p>2</p>"
          liftEffect r.value
      decodeRecording "{\"version\":0}" `shouldEqual'` Left "recording format 0, expected 1"

  describe "consistency check" do
    it "reports a text node changed behind Screamer's back" do
      liftEffect resetBody
      liftEffect $ setConsistencyCheck true
      a <- liftEffect $ signalSource 0
      b <- liftEffect $ signalSource 0
      unmount <- liftEffect $ mount "#root" $ element_ "div" []
        [ element_ "span" [] [ text (show <$> a.signal) ], element_ "b" [] [ text (show <$> b.signal) ] ]
      liftEffect $ b.putT1 1
      liftEffect $ setTextOf "span" "x"
      r <- liftEffect $ try (b.putT1 2)
      liftEffect $ setConsistencyCheck false
      case r of
        Left e -> liftEffect $ message e `shouldContain` "screamer SCR003: text node shows \"x\", but its signal is \"0\""
        Right _ -> fail "expected SCR003"
      liftEffect unmount

  describe "the page global" do
    it "gives scripts the snapshot" do
      liftEffect resetBody
      liftEffect exposeGlobal
      unmount <- liftEffect $ mount "#root" $ named "App" (text (pure "x"))
      t <- liftEffect globalSnapshotText
      liftEffect $ t `shouldContain` "named:App \"x\""
      liftEffect unmount
  where
  shouldEqual' :: Either String _ -> Either String _ -> _
  shouldEqual' x y = case x, y of
    Left e, Left f -> e `shouldEqual` f
    _, _ -> fail "expected a decoding error"
