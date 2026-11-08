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
/** Run after document-level delegated handlers so Router.link wins even
 * when interception was installed before the renderer's dispatcher. */
export const interceptLinksImpl = (exclude) => (push) => () => {
    const listener = (event) => {
        if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
            return;
        const anchor = event.composedPath().find((node) => node instanceof window.HTMLAnchorElement && node.hasAttribute('href'));
        if (!anchor || anchor.hasAttribute('download'))
            return;
        const target = anchor.getAttribute('target') ?? document.querySelector('base[target]')?.getAttribute('target') ?? '';
        if (target !== '' && target.toLowerCase() !== '_self')
            return;
        const href = anchor.getAttribute('href');
        if (href.trimStart().startsWith('#'))
            return;
        let url;
        try {
            url = new URL(anchor.href, document.baseURI);
        }
        catch {
            return;
        }
        if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.origin !== window.location.origin)
            return;
        if (exclude.some(prefix => url.pathname.startsWith(prefix)))
            return;
        event.preventDefault();
        push(url.pathname + url.search + url.hash)();
    };
    window.addEventListener('click', listener);
    return () => window.removeEventListener('click', listener);
};
