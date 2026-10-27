module Test.Devtools.Main (main) where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (fromMaybe)
import Data.String (Pattern(..), contains)
import Data.String as String
import Effect.Class (liftEffect)
import Effect.Exception (message, try)
import Effect (Effect)
import Effect.Ref as Ref
import Screamer.Devtools (assertNoLeaks, countWork, defaultLogOptions, everything, expectEffectRuns, expectRounds, leaks, snapshotJson, snapshotText, startLog, withStrict)
import Screamer.Element (Element, component, dyn, each, element_, mount, named, text)
import Screamer.Owned (Owned)
import Screamer.Signal (Signal)
import Screamer.Source (signalSource)
import Screamer.Test (runSpec)
import Screamer.Test.Dom (resetBody)
import Test.Spec (describe, it)
import Test.Spec.Assertions (fail, shouldEqual)

li :: Signal Int -> Element
li s = element_ "li" [] [ text (show <$> s) ]

-- | A component whose setup writes `x` to a source.
writer :: forall a r. { putT1 :: a -> Effect Unit | r } -> a -> Element
writer src x = component (liftEffect (src.putT1 x) $> element_ "span" [] [] :: Owned Element)

main :: Effect Unit
main = runSpec do
  describe "snapshots" do
    it "show the scope tree with names, kinds and row keys" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2 ]
      shown <- liftEffect $ signalSource true
      unmount <- liftEffect $ mount "#root" $ named "App" $ element_ "div" []
        [ element_ "ul" [] [ each identity items.signal li ]
        , dyn (shown.signal <#> \b -> if b then named "Panel" (text (pure "on")) else text (pure "off"))
        ]
      t <- liftEffect snapshotText
      t `shouldEqual` String.joinWith "\n"
        [ "1 root, 7 scopes, 4 effects"
        , "root"
        , "  provide (provides Screamer.Renderer.RendererKey)"
        , "    named:App (2 effects)"
        , "      each[key=1] (1 effect)"
        , "      each[key=2] (1 effect)"
        , "      dyn"
        , "        named:Panel"
        ]
      j <- liftEffect snapshotJson
      unless (contains (Pattern "\"path\":\"root/provide/named:App/each[key=2]\"") j) $ fail j
      liftEffect unmount
      liftEffect snapshotText >>= shouldEqual "0 roots, 0 scopes, 0 effects"

  describe "leaks" do
    it "reports nothing when an action disposes what it mounts" do
      liftEffect resetBody
      l <- liftEffect $ leaks do
        unmount <- mount "#root" $ named "App" $ text (pure "hi")
        unmount
      l.summary `shouldEqual` "no leaks"

    it "reports the top of each subtree an action leaves alive" do
      liftEffect resetBody
      ref <- liftEffect $ Ref.new (pure unit)
      let app = named "App" $ dyn (pure (named "Inner" (text (pure "hi"))))
      l <- liftEffect $ leaks do
        unmount <- mount "#root" app
        Ref.write unmount ref
      (_.path <$> l.scopes) `shouldEqual` [ "root" ]
      (_.scopes <$> l.scopes) `shouldEqual` [ 4 ]
      liftEffect $ join (Ref.read ref)
      liftEffect $ assertNoLeaks (mount "#root" app >>= identity)
      r <- liftEffect $ try $ assertNoLeaks (mount "#root" app >>= Ref.write <@> ref)
      case r of
        Left e -> message e `shouldEqual` "screamer-devtools: 1 leaked scope\n  root (4 scopes, 0 effects)"
        Right _ -> fail "expected a leak"
      liftEffect $ join (Ref.read ref)

  describe "work budgets" do
    it "count rounds, writes and effect runs" do
      liftEffect resetBody
      n <- liftEffect $ signalSource 0
      unmount <- liftEffect $ mount "#root" $ text (show <$> n.signal)
      w <- liftEffect $ countWork (n.putT1 1)
      w `shouldEqual` { rounds: 1, effectRuns: 1, steps: 0, writes: 1, fires: 0, scopesCreated: 0, scopesDisposed: 0 }
      liftEffect $ expectRounds 1 (n.putT1 2)
      r <- liftEffect $ try $ expectEffectRuns { atMost: 0 } (n.putT1 3)
      case r of
        Left e -> message e `shouldEqual` "screamer-devtools: expected at most 0 effect runs, got 1 round, 1 effect run, 0 stateful steps, 1 write, 0 fires, 0 scopes created, 0 disposed"
        Right _ -> fail "expected the budget to fail"
      liftEffect unmount

    it "count the rounds a list's row updates take" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2 ]
      unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ each identity items.signal li ]
      w <- liftEffect $ countWork (items.putT1 [ 1, 2, 3 ])
      -- The list's effect writes each kept row's signal, which applies in a second round.
      { rounds: w.rounds, writes: w.writes, scopesCreated: w.scopesCreated } `shouldEqual` { rounds: 2, writes: 3, scopesCreated: 1 }
      liftEffect unmount

  describe "strict mode and the log" do
    it "logs a warning with its code and the writer's path, and strict mode throws it" do
      liftEffect resetBody
      src <- liftEffect $ signalSource 0
      log <- liftEffect $ startLog defaultLogOptions
      unmount <- liftEffect $ mount "#root" $ element_ "div" [] [ named "A" (writer src 1), named "B" (writer src 2) ]
      liftEffect log.stop
      out <- liftEffect $ log.read everything
      let lines = String.split (Pattern "\n") out
      unless (contains (Pattern "\"warnings\":1") (fromMaybe "" (Array.head lines))) $ fail out
      unless (contains (Pattern "\"code\":\"SCR002\"") out) $ fail out
      unless (contains (Pattern "\"by\":\"root/provide/named:B\"") out) $ fail out
      under <- liftEffect $ log.read { under: "root/provide/named:A" }
      when (contains (Pattern "named:B") under) $ fail under
      liftEffect unmount
      liftEffect resetBody
      src2 <- liftEffect $ signalSource 0
      r <- liftEffect $ try $ withStrict $ mount "#root" $ element_ "div" [] [ named "A" (writer src2 1), named "B" (writer src2 2) ]
      case r of
        Left e -> unless (contains (Pattern "screamer SCR002:") (message e)) $ fail (message e)
        Right _ -> fail "expected strict mode to throw"
