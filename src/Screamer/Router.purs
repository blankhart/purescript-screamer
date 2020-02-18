-- Possibly keep out of the core via extensible subscriptions

module Screamer.Router where

foreign import onClick :: Event -> Effect Unit

data Mode = Hash | History

type Link a = a -> Array H.Property -> Array H.VirtualNode -> H.VirtualNode

prefixed :: Mode -> String -> String
prefixed mode url = case mode of
  Hash -> "#" <> url
  History -> url

link :: Mode -> Link String
link mode url props children =
  let props' = [H.on "click" onClick, H.property "href" $ prefixed mode url] <> props
  in H.element "a" props' children

foreign import push_ :: String -> Effect Unit
foreign import replace_ :: String -> Effect Unit

push :: Mode -> String -> Effect Unit
push mode url = push_ $ prefixed mode url

replace :: Mode -> String -> Effect Unit
replace mode url = replace_ $ prefixed mode url

foreign import data Token :: Type

foreign import addListener :: { mode :: String, handler :: (String -> Effect Unit) } -> Effect Token
foreign import removeListener :: Token -> Effect Unit

type Spec action = {
  handler :: Url -> action,
  mode :: Mode
}

subscription :: forall action. H.SubscriptionSpec (Spec action) Token action
subscription = { initialize, update, destroy }
  where
    initialize {props: {mode, handler}, send} = do
      let
        mode' = case mode of
          Hash -> "hash"
          History -> "history"
      token <- addListener { mode: mode', handler: send <<< handler <<< parse }
      pure token
    update {state} = pure state
    destroy {state: token} = removeListener token

subscribe :: forall action. Mode -> (Url -> action) -> H.Subscription action
subscribe mode handler = H.subscribe subscription { mode, handler }
