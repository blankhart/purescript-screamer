// Foreign module of Screamer.Web.Page.
export const visibleNow = () => document.visibilityState !== 'hidden';
export const onVisibilityChange = (changed) => () => {
    const listener = () => changed();
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
};
export const onlineNow = () => window.navigator.onLine;
export const onOnlineChange = (changed) => () => {
    const listener = () => changed();
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
    return () => {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
    };
};
