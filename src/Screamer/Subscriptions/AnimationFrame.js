// Foreign module of Screamer.Subscriptions.AnimationFrame.
export const nowImpl = () => performance.now();
/** Call `f` with each frame's timestamp until the returned action runs. */
export const loopImpl = (f) => () => {
    let id = 0;
    let stopped = false;
    const frame = (t) => {
        if (stopped)
            return;
        id = requestAnimationFrame(frame);
        f(t)();
    };
    id = requestAnimationFrame(frame);
    return () => {
        stopped = true;
        cancelAnimationFrame(id);
    };
};
