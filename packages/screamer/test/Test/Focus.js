export const focus = selector => () => document.querySelector(selector).focus();
export const focused = selector => () => document.activeElement === document.querySelector(selector);
export const warnings = action => () => {
  const previous = console.warn;
  const messages = [];
  console.warn = message => messages.push(message);
  try { action(); return messages; } finally { console.warn = previous; }
};
