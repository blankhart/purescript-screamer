-- | Asynchronous values that follow a signal.
module Screamer.Resource
  ( Remote(..)
  , resource
  ) where

import Prelude

import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Effect.Aff (Aff, attempt, error, killFiber, launchAff, launchAff_)
import Effect.Class (liftEffect)
import Effect.Exception (Error, message)
import Effect.Ref as Ref
import Screamer.Channel (channel)
import Screamer.Owned (Owned, onCleanup, subscribe)
import Screamer.Signal (Signal)

data Remote b = Loading | Failed Error | Loaded b

instance Eq b => Eq (Remote b) where
  eq Loading Loading = true
  eq (Failed a) (Failed b) = message a == message b
  eq (Loaded a) (Loaded b) = a == b
  eq _ _ = false

instance Show b => Show (Remote b) where
  show = case _ of
    Loading -> "Loading"
    Failed e -> "(Failed " <> show (message e) <> ")"
    Loaded b -> "(Loaded " <> show b <> ")"

instance Functor Remote where
  map f = case _ of
    Loading -> Loading
    Failed e -> Failed e
    Loaded b -> Loaded (f b)

-- | Run the request for the input's current value, and again whenever the
-- | input changes. The signal is `Loading` while a request runs. A request
-- | still running when the input changes, or when the scope is disposed, is
-- | killed, and its result is never shown.
resource :: forall a b. Signal a -> (a -> Aff b) -> Owned (Signal (Remote b))
resource input request = do
  result <- liftEffect $ channel Loading
  running <- liftEffect $ Ref.new Nothing
  generation <- liftEffect $ Ref.new 0
  let
    cancel = do
      -- Any result still to arrive is stale from here on.
      _ <- Ref.modify (_ + 1) generation
      Ref.read running >>= case _ of
        Just fiber -> do
          Ref.write Nothing running
          launchAff_ (killFiber (error "resource cancelled") fiber)
        Nothing -> pure unit
    start a = do
      cancel
      g <- Ref.read generation
      result.put Loading
      done <- Ref.new false
      let
        settle outcome = do
          Ref.write true done
          current <- Ref.read generation
          when (current == g) do
            Ref.write Nothing running
            result.put case outcome of
              Left e -> Failed e
              Right b -> Loaded b
      fiber <- launchAff do
        outcome <- attempt (request a)
        liftEffect (settle outcome)
      -- A request that settled synchronously has nothing left to kill.
      settled <- Ref.read done
      unless settled $ Ref.write (Just fiber) running
  subscribe input start
  onCleanup cancel
  pure result.signal
