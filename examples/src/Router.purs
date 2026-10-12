-- | Client-side routing: the page shown follows the location signal, and
-- | links navigate through the History API without reloading.
module Screamer.Examples.Router where

import Prelude

import Data.Array as Array
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), stripPrefix)
import Effect (Effect)
import Screamer.Core (Element, component, dyn, element)
import Screamer.DOM.Attribute as A
import Screamer.DOM.Element as E
import Screamer.Examples.Harness as Harness
import Screamer.Subscriptions.Router (Location, link, location)

main :: Effect Unit
main = Harness.run "main" app

data Page = Home | About | Item String | NotFound String

derive instance Eq Page

route :: Location -> Page
route { pathname } = case pathname of
  "/" -> Home
  "/about" -> About
  _ -> case stripPrefix (Pattern "/items/") pathname of
    Just id | id /= "" -> Item id
    _ -> if pathname == "" then Home else NotFound pathname

app :: Element
app = component do
  loc <- location
  let page = route <$> loc
  pure $ E.div_ []
    [ E.nav_ []
        [ link "/" [ A.id_ "home" ] [ element "Home" ]
        , element " | "
        , link "/about" [ A.id_ "about" ] [ element "About" ]
        , element " | "
        , link "/items/42" [ A.id_ "item" ] [ element "Item 42" ]
        ]
    , E.main_ [ A.id_ "page" ] [ dyn (view <$> page) ]
    ]

view :: Page -> Element
view = case _ of
  Home -> E.h1_ [] [ element "Home" ]
  About -> E.div_ []
    [ E.h1_ [] [ element "About" ]
    , E.p_ [] [ element "Pages are chosen by a signal of the current location." ]
    ]
  Item id -> E.div_ []
    [ E.h1_ [] [ element ("Item " <> id) ]
    , E.ul_ [] (Array.range 1 3 <#> \n -> E.li_ [] [ element ("Detail " <> show n) ])
    ]
  NotFound path -> E.h1_ [] [ element ("Not found: " <> path) ]
