// Foreign module of Screamer.Subscriptions.Timer. Each function returns
// the action that cancels the timer.
export const setIntervalImpl = (ms) => (action) => () => {
    const id = setInterval(action, ms);
    return () => clearInterval(id);
};
export const setTimeoutImpl = (ms) => (action) => () => {
    const id = setTimeout(action, ms);
    return () => clearTimeout(id);
};
