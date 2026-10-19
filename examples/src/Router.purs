-- | Client-side routing with windrose-router: the routes are a type, from
-- | which windrose derives both the matcher and the links, so a link can
-- | never point at a route that does not parse. The page shown follows the
-- | location signal, and links navigate through the History API without
-- | reloading.
module Screamer.Examples.Router where

import Prelude

import Data.Array as Array
import Data.Either (Either, either)
import Data.Maybe (fromMaybe)
import Data.String (Pattern(..), stripPrefix)
import Effect (Effect)
import Screamer.Element (Element, component, dyn, element)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes as A
import Screamer.Signal (Signal)
import Screamer.Subscriptions.Router (Location, link, location)
import Windrose.Router (type (:<|>), type (:>), C, P, RouteProxy(..), RoutingError, V, allLinks, mkRoutable, route)

main :: Effect Unit
main = Harness.run "main" app

type Api =
  V "home"
    :<|> (P "about" :> V "about")
    :<|> (P "items" :> C "id" Int :> V "item")

data Page = Home | About | Item Int | NotFound String

derive instance Eq Page

-- | One link per endpoint, typed by its captures: `links.item 42`.
links :: { home :: String, about :: String, item :: Int -> String }
links = allLinks (mkRoutable (RouteProxy :: _ Api))

-- | The router, built once here: `route` builds it when given the handlers.
router :: String -> Either RoutingError Page
router = route (mkRoutable (RouteProxy :: _ Api)) { home: Home, about: About, item: Item }

-- | Routes live in the hash, so the page itself (and its `?example=` query)
-- | never changes and a reload always finds it.
toPage :: Location -> Page
toPage { hash } = either (const (NotFound path)) identity (router path)
  where
  path = fromMaybe hash (stripPrefix (Pattern "#") hash)

-- | Where a page lives. Every route's link comes from `links`.
href :: Page -> String
href = case _ of
  Home -> links.home
  About -> links.about
  Item id -> links.item id
  NotFound path -> path

-- | A link to a page, marked as current while that page is shown.
navLink :: Signal Page -> String -> Page -> String -> Element
navLink current id target label =
  link ("#" <> href target)
    [ A.id_ id, A.class_ (current <#> \p -> if p == target then "current" else "") ]
    [ element label ]

app :: Element
app = component do
  loc <- location
  let page = toPage <$> loc
  pure $ E.div_ [ A.class_ "router" ]
    [ E.nav_ []
        [ navLink page "home" Home "Home"
        , navLink page "about" About "About"
        , navLink page "item" (Item 42) "Item 42"
        , navLink page "item-7" (Item 7) "Item 7"
        , navLink page "broken" (NotFound "/items/forty-two") "A broken link"
        ]
    , E.article_ [ A.id_ "page" ] [ dyn (view <$> page) ]
    ]

view :: Page -> Element
view = case _ of
  Home -> E.div_ []
    [ E.h1_ [] [ element "Home" ]
    , E.p_ [] [ element "Pick a page above. Back and forward work, and so does reloading." ]
    ]
  About -> E.div_ []
    [ E.h1_ [] [ element "About" ]
    , E.p_ [] [ element "Pages are chosen by a signal of the current location, matched against a typelevel API." ]
    ]
  Item id -> E.div_ []
    [ E.h1_ [] [ element ("Item " <> show id) ]
    , E.ul_ [] (Array.range 1 3 <#> \n -> E.li_ [] [ element ("Detail " <> show n) ])
    ]
  NotFound path -> E.div_ []
    [ E.h1_ [] [ element "Not found" ]
    , E.p_ [] [ element ("No route matches " <> path <> ": an item id must be an integer.") ]
    ]
