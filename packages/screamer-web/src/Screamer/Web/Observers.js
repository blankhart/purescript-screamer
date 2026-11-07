// Foreign module of Screamer.Web.Observers.
export const resizeImpl = (el) => (changed) => () => {
    const observer = new ResizeObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last !== undefined)
            changed({ width: last.contentRect.width, height: last.contentRect.height })();
    });
    observer.observe(el);
    return () => observer.disconnect();
};
export const intersectingImpl = (el) => (changed) => () => {
    const observer = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last !== undefined)
            changed(last.isIntersecting)();
    });
    observer.observe(el);
    return () => observer.disconnect();
};
