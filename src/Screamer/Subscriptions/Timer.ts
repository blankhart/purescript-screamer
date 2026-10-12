// Foreign module of Screamer.Subscriptions.Timer. Each function returns
// the action that cancels the timer.

export const setIntervalImpl = (ms: number) => (action: () => void) => () => {
  const id = setInterval(action, ms);
  return () => clearInterval(id);
};

export const setTimeoutImpl = (ms: number) => (action: () => void) => () => {
  const id = setTimeout(action, ms);
  return () => clearTimeout(id);
};
