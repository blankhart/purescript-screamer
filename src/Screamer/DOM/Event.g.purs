-- | Event types
module Screamer.DOM.Event where

import Prelude

import Effect (Effect)
import Data.Maybe (Maybe)
import Data.Nullable as Nullable
import Screamer.Internal (property, eventEffect, eventCast)
import Web.Event.EventTarget (EventTarget)


foreign import data Animation :: Type

class IsAnimation :: Type -> Constraint
class IsAnimation a

animationName_ :: forall a. IsAnimation a => a -> String
animationName_ = property "animationName"

elapsedTime_ :: forall a. IsAnimation a => a -> Number
elapsedTime_ = property "elapsedTime"

instance isAnimationAnimation :: IsAnimation Animation

instance isEventAnimation :: IsEvent Animation

toAnimation :: forall a. a -> Maybe Animation
toAnimation = Nullable.toMaybe <<< eventCast "Animation"


foreign import data Clipboard :: Type

class IsClipboard :: Type -> Constraint
class IsClipboard a

instance isClipboardClipboard :: IsClipboard Clipboard

instance isEventClipboard :: IsEvent Clipboard

toClipboard :: forall a. a -> Maybe Clipboard
toClipboard = Nullable.toMaybe <<< eventCast "Clipboard"


foreign import data Composition :: Type

class IsComposition :: Type -> Constraint
class IsComposition a

instance isCompositionComposition :: IsComposition Composition

instance isUiComposition :: IsUi Composition

instance isEventComposition :: IsEvent Composition

toComposition :: forall a. a -> Maybe Composition
toComposition = Nullable.toMaybe <<< eventCast "Composition"


foreign import data Drag :: Type

class IsDrag :: Type -> Constraint
class IsDrag a

instance isDragDrag :: IsDrag Drag

instance isMouseDrag :: IsMouse Drag

instance isUiDrag :: IsUi Drag

instance isEventDrag :: IsEvent Drag

toDrag :: forall a. a -> Maybe Drag
toDrag = Nullable.toMaybe <<< eventCast "Drag"


foreign import data Event :: Type

class IsEvent :: Type -> Constraint
class IsEvent a

bubbles_ :: forall a. IsEvent a => a -> Boolean
bubbles_ = property "bubbles"

cancelable_ :: forall a. IsEvent a => a -> Boolean
cancelable_ = property "cancelable"

defaultPrevented_ :: forall a. IsEvent a => a -> Boolean
defaultPrevented_ = property "defaultPrevented"

timeStamp_ :: forall a. IsEvent a => a -> Number
timeStamp_ = property "timeStamp"

type_ :: forall a. IsEvent a => a -> String
type_ = property "type"

preventDefault_ :: forall a. IsEvent a => a -> Effect Unit
preventDefault_ = eventEffect "preventDefault"

stopImmediatePropagation_ :: forall a. IsEvent a => a -> Effect Unit
stopImmediatePropagation_ = eventEffect "stopImmediatePropagation"

stopPropagation_ :: forall a. IsEvent a => a -> Effect Unit
stopPropagation_ = eventEffect "stopPropagation"

instance isEventEvent :: IsEvent Event

toEvent :: forall a. a -> Maybe Event
toEvent = Nullable.toMaybe <<< eventCast "Event"


foreign import data Focus :: Type

class IsFocus :: Type -> Constraint
class IsFocus a

instance isFocusFocus :: IsFocus Focus

instance isUiFocus :: IsUi Focus

instance isEventFocus :: IsEvent Focus

toFocus :: forall a. a -> Maybe Focus
toFocus = Nullable.toMaybe <<< eventCast "Focus"


foreign import data Input :: Type

class IsInput :: Type -> Constraint
class IsInput a

data_ :: forall a. IsInput a => a -> String
data_ = property "data"

inputType_ :: forall a. IsInput a => a -> String
inputType_ = property "inputType"

isComposing_ :: forall a. IsInput a => a -> Boolean
isComposing_ = property "isComposing"

instance isInputInput :: IsInput Input

instance isUiInput :: IsUi Input

instance isEventInput :: IsEvent Input

toInput :: forall a. a -> Maybe Input
toInput = Nullable.toMaybe <<< eventCast "Input"


foreign import data Keyboard :: Type

class IsKeyboard :: Type -> Constraint
class IsKeyboard a

altKey_ :: forall a. IsKeyboard a => a -> Boolean
altKey_ = property "altKey"

charCode_ :: forall a. IsKeyboard a => a -> Number
charCode_ = property "charCode"

code_ :: forall a. IsKeyboard a => a -> String
code_ = property "code"

ctrlKey_ :: forall a. IsKeyboard a => a -> Boolean
ctrlKey_ = property "ctrlKey"

key_ :: forall a. IsKeyboard a => a -> String
key_ = property "key"

keyCode_ :: forall a. IsKeyboard a => a -> Number
keyCode_ = property "keyCode"

location_ :: forall a. IsKeyboard a => a -> Number
location_ = property "location"

metaKey_ :: forall a. IsKeyboard a => a -> Boolean
metaKey_ = property "metaKey"

repeat_ :: forall a. IsKeyboard a => a -> Boolean
repeat_ = property "repeat"

shiftKey_ :: forall a. IsKeyboard a => a -> Boolean
shiftKey_ = property "shiftKey"

instance isKeyboardKeyboard :: IsKeyboard Keyboard

instance isUiKeyboard :: IsUi Keyboard

instance isEventKeyboard :: IsEvent Keyboard

toKeyboard :: forall a. a -> Maybe Keyboard
toKeyboard = Nullable.toMaybe <<< eventCast "Keyboard"


foreign import data Mouse :: Type

class IsMouse :: Type -> Constraint
class IsMouse a

