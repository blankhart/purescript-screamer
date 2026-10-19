module Test.Dom (spec) where

import Prelude

import Data.Array as Array
import Data.Foldable (for_)
import Data.Maybe (Maybe(..))
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Class (liftEffect)
import Effect.Class as Owned
import Effect.Ref as Ref
import Screamer.Attribute (Attribute, attribute, booleanAttribute, on_, property, styleProperty)
import Screamer.Element (Element, component, dyn, each, element, element_, foreign_, fragment_, mount, text)
import Screamer.Owned (onCleanup)
import Screamer.Runtime (readStats)
import Screamer.Event as Event
import Screamer.Signal (Signal, read, subscribe)
import Screamer.Signal as Signal
import Screamer.Source (signalSource)
import Screamer.Test.Dom (click, fakeWidget, currentTag, innerHTML, liveListeners, mutationsDuring, resetBody, rowNodes, sameNode, textsOf)
import Test.QuickCheck.Gen (randomSample', shuffle, chooseInt, Gen)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (fail, shouldEqual)
import Web.Event.Event (stopPropagation)

div' :: Array Attribute -> Array Element -> Element
div' = element_ "div"

spec :: Spec Unit
spec = describe "Screamer.Element" do
  it "renders static markup" do
    liftEffect resetBody
    _ <- liftEffect $ mount "#root" $
      div' [ attribute "class" (pure "box"), attribute "aria-label" (pure "greeting") ]
        [ element "hello ", element 42, element_ "span" [] [ element "!" ] ]
    liftEffect (innerHTML "#root") >>= shouldEqual
      """<div class="box" aria-label="greeting">hello 42<span>!</span></div>"""

  it "renders signal-bound markup and keeps it up to date" do
    liftEffect resetBody
    name <- liftEffect $ signalSource "Ada"
    hidden <- liftEffect $ signalSource false
    colour <- liftEffect $ signalSource "red"
    _ <- liftEffect $ mount "#root" $
      div'
        [ booleanAttribute "hidden" hidden.signal
        , styleProperty "color" colour.signal
        , attribute "title" name.signal
        ]
        [ element "Hi ", text name.signal ]
    liftEffect (innerHTML "#root") >>= shouldEqual
      """<div style="color: red;" title="Ada">Hi Ada</div>"""
    liftEffect do
      name.put "Grace"
      hidden.put true
      colour.put "blue"
    liftEffect (innerHTML "#root") >>= shouldEqual
      """<div style="color: blue;" title="Grace" hidden="">Hi Grace</div>"""

  it "sets properties" do
    liftEffect resetBody
    v <- liftEffect $ signalSource "one"
    _ <- liftEffect $ mount "#root" $ element_ "input" [ property "value" v.signal ] []
    liftEffect $ v.put "two"
    -- A property, not an attribute: the markup has no value attribute.
    liftEffect (innerHTML "#root") >>= shouldEqual "<input>"

  it "updates exactly one DOM node when one signal source is written" do
    liftEffect resetBody
    chans <- liftEffect $ traverse signalSource [ "a", "b", "c" ]
    cls <- liftEffect $ signalSource "x"
    _ <- liftEffect $ mount "#root" $
      div' [ attribute "class" cls.signal ] (chans <#> \c -> element_ "p" [] [ text c.signal ])
    n <- liftEffect $ mutationsDuring "#root" do
      for_ (Array.index chans 1) \c -> c.put "B"
    n `shouldEqual` 1
    liftEffect (textsOf "#root p") >>= shouldEqual [ "a", "B", "c" ]

  it "leaves zero live effects and zero element listeners after unmount" do
    liftEffect resetBody
    before <- liftEffect readStats
    count <- liftEffect $ signalSource 0
    unmount <- liftEffect $ mount "#root" $
      div' [ on_ "click" \_ -> count.modify (_ + 1) ]
        [ text (show <$> count.signal)
        , dyn $ count.signal <#> \n -> element_ "span" [ on_ "mouseover" \_ -> pure unit, on_ "toggle" \_ -> pure unit ] [ element n ]
        , each identity (pure [ 1, 2, 3 ]) \s -> element_ "i" [ on_ "click" \_ -> pure unit, on_ "toggle" \_ -> pure unit ] [ text (show <$> s) ]
        ]
    liftEffect $ click "#root div"
    -- Bubbling events ("click", "mouseover") are delegated to one document
    -- listener per type, installed once; others ("toggle") get a listener
    -- per element, removed with it.
    listenersMounted <- liftEffect liveListeners
    liftEffect unmount
    after <- liftEffect readStats
    listenersAfter <- liftEffect liveListeners
    { effects: after.liveEffects - before.liveEffects, scopes: after.liveScopes - before.liveScopes, links: after.links - before.links, listeners: listenersMounted - listenersAfter }
      `shouldEqual` { effects: 0, scopes: 0, links: 0, listeners: 4 }
    liftEffect (innerHTML "#root") >>= shouldEqual ""

  it "delegated handlers see currentTarget, honour stopPropagation and stop after disposal" do
    liftEffect resetBody
    log <- liftEffect $ signalSource []
    shown <- liftEffect $ signalSource true
    let record x = log.modify (_ <> [ x ])
    _ <- liftEffect $ mount "#root" $
      element_ "section" [ on_ "click" \_ -> record "section" ]
        [ div' [ on_ "click" \e -> record ("div " <> currentTag e) ]
            [ dyn $ shown.signal <#> if _ then element_ "b" [ on_ "click" \_ -> record "b" ] [] else text (pure "") ]
        , element_ "u" [ on_ "click" \e -> record "u" *> stopPropagation e ] []
        ]
    liftEffect $ click "#root b"
    liftEffect $ click "#root u"
    liftEffect (read log.signal) >>= shouldEqual [ "b", "div DIV", "section", "u" ]
    liftEffect $ log.put []
    liftEffect $ shown.put false
    liftEffect (read log.signal) >>= shouldEqual []

  it "dyn disposes its previous branch's effects" do
    liftEffect resetBody
    tab <- liftEffect $ signalSource "a"
    src <- liftEffect $ signalSource 0
    let
      branch t = component do
        let clicks = Event.fold (\_ n -> n + 1) 0 (Event.changes src.signal)
        subscribe clicks \_ -> pure unit
        pure $ element_ "p" [] [ element t, text (show <$> clicks) ]
    _ <- liftEffect $ mount "#root" $ div' [] [ dyn (branch <$> tab.signal) ]
    first <- liftEffect readStats
    liftEffect do
      src.put 1
      tab.put "b"
      tab.put "c"
      src.put 2
    later <- liftEffect readStats
    (later.liveEffects - first.liveEffects) `shouldEqual` 0
    (later.liveScopes - first.liveScopes) `shouldEqual` 0
    liftEffect (innerHTML "#root") >>= shouldEqual "<div><!----><p>c1</p><!----></div>"

  describe "each" do
    it "keeps node identity for kept keys" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ 1, 2, 3, 4, 5 ]
      _ <- liftEffect $ mount "#root" $ element_ "ul" []
        [ each identity items.signal \s -> element_ "li" [ attribute "data-key" (show <$> s) ] [ text (show <$> s) ] ]
      let
        step xs = do
          before <- liftEffect $ rowNodes "#root li"
          liftEffect $ items.put xs
          after <- liftEffect $ rowNodes "#root li"
          map _.key after `shouldEqual` map show xs
          for_ after \a -> for_ (Array.find (\b -> b.key == a.key) before) \b ->
            unless (sameNode a.node b.node) $ fail ("node for key " <> a.key <> " was replaced")
      step [ 1, 2, 3, 6, 4, 5 ]
      step [ 1, 3, 6, 4, 5 ]
      step [ 1, 4, 6, 3, 5 ]
      step [ 5, 3, 6, 4, 1 ]
      step []
      step [ 7, 8 ]
      step [ 7, 8, 9, 10 ]
      step [ 0, 7, 8, 9, 10 ]
      step [ 0, 8, 10 ]
      step [ 8, 10 ]
      perms <- liftEffect $ randomSample' 100 genList
      for_ perms step

    it "updates kept rows' signals in place" do
      liftEffect resetBody
      items <- liftEffect $ signalSource [ { id: 1, label: "one" }, { id: 2, label: "two" } ]
      _ <- liftEffect $ mount "#root" $ element_ "ul" []
        [ each _.id items.signal \s -> element_ "li" [ attribute "data-key" (show <<< _.id <$> s) ] [ text (_.label <$> s) ] ]
      before <- liftEffect $ rowNodes "#root li"
      liftEffect $ items.put [ { id: 2, label: "TWO" }, { id: 1, label: "one" } ]
      liftEffect (textsOf "#root li") >>= shouldEqual [ "TWO", "one" ]
      after <- liftEffect $ rowNodes "#root li"
      case Array.index before 1, Array.index after 0 of
        Just b, Just a -> unless (sameNode a.node b.node) $ fail "row 2 was replaced"
        _, _ -> fail "missing rows"

  it "runs a component's setup once per instance" do
    liftEffect resetBody
    setups <- liftEffect $ Ref.new 0
    cleanups <- liftEffect $ Ref.new 0
    shared <- liftEffect $ signalSource 0
    let
      counter = component do
        liftEffect' (Ref.modify_ (_ + 1) setups)
        onCleanup (Ref.modify_ (_ + 1) cleanups)
        pure $ element_ "b" [] [ text (show <$> shared.signal) ]
    u1 <- liftEffect $ mount "#root" counter
    _ <- liftEffect $ mount "#root" counter
    liftEffect (Ref.read setups) >>= shouldEqual 2
    liftEffect u1
    liftEffect (Ref.read cleanups) >>= shouldEqual 1
    liftEffect $ shared.put 7
    liftEffect (innerHTML "#root") >>= shouldEqual "<b>7</b>"

  it "foreign_ runs its setup once per instance and cleans up on dyn switch and unmount" do
    liftEffect resetBody
    log <- liftEffect $ Ref.new []
    tab <- liftEffect $ signalSource "a"
    cls <- liftEffect $ signalSource "x"
    let
      widget t = foreign_
        ( \host -> do
            liftEffect' (Ref.modify_ (_ <> [ "setup " <> t ]) log)
            destroy <- liftEffect' (fakeWidget host t)
            onCleanup (destroy *> Ref.modify_ (_ <> [ "cleanup " <> t ]) log)
        )
        "section"
        [ attribute "class" cls.signal ]
    unmount <- liftEffect $ mount "#root" $ div' [] [ dyn (widget <$> tab.signal) ]
    liftEffect (innerHTML "#root") >>= shouldEqual """<div><!----><section class="x"><i>widget a</i></section><!----></div>"""
    -- Attribute updates leave the widget's own children alone.
    liftEffect $ cls.put "y"
    liftEffect (innerHTML "#root") >>= shouldEqual """<div><!----><section class="y"><i>widget a</i></section><!----></div>"""
    liftEffect $ tab.put "b"
    liftEffect (innerHTML "#root") >>= shouldEqual """<div><!----><section class="y"><i>widget b</i></section><!----></div>"""
    liftEffect unmount
    liftEffect (Ref.read log) >>= shouldEqual [ "setup a", "cleanup a", "setup b", "cleanup b" ]

  it "runs a counter-and-list app" do
    liftEffect resetBody
    unmount <- liftEffect $ mount "#root" app
    liftEffect (textsOf "#count") >>= shouldEqual [ "0" ]
    liftEffect $ click "#inc"
    liftEffect $ click "#inc"
    liftEffect $ click "#add"
    liftEffect (textsOf "#count") >>= shouldEqual [ "2" ]
    liftEffect (textsOf "#items li") >>= shouldEqual [ "item 2" ]
    liftEffect $ click "#inc"
    liftEffect $ click "#add"
    liftEffect (textsOf "#items li") >>= shouldEqual [ "item 2", "item 3" ]
    liftEffect $ click "#items li"
    liftEffect (textsOf "#items li") >>= shouldEqual [ "item 3" ]
    liftEffect unmount
    liftEffect (innerHTML "#root") >>= shouldEqual ""
  where
  liftEffect' = Owned.liftEffect

genList :: Gen (Array Int)
genList = do
  n <- chooseInt 0 12
  xs <- shuffle (Array.range 1 12)
  pure (Array.take n xs)

app :: Element
app = component do
  count <- liftEffect $ signalSource 0
  items <- liftEffect $ signalSource ([] :: Array Int)
  let
    remove n = items.modify (Array.filter (_ /= n))
  pure $ div' []
    [ element_ "button" [ attribute "id" (pure "inc"), on_ "click" \_ -> count.modify (_ + 1) ] [ element "+" ]
    , element_ "span" [ attribute "id" (pure "count") ] [ text (show <$> count.signal) ]
    , element_ "button"
        [ attribute "id" (pure "add")
        , on_ "click" \_ -> do
            n <- read' count.signal
            items.modify (_ <> [ n ])
        ]
        [ element "add" ]
    , element_ "ul" [ attribute "id" (pure "items") ]
        [ each identity items.signal \s ->
            element_ "li" [ on_ "click" \_ -> read' s >>= remove ] [ text (("item " <> _) <<< show <$> s) ]
        ]
    , fragment_ []
    ]
  where
  read' :: forall a. Signal a -> Effect a
  read' = Signal.read
