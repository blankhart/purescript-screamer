module Test.Router (spec) where

import Prelude

import Effect.Class (liftEffect)
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
    liftEffect $ Router.redirect "/start"
    unmount <- liftEffect $ E.mount "#root" $ E.component do
      loc <- Router.location
      pure $ E.fragment_
        [ Router.link "/about?x=1#top" [] [ E.element "about" ]
        , E.element_ "p" [] [ text (loc <#> \l -> l.pathname <> l.search <> l.hash) ]
        ]
    let shown = innerHTML "#root p"
    liftEffect shown >>= shouldEqual "/start"
    liftEffect $ Router.navigate "/one"
    liftEffect shown >>= shouldEqual "/one"
    liftEffect $ click "#root a"
    liftEffect shown >>= shouldEqual "/about?x=1#top"
    liftEffect $ Router.redirect "/two"
    liftEffect shown >>= shouldEqual "/two"
    liftEffect unmount
