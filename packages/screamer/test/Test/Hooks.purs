module Test.Hooks (spec) where

import Prelude

import Data.Array as Array
import Data.Foldable (for_)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (Element, dyn, each, element, element_, mount, text, withEnter, withLeave, withMove)
import Screamer.Element.Unsafe (instantiateWith)
import Screamer.Owned (Owned, onCleanup)
import Screamer.Signal (Signal)
import Screamer.Renderer (browserBackend)
import Screamer.Runtime (readStats)
import Screamer.Source (signalSource)
import Screamer.Test.Dom (innerHTML, resetBody)
import Test.Backend (hydrating, recordingBackend, stubRects)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)
import Web.DOM.Node (Node, textContent)

type Leak = { effects :: Int, scopes :: Int, links :: Int }

leaks :: Aff Unit -> Aff Leak
leaks action = do
  before <- liftEffect readStats
  action
  after <- liftEffect readStats
  pure { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links }

noLeak :: Leak
noLeak = { effects: 0, scopes: 0, links: 0 }

li :: forall a. Show a => Signal a -> Element
li s = element_ "li" [] [ text (show <$> s) ]

-- | An enter hook that records the text of each node it is given.
recordEnter :: Ref.Ref (Array String) -> Node -> Owned Unit
recordEnter log node = liftEffect $ textContent node >>= \t -> Ref.modify_ (_ <> [ t ]) log

