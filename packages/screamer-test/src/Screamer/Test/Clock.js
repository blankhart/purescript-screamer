// Foreign module of Screamer.Test.Clock: fake global timers and animation
// frames.
let clock = 0;
let nextId = 1;
let timers = new Map();
const real = {};
export const installFakeTimers = () => {
    clock = 1000000;
    timers = new Map();
    for (const k of ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout'])
        real[k] = globalThis[k];
    real.dateNow = Date.now;
    globalThis.setInterval = (fn, ms) => { const id = nextId++; timers.set(id, { at: clock + ms, every: ms, fn }); return id; };
    globalThis.setTimeout = (fn, ms) => { const id = nextId++; timers.set(id, { at: clock + ms, every: 0, fn }); return id; };
    globalThis.clearInterval = globalThis.clearTimeout = (id) => { timers.delete(id); };
    Date.now = () => clock;
};
export const uninstallFakeTimers = () => {
    for (const k of ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout'])
        globalThis[k] = real[k];
    Date.now = real.dateNow;
};
/** Advance the fake clock, firing due timers in order. */
export const advance = (ms) => () => {
    const target = clock + ms;
    for (;;) {
        let next = null;
        for (const [id, t] of timers)
            if (t.at <= target && (next === null || t.at < next[1].at))
                next = [id, t];
        if (next === null)
            break;
        const [id, t] = next;
        clock = t.at;
        if (t.every > 0)
            t.at += t.every;
        else
            timers.delete(id);
        t.fn();
    }
    clock = target;
};
export const pendingTimers = () => timers.size;
let frameCallbacks = new Map();
export const installFakeFrames = () => {
    frameCallbacks = new Map();
    real.raf = globalThis.requestAnimationFrame;
    real.caf = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (fn) => { const id = nextId++; frameCallbacks.set(id, fn); return id; };
    globalThis.cancelAnimationFrame = (id) => { frameCallbacks.delete(id); };
};
export const uninstallFakeFrames = () => {
    globalThis.requestAnimationFrame = real.raf;
    globalThis.cancelAnimationFrame = real.caf;
};
/** Run the callbacks scheduled for the next frame with the given timestamp. */
export const frame = (t) => () => {
    const due = frameCallbacks;
    frameCallbacks = new Map();
    for (const fn of due.values())
        fn(t);
};
export const pendingFrames = () => frameCallbacks.size;
