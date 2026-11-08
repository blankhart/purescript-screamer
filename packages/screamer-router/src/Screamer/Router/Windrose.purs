-- | Matching `Screamer.Router` locations with
-- | [windrose-router](https://github.com/blankhart/purescript-windrose-router),
-- | whose routes are a type: windrose derives both the matcher and the
-- | links from it, so a link can never point at a route that does not
-- | parse.
-- |
-- | ```purescript
-- | type Api = V "home"
-- | router = route (mkRoutable (RouteProxy :: _ Api)) { home: Home }
-- | page = either NotFound identity <<< matchHash router <$> loc
-- | ```
-- |
-- | Windrose 0.2.0 uses handler and link records even for a single endpoint.
-- | Pass encoded locations directly: Windrose decodes captures and query
-- | values after splitting the URL. Failed matches retain the encoded input.
module Screamer.Router.Windrose
  ( matchHash
  , matchPath
  ) where

import Data.Either (Either(..))
import Data.Semigroup ((<>))
import Data.Maybe (fromMaybe)
import Data.String (Pattern(..), stripPrefix)
import Screamer.Router (Location)
import Windrose.Router (RoutingError)

-- | Route the location's hash, without its `#`. For routes kept in the
-- | hash, so the page itself never changes and a reload always finds it.
-- | `Left` is the path no route matches.
matchHash :: forall a. (String -> Either RoutingError a) -> Location -> Either String a
matchHash router { hash } = match router (fromMaybe hash (stripPrefix (Pattern "#") hash))

-- | Route the location's path and query string (including Windrose `Q`
-- | routes). The hash is excluded. `Left` contains the unmatched path and query.
matchPath :: forall a. (String -> Either RoutingError a) -> Location -> Either String a
matchPath router { pathname, search } = match router (pathname <> search)

match :: forall a. (String -> Either RoutingError a) -> String -> Either String a
match router path = case router path of
  Right a -> Right a
  Left _ -> Left path
