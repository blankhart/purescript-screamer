export const dispatch = selector => type => () => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  document.querySelector(selector).dispatchEvent(event);
  return event.defaultPrevented;
};
