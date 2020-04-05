module Screamer.DOM.EventHandler where

import Prelude

import Effect (Effect)
import Unsafe.Coerce (unsafeCoerce)
import Screamer.Core (Attribute, on_)
import Screamer.DOM.Event as Event



onAnimationEnd_ :: (Event.Animation -> Effect Unit) -> Attribute
onAnimationEnd_ = on_ "animationend" <<< unsafeCoerce


onAnimationIteration_ :: (Event.Animation -> Effect Unit) -> Attribute
onAnimationIteration_ = on_ "animationiteration" <<< unsafeCoerce


onAnimationStart_ :: (Event.Animation -> Effect Unit) -> Attribute
onAnimationStart_ = on_ "animationstart" <<< unsafeCoerce




onCopy_ :: (Event.Clipboard -> Effect Unit) -> Attribute
onCopy_ = on_ "copy" <<< unsafeCoerce


onCut_ :: (Event.Clipboard -> Effect Unit) -> Attribute
onCut_ = on_ "cut" <<< unsafeCoerce


onPaste_ :: (Event.Clipboard -> Effect Unit) -> Attribute
onPaste_ = on_ "paste" <<< unsafeCoerce




onCompositionEnd_ :: (Event.Composition -> Effect Unit) -> Attribute
onCompositionEnd_ = on_ "compositionend" <<< unsafeCoerce


onCompositionStart_ :: (Event.Composition -> Effect Unit) -> Attribute
onCompositionStart_ = on_ "compositionstart" <<< unsafeCoerce


onCompositionUpdate_ :: (Event.Composition -> Effect Unit) -> Attribute
onCompositionUpdate_ = on_ "compositionupdate" <<< unsafeCoerce




onDrag_ :: (Event.Drag -> Effect Unit) -> Attribute
onDrag_ = on_ "drag" <<< unsafeCoerce


onDragEnd_ :: (Event.Drag -> Effect Unit) -> Attribute
onDragEnd_ = on_ "dragend" <<< unsafeCoerce


onDragEnter_ :: (Event.Drag -> Effect Unit) -> Attribute
onDragEnter_ = on_ "dragenter" <<< unsafeCoerce


onDragExit_ :: (Event.Drag -> Effect Unit) -> Attribute
onDragExit_ = on_ "dragexit" <<< unsafeCoerce


onDragLeave_ :: (Event.Drag -> Effect Unit) -> Attribute
onDragLeave_ = on_ "dragleave" <<< unsafeCoerce


onDragOver_ :: (Event.Drag -> Effect Unit) -> Attribute
onDragOver_ = on_ "dragover" <<< unsafeCoerce


onDrop_ :: (Event.Drag -> Effect Unit) -> Attribute
onDrop_ = on_ "drop" <<< unsafeCoerce




onChange_ :: (Event.Event -> Effect Unit) -> Attribute
onChange_ = on_ "change" <<< unsafeCoerce


onReset_ :: (Event.Event -> Effect Unit) -> Attribute
onReset_ = on_ "reset" <<< unsafeCoerce


onSelect_ :: (Event.Event -> Effect Unit) -> Attribute
onSelect_ = on_ "select" <<< unsafeCoerce


onSubmit_ :: (Event.Event -> Effect Unit) -> Attribute
onSubmit_ = on_ "submit" <<< unsafeCoerce




onBlur_ :: (Event.Focus -> Effect Unit) -> Attribute
onBlur_ = on_ "blur" <<< unsafeCoerce


onFocus_ :: (Event.Focus -> Effect Unit) -> Attribute
onFocus_ = on_ "focus" <<< unsafeCoerce


onFocusIn_ :: (Event.Focus -> Effect Unit) -> Attribute
onFocusIn_ = on_ "focusin" <<< unsafeCoerce


onFocusOut_ :: (Event.Focus -> Effect Unit) -> Attribute
onFocusOut_ = on_ "focusout" <<< unsafeCoerce




onInput_ :: (Event.Input -> Effect Unit) -> Attribute
onInput_ = on_ "input" <<< unsafeCoerce




onKeyDown_ :: (Event.Keyboard -> Effect Unit) -> Attribute
onKeyDown_ = on_ "keydown" <<< unsafeCoerce


onKeyPress_ :: (Event.Keyboard -> Effect Unit) -> Attribute
onKeyPress_ = on_ "keypress" <<< unsafeCoerce


onKeyUp_ :: (Event.Keyboard -> Effect Unit) -> Attribute
onKeyUp_ = on_ "keyup" <<< unsafeCoerce




onClick_ :: (Event.Mouse -> Effect Unit) -> Attribute
onClick_ = on_ "click" <<< unsafeCoerce


onContextMenu_ :: (Event.Mouse -> Effect Unit) -> Attribute
onContextMenu_ = on_ "contextmenu" <<< unsafeCoerce


onDblClick_ :: (Event.Mouse -> Effect Unit) -> Attribute
onDblClick_ = on_ "dblclick" <<< unsafeCoerce


onMouseDown_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseDown_ = on_ "mousedown" <<< unsafeCoerce


onMouseEnter_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseEnter_ = on_ "mouseenter" <<< unsafeCoerce


onMouseLeave_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseLeave_ = on_ "mouseleave" <<< unsafeCoerce


onMouseMove_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseMove_ = on_ "mousemove" <<< unsafeCoerce


onMouseOut_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseOut_ = on_ "mouseout" <<< unsafeCoerce


onMouseOver_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseOver_ = on_ "mouseover" <<< unsafeCoerce


onMouseUp_ :: (Event.Mouse -> Effect Unit) -> Attribute
onMouseUp_ = on_ "mouseup" <<< unsafeCoerce






onTouchCancel_ :: (Event.Touch -> Effect Unit) -> Attribute
onTouchCancel_ = on_ "touchcancel" <<< unsafeCoerce


onTouchEnd_ :: (Event.Touch -> Effect Unit) -> Attribute
onTouchEnd_ = on_ "touchend" <<< unsafeCoerce


onTouchMove_ :: (Event.Touch -> Effect Unit) -> Attribute
onTouchMove_ = on_ "touchmove" <<< unsafeCoerce


onTouchStart_ :: (Event.Touch -> Effect Unit) -> Attribute
onTouchStart_ = on_ "touchstart" <<< unsafeCoerce




onTransitionStart_ :: (Event.Transition -> Effect Unit) -> Attribute
onTransitionStart_ = on_ "transitionstart" <<< unsafeCoerce


onTransitionCancel_ :: (Event.Transition -> Effect Unit) -> Attribute
onTransitionCancel_ = on_ "transitioncancel" <<< unsafeCoerce


onTransitionEnd_ :: (Event.Transition -> Effect Unit) -> Attribute
onTransitionEnd_ = on_ "transitionend" <<< unsafeCoerce


onTransitionRun_ :: (Event.Transition -> Effect Unit) -> Attribute
onTransitionRun_ = on_ "transitionrun" <<< unsafeCoerce




onScroll_ :: (Event.Ui -> Effect Unit) -> Attribute
onScroll_ = on_ "scroll" <<< unsafeCoerce




onWheel_ :: (Event.Wheel -> Effect Unit) -> Attribute
onWheel_ = on_ "wheel" <<< unsafeCoerce


