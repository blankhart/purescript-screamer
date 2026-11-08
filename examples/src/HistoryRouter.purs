-- | History-mode routing with typed query parameters. Open the dedicated
-- | /history-router/ example shell; navigation, back/forward, and reloads
-- | keep real paths. The server must serve this shell for application paths.
module Screamer.Examples.HistoryRouter where

import Prelude

import Data.Either (Either, either)
import Effect (Effect)
import Screamer.Element (Element, component, dyn, element)
import Screamer.Examples.Harness as Harness
import Screamer.Html as E
import Screamer.Html.Attributes as A
import Screamer.Router (interceptLinks, link, location)
import Screamer.Router.Windrose (matchPath)
import Screamer.Signal (dropRepeats)
import Windrose.Router (type (:<|>), type (:>), P, Q, RouteProxy(..), RoutingError, V, allLinks, mkRoutable, route)

type Api = P "history-router" :>
  ( V "home"
      :<|> (P "login" :> Q (return :: String) :> V "login")
  )

data Page = Home | Login String | NotFound String

derive instance Eq Page

links :: { home :: String, login :: { return :: String } -> String }
links = allLinks (mkRoutable (RouteProxy :: _ Api))

routes :: String -> Either RoutingError Page
routes = route (mkRoutable (RouteProxy :: _ Api)) { home: Home, login: Login <<< _.return }

main :: Effect Unit
main = Harness.run "main" app

app :: Element
app = component do
  interceptLinks { exclude: [ "/auth/", "/api/" ] }
  -- The default context is browserRouter; no explicit provider is needed.
  loc <- location
  page <- dropRepeats (either NotFound identity <<< matchPath routes <$> loc)
  pure $ E.div_ []
    [ E.nav_ []
        [ link links.home [ A.id_ "home" ] [ element "Home" ]
        , E.a_ [ A.href_ links.home, A.id_ "plain-home" ] [ element "Plain anchor home" ]
        , link (links.login { return: "/history-router/" }) [ A.id_ "login" ] [ element "Sign in" ]
        , link "/history-router/missing" [ A.id_ "broken" ] [ element "Unknown route" ]
        ]
    , E.article_ [ A.id_ "page" ] [ dyn (view <$> page) ]
    ]

view :: Page -> Element
view = case _ of
  Home -> E.h1_ [] [ element "Home" ]
  Login target -> E.div_ []
    [ E.h1_ [] [ element "Sign in" ]
    , E.p_ [ A.id_ "return" ] [ element target ]
    ]
  NotFound path -> E.div_ []
    [ E.h1_ [] [ element "Not found" ]
    , E.p_ [] [ element ("No route matches " <> path) ]
    ]
