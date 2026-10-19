// Foreign module of Screamer.Web.MediaQuery.
export const matchImpl = (query) => (changed) => () => {
    const mql = window.matchMedia(query);
    const listener = (e) => changed(e.matches)();
    mql.addEventListener('change', listener);
    return { now: mql.matches, stop: () => mql.removeEventListener('change', listener) };
};
