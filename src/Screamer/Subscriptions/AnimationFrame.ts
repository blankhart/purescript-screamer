// Foreign module of Screamer.Subscriptions.AnimationFrame.

export const nowImpl = (): number => performance.now();

/** Call `f` with each frame's timestamp until the returned action runs. */
export const loopImpl = (f: (t: number) => () => void) => () => {
  let id = 0;
  let stopped = false;
  const frame = (t: number) => {
    if (stopped) return;
    id = requestAnimationFrame(frame);
    f(t)();
  };
  id = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
};
