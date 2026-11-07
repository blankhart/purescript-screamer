// Foreign module of Screamer.Router. `pushState` and `replaceState`
// dispatch a `popstate` event after changing the history, so every location
// signal updates the same way as on back and forward. Globals are read only
// inside the calls.
export const currentLocation = () => {
    const { pathname, search, hash } = window.location;
    return { pathname, search, hash };
};
export const onPopState = (action) => () => {
    const listener = () => action();
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
};
const notify = () => window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
export const pushState = (url) => () => {
    history.pushState(null, '', url);
    notify();
};
export const replaceState = (url) => () => {
    history.replaceState(null, '', url);
    notify();
};
/** The location of a URL, resolved against a placeholder origin when relative. */
export const parseLocation = (url) => {
    const { pathname, search, hash } = new URL(url, 'http://localhost/');
    return { pathname, search, hash };
};
