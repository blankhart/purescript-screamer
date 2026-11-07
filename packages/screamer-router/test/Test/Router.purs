module Test.Router (spec) where

import Prelude

import Effect.Class (liftEffect)
import Effect.Ref as Ref
import Screamer.Element (text)
import Screamer.Element as E
import Screamer.Router as Router
import Screamer.Test.Dom (click, innerHTML, resetBody)
import Test.Spec (Spec, describe, it)
import Test.Spec.Assertions (shouldEqual)

spec :: Spec Unit
spec = describe "Screamer.Router" do
  it "follows navigate, redirect, links and popstate" do
    liftEffect resetBody
    liftEffect $ Router.browserRouter.replace "/start"
    unmount <- liftEffect $ E.mount "#root" $ E.component do
      loc <- Router.location
      pure $ E.fragment_
        [ Router.link "/about?x=1#top" [] [ E.element "about" ]
        , E.element_ "p" [] [ text (loc <#> \l -> l.pathname <> l.search <> l.hash) ]
        ]
    let shown = innerHTML "#root p"
    liftEffect shown >>= shouldEqual "/start"
    liftEffect $ Router.browserRouter.push "/one"
    liftEffect shown >>= shouldEqual "/one"
    liftEffect $ click "#root a"
    liftEffect shown >>= shouldEqual "/about?x=1#top"
    liftEffect $ Router.browserRouter.replace "/two"
    liftEffect shown >>= shouldEqual "/two"
    liftEffect unmount

  it "reads a provided static router: fixed location, navigation goes to the sink" do
    liftEffect resetBody
    liftEffect $ Router.browserRouter.replace "/browser"
    sunk <- liftEffect $ Ref.new []
    let
      sink url = Ref.modify_ (_ <> [ url ]) sunk
      env = Router.staticRouter "https://example.test/items/7?sort=asc#top" sink
    unmount <- liftEffect $ E.mount "#root" $ E.Element $ Router.withRouter env $ E.instantiate $ E.component do
      loc <- Router.location
      Router.redirect "/login"
      pure $ E.fragment_
        [ Router.link "/about" [] [ E.element "about" ]
        , E.element_ "p" [] [ text (loc <#> \l -> l.pathname <> l.search <> l.hash) ]
        ]
    liftEffect (innerHTML "#root p") >>= shouldEqual "/items/7?sort=asc#top"
    liftEffect $ click "#root a"
    liftEffect (Ref.read sunk) >>= shouldEqual [ "/login", "/about" ]
    -- Nothing reached the browser's history.
    loc <- liftEffect Router.browserRouter.current
    loc.pathname `shouldEqual` "/browser"
    liftEffect (innerHTML "#root p") >>= shouldEqual "/items/7?sort=asc#top"
    liftEffect unmount

  it "parses relative URLs" do
    loc <- liftEffect (Router.staticRouter "/a/b?c=1" (\_ -> pure unit)).current
    loc `shouldEqual` { pathname: "/a/b", search: "?c=1", hash: "" }