spec :: Spec Unit
spec = describe "enter, move and leave hooks" do
  describe "withLeave" do
    it "runs each hook in a leaving scope, disposed when done is called" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2, 3 ]
      dones <- liftEffect $ Ref.new ([] :: Array (Effect Unit))
      cleaned <- liftEffect $ Ref.new 0
      let
        hook _ done = do
          onCleanup (Ref.modify_ (_ + 1) cleaned)
          liftEffect $ Ref.modify_ (_ <> [ done ]) dones
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withLeave hook $ each identity items.signal li ]
        liftEffect $ items.putT1 [ 1, 3 ]
        liftEffect (Ref.read cleaned) >>= shouldEqual 0
        liftEffect $ Ref.read dones >>= \ds -> for_ ds identity
        liftEffect (Ref.read cleaned) >>= shouldEqual 1
        liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>1</li><li>3</li><!----></ul>"
        liftEffect unmount
      l `shouldEqual` noLeak

    it "disposes leaving scopes when the enclosing scope is disposed" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2 ]
      cleaned <- liftEffect $ Ref.new 0
      let hook _ _ = onCleanup (Ref.modify_ (_ + 1) cleaned)
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withLeave hook $ each identity items.signal li ]
        liftEffect $ items.putT1 []
        liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>1</li><li>2</li><!----></ul>"
        liftEffect unmount
        liftEffect (Ref.read cleaned) >>= shouldEqual 2
      l `shouldEqual` noLeak

    it "accepts done called while the hook is still running" do
      liftEffect resetBody
      tab <- liftEffect $ signalSource "a"
      cleaned <- liftEffect $ Ref.new 0
      let
        hook _ done = do
          liftEffect done
          onCleanup (Ref.modify_ (_ + 1) cleaned)
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ withLeave hook $ dyn (tab.signal <#> \t -> element_ "p" [] [ element t ])
        liftEffect $ tab.putT1 "b"
        liftEffect (innerHTML "#root") >>= shouldEqual "<!----><p>b</p><!---->"
        liftEffect (Ref.read cleaned) >>= shouldEqual 1
        liftEffect unmount
      l `shouldEqual` noLeak

    it "finishes a key's leaving nodes before each rebuilds that key" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2, 3 ]
      cleaned <- liftEffect $ Ref.new 0
      let hook _ _ = onCleanup (Ref.modify_ (_ + 1) cleaned)
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withLeave hook $ each identity items.signal li ]
        liftEffect $ items.putT1 [ 1, 3 ]
        liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>1</li><li>2</li><li>3</li><!----></ul>"
        liftEffect $ items.putT1 [ 1, 2, 3 ]
        liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>1</li><li>2</li><li>3</li><!----></ul>"
        liftEffect (Ref.read cleaned) >>= shouldEqual 1
        liftEffect unmount
      l `shouldEqual` noLeak

    it "finishes leaving rows with non-primitive keys too" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ [ 1 ], [ 2 ] ]
      let hook _ _ = pure unit
      unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withLeave hook $ each identity items.signal li ]
      liftEffect $ items.putT1 [ [ 1 ] ]
      liftEffect $ items.putT1 [ [ 1 ], [ 2 ] ]
      liftEffect (innerHTML "#root") >>= shouldEqual "<ul><!----><li>[1]</li><li>[2]</li><!----></ul>"
      liftEffect unmount

    it "does not run when the renderer is not interactive" do
      rec <- liftEffect $ recordingBackend false
      items <- liftEffect $ signalSource [ 1, 2 ]
      called <- liftEffect $ Ref.new 0
      let hook _ _ = liftEffect $ Ref.modify_ (_ + 1) called
      r <- liftEffect $ instantiateWith rec.backend identity $ element_ "ul" [] [ withLeave hook $ each identity items.signal li ]
      liftEffect $ rec.attach r.node
      liftEffect $ items.putT1 [ 1 ]
      liftEffect rec.html >>= shouldEqual "<ul><!----><li>1</li><!----></ul>"
      liftEffect (Ref.read called) >>= shouldEqual 0
      liftEffect r.dispose

  describe "withEnter" do
    it "runs on rows a change adds, after they are inserted, but not on the initial build" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2 ]
      entered <- liftEffect $ Ref.new []
      attached <- liftEffect $ Ref.new []
      let
        hook node = do
          recordEnter entered node
          -- The node is in the list by now.
          liftEffect $ innerHTML "#root" >>= \h -> Ref.modify_ (_ <> [ h ]) attached
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withEnter { appear: false } hook $ each identity items.signal li ]
        liftEffect (Ref.read entered) >>= shouldEqual []
        liftEffect $ items.putT1 [ 3, 1, 2, 4 ]
        liftEffect (Ref.read entered) >>= shouldEqual [ "3", "4" ]
        liftEffect (Ref.read attached) >>= shouldEqual (Array.replicate 2 "<ul><!----><li>3</li><li>1</li><li>2</li><li>4</li><!----></ul>")
        liftEffect unmount
      l `shouldEqual` noLeak

    it "runs on the initial build with appear" do
      liftEffect resetBody
      entered <- liftEffect $ Ref.new []
      unmount <- liftEffect $ mount "#root" $ withEnter { appear: true } (recordEnter entered) $
        each identity (pure [ 1, 2 ]) li
      liftEffect (Ref.read entered) >>= shouldEqual [ "1", "2" ]
      liftEffect unmount

    it "is local: a list built with a new branch does not enter its rows" do
      liftEffect resetBody
      shown <- liftEffect $ signalSource false
      entered <- liftEffect $ Ref.new []
      let list = element_ "ul" [] [ each identity (pure [ 1, 2 ]) li ]
      unmount <- liftEffect $ mount "#root" $ withEnter { appear: false } (recordEnter entered) $
        dyn (shown.signal <#> if _ then list else element "none")
      liftEffect $ shown.putT1 true
      liftEffect (Ref.read entered) >>= shouldEqual [ "12" ]
      liftEffect unmount

    it "is disposed with the row" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1 ]
      cleaned <- liftEffect $ Ref.new 0
      let hook _ = onCleanup (Ref.modify_ (_ + 1) cleaned)
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ withEnter { appear: false } hook $ each identity items.signal li
        liftEffect $ items.putT1 [ 1, 2 ]
        liftEffect $ items.putT1 [ 1 ]
        liftEffect (Ref.read cleaned) >>= shouldEqual 1
        liftEffect unmount
      l `shouldEqual` noLeak

    it "never runs when the initial build hydrates, even with appear" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1 ]
      entered <- liftEffect $ Ref.new []
      r <- liftEffect $ instantiateWith (hydrating browserBackend) identity
        $ withEnter { appear: true } (recordEnter entered)
        $ each identity items.signal li
      liftEffect (Ref.read entered) >>= shouldEqual []
      -- Later changes are not hydration.
      liftEffect $ items.putT1 [ 1, 2 ]
      liftEffect (Ref.read entered) >>= shouldEqual [ "2" ]
      liftEffect r.dispose

  describe "withMove" do
    it "gives each kept row that moved its rect before and after" do
      liftEffect resetBody
      restore <- liftEffect stubRects
      items <- liftEffect $ signalSource [ 1, 2, 3 ]
      moves <- liftEffect $ Ref.new []
      let
        hook m = liftEffect do
          t <- textContent m.node
          Ref.modify_ (_ <> [ { t, from: m.before.top, to: m.after.top } ]) moves
      l <- leaks do
        unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withMove hook $ each identity items.signal li ]
        liftEffect $ items.putT1 [ 3, 1, 2 ]
        liftEffect (Ref.read moves) >>= shouldEqual
          [ { t: "1", from: 0.0, to: 10.0 }, { t: "2", from: 10.0, to: 20.0 }, { t: "3", from: 20.0, to: 0.0 } ]
        -- A row displaced by a removal moves too; the removed row does not.
        liftEffect $ Ref.write [] moves
        liftEffect $ items.putT1 [ 1, 2 ]
        liftEffect (Ref.read moves) >>= shouldEqual
          [ { t: "1", from: 10.0, to: 0.0 }, { t: "2", from: 20.0, to: 10.0 } ]
        liftEffect unmount
      liftEffect restore
      l `shouldEqual` noLeak

    it "disposes a row's running move before measuring it again" do
      liftEffect resetBody
      restore <- liftEffect stubRects
      items <- liftEffect $ signalSource [ 1, 2 ]
      cleaned <- liftEffect $ Ref.new 0
      let hook _ = onCleanup (Ref.modify_ (_ + 1) cleaned)
      unmount <- liftEffect $ mount "#root" $ element_ "ul" [] [ withMove hook $ each identity items.signal li ]
      liftEffect $ items.putT1 [ 2, 1 ]
      liftEffect (Ref.read cleaned) >>= shouldEqual 0
      liftEffect $ items.putT1 [ 1, 2 ]
      liftEffect (Ref.read cleaned) >>= shouldEqual 2
      liftEffect unmount
      liftEffect (Ref.read cleaned) >>= shouldEqual 4
      liftEffect restore