button_ :: forall a. IsMouse a => a -> Number
button_ = property "button"

buttons_ :: forall a. IsMouse a => a -> Number
buttons_ = property "buttons"

clientX_ :: forall a. IsMouse a => a -> Number
clientX_ = property "clientX"

clientY_ :: forall a. IsMouse a => a -> Number
clientY_ = property "clientY"

layerX_ :: forall a. IsMouse a => a -> Number
layerX_ = property "layerX"

layerY_ :: forall a. IsMouse a => a -> Number
layerY_ = property "layerY"

movementX_ :: forall a. IsMouse a => a -> Number
movementX_ = property "movementX"

movementY_ :: forall a. IsMouse a => a -> Number
movementY_ = property "movementY"

offsetX_ :: forall a. IsMouse a => a -> Number
offsetX_ = property "offsetX"

offsetY_ :: forall a. IsMouse a => a -> Number
offsetY_ = property "offsetY"

pageX_ :: forall a. IsMouse a => a -> Number
pageX_ = property "pageX"

pageY_ :: forall a. IsMouse a => a -> Number
pageY_ = property "pageY"

screenX_ :: forall a. IsMouse a => a -> Number
screenX_ = property "screenX"

screenY_ :: forall a. IsMouse a => a -> Number
screenY_ = property "screenY"

which_ :: forall a. IsMouse a => a -> Number
which_ = property "which"

x_ :: forall a. IsMouse a => a -> Number
x_ = property "x"

y_ :: forall a. IsMouse a => a -> Number
y_ = property "y"

instance isMouseMouse :: IsMouse Mouse

instance isUiMouse :: IsUi Mouse

instance isEventMouse :: IsEvent Mouse

toMouse :: forall a. a -> Maybe Mouse
toMouse = Nullable.toMaybe <<< eventCast "Mouse"


foreign import data Pointer :: Type

class IsPointer :: Type -> Constraint
class IsPointer a

height_ :: forall a. IsPointer a => a -> Number
height_ = property "height"

isPrimary_ :: forall a. IsPointer a => a -> Boolean
isPrimary_ = property "isPrimary"

pointerId_ :: forall a. IsPointer a => a -> Number
pointerId_ = property "pointerId"

pointerType_ :: forall a. IsPointer a => a -> String
pointerType_ = property "pointerType"

pressure_ :: forall a. IsPointer a => a -> Number
pressure_ = property "pressure"

tangentialPressure_ :: forall a. IsPointer a => a -> Number
tangentialPressure_ = property "tangentialPressure"

tiltX_ :: forall a. IsPointer a => a -> Number
tiltX_ = property "tiltX"

tiltY_ :: forall a. IsPointer a => a -> Number
tiltY_ = property "tiltY"

twist_ :: forall a. IsPointer a => a -> Number
twist_ = property "twist"

width_ :: forall a. IsPointer a => a -> Number
width_ = property "width"

instance isPointerPointer :: IsPointer Pointer

instance isMousePointer :: IsMouse Pointer

instance isUiPointer :: IsUi Pointer

instance isEventPointer :: IsEvent Pointer

toPointer :: forall a. a -> Maybe Pointer
toPointer = Nullable.toMaybe <<< eventCast "Pointer"


foreign import data Touch :: Type

class IsTouch :: Type -> Constraint
class IsTouch a

instance isTouchTouch :: IsTouch Touch

instance isUiTouch :: IsUi Touch

instance isEventTouch :: IsEvent Touch

toTouch :: forall a. a -> Maybe Touch
toTouch = Nullable.toMaybe <<< eventCast "Touch"


foreign import data Transition :: Type

class IsTransition :: Type -> Constraint
class IsTransition a

propertyName_ :: forall a. IsTransition a => a -> String
propertyName_ = property "propertyName"

pseudoElement_ :: forall a. IsTransition a => a -> String
pseudoElement_ = property "pseudoElement"

instance isTransitionTransition :: IsTransition Transition

instance isEventTransition :: IsEvent Transition

toTransition :: forall a. a -> Maybe Transition
toTransition = Nullable.toMaybe <<< eventCast "Transition"


foreign import data Ui :: Type

class IsUi :: Type -> Constraint
class IsUi a

detail_ :: forall a. IsUi a => a -> Number
detail_ = property "detail"

instance isUiUi :: IsUi Ui

instance isEventUi :: IsEvent Ui

toUi :: forall a. a -> Maybe Ui
toUi = Nullable.toMaybe <<< eventCast "Ui"


foreign import data Wheel :: Type

class IsWheel :: Type -> Constraint
class IsWheel a

deltaMode_ :: forall a. IsWheel a => a -> Number
deltaMode_ = property "deltaMode"

deltaX_ :: forall a. IsWheel a => a -> Number
deltaX_ = property "deltaX"

deltaY_ :: forall a. IsWheel a => a -> Number
deltaY_ = property "deltaY"

deltaZ_ :: forall a. IsWheel a => a -> Number
deltaZ_ = property "deltaZ"

instance isWheelWheel :: IsWheel Wheel

instance isMouseWheel :: IsMouse Wheel

instance isUiWheel :: IsUi Wheel

instance isEventWheel :: IsEvent Wheel

toWheel :: forall a. a -> Maybe Wheel
toWheel = Nullable.toMaybe <<< eventCast "Wheel"


-- TODO: Integrations with Web.*** library types
-- EventTarget should have a phantom type parameter preserving evidence about
-- the event that generated it so that it can safely be unwrapped in some cases.
-- For example, returning the value of the node on an InputEvent.

target :: forall a . IsEvent a => a -> EventTarget
target = property "target"

inputValue :: forall a. IsInput a => a -> String
inputValue = property "target" >>> property "value"
