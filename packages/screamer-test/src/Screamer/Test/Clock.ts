// Foreign module of Screamer.Test.Clock: fake global timers and animation
// frames.

let clock = 0;
let nextId = 1;
let timers = new Map<number, { at: number; every: number; fn: () => void }>();
const real: any = {};

export const installFakeTimers = () => {
  clock = 1_000_000;
  timers = new Map();
  for (const k of ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout']) real[k] = (globalThis as any)[k];
  real.dateNow = Date.now;
  (globalThis as any).setInterval = (fn: () => void, ms: number) => { const id = nextId++; timers.set(id, { at: clock + ms, every: ms, fn }); return id; };
  (globalThis as any).setTimeout = (fn: () => void, ms: number) => { const id = nextId++; timers.set(id, { at: clock + ms, every: 0, fn }); return id; };
  (globalThis as any).clearInterval = (globalThis as any).clearTimeout = (id: number) => { timers.delete(id); };
  Date.now = () => clock;
};

export const uninstallFakeTimers = () => {
  for (const k of ['setInterval', 'setTimeout', 'clearInterval', 'clearTimeout']) (globalThis as any)[k] = real[k];
  Date.now = real.dateNow;
};

/** Advance the fake clock, firing due timers in order. */
export const advance = (ms: number) => () => {
  const target = clock + ms;
  for (;;) {
    let next: [number, { at: number; every: number; fn: () => void }] | null = null;
    for (const [id, t] of timers) if (t.at <= target && (next === null || t.at < next[1].at)) next = [id, t];
    if (next === null) break;
    const [id, t] = next;
    clock = t.at;
    if (t.every > 0) t.at += t.every;
    else timers.delete(id);
    t.fn();
  }
  clock = target;
};

export const pendingTimers = () => timers.size;

let frameCallbacks = new Map<number, (t: number) => void>();
export const installFakeFrames = () => {
  frameCallbacks = new Map();
  real.raf = globalThis.requestAnimationFrame;
  real.caf = globalThis.cancelAnimationFrame;
  (globalThis as any).requestAnimationFrame = (fn: (t: number) => void) => { const id = nextId++; frameCallbacks.set(id, fn); return id; };
  (globalThis as any).cancelAnimationFrame = (id: number) => { frameCallbacks.delete(id); };
};

export const uninstallFakeFrames = () => {
  (globalThis as any).requestAnimationFrame = real.raf;
  (globalThis as any).cancelAnimationFrame = real.caf;
};

/** Run the callbacks scheduled for the next frame with the given timestamp. */
export const frame = (t: number) => () => {
  const due = frameCallbacks;
  frameCallbacks = new Map();
  for (const fn of due.values()) fn(t);
};

export const pendingFrames = () => frameCallbacks.size;
