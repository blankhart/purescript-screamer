// Foreign module of Screamer.Motion.Transition: CSS class transitions and
// inline-style presets.
//
// Each function starts one transition on a node and returns the action
// that cancels it. Steps are timed with the scope's `Screamer.Host`, so a
// fake host drives them in tests, and each runs inside `batch`. Durations
// are given, never read from computed styles: the end is the first of the
// node's own `transitionend` or `animationend` and a timer at the duration.
import type * as Runtime from '../../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Motion.Transition/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

const R: typeof Runtime = runtime;

type Eff<A> = () => A;

interface Host {
  setTimeout: (ms: number) => (action: Eff<void>) => Eff<Eff<void>>;
  requestFrame: (action: (t: number) => Eff<void>) => Eff<Eff<void>>;
}

interface Phase {
  from: string;
  active: string;
  to: string;
}

type Rect = { left: number; top: number };

const ELEMENT = 1;
const DURATION = '--screamer-duration';
const noop = () => {};

const words = (s: string): string[] => s.split(/\s+/).filter((w) => w.length > 0);

function addClasses(el: Element, s: string): void {
  const w = words(s);
  if (w.length > 0) el.classList.add(...w);
}

function removeClasses(el: Element, s: string): void {
  const w = words(s);
  if (w.length > 0) el.classList.remove(...w);
}

/** The frames, timer and listeners of one transition, cancelled together. */
class Steps {
  private cancels: Eff<void>[] = [];
  constructor(private h: Host) {}

  private frame(f: () => void): void {
    this.cancels.push(this.h.requestFrame(() => () => R.batch(f))());
  }

  /**
   * Run `f` two frames from now: the styles set before have then been
   * rendered once, so a change made in `f` transitions from them.
   */
  afterPaint(f: () => void): void {
    this.frame(() => this.frame(f));
  }

  /** Run `f` once, at the first of `el`'s own end events and `ms` from now. */
  end(el: Element, ms: number, f: () => void): void {
    let ended = false;
    const finish = (e?: Event) => {
      if (ended || (e !== undefined && e.target !== el)) return;
      ended = true;
      this.cancel();
      R.batch(f);
    };
    el.addEventListener('transitionend', finish);
    el.addEventListener('animationend', finish);
    this.cancels.push(() => {
      el.removeEventListener('transitionend', finish);
      el.removeEventListener('animationend', finish);
    });
    this.cancels.push(this.h.setTimeout(ms)(() => finish())());
  }

  cancel(): void {
    const cs = this.cancels;
    this.cancels = [];
    for (let i = 0; i < cs.length; i++) cs[i]();
  }
}

const setDuration = (el: HTMLElement, ms: number) => el.style.setProperty(DURATION, `${ms}ms`);
const clearDuration = (el: HTMLElement) => el.style.removeProperty(DURATION);

/**
 * Apply `from` and `active`, then after a paint swap `from` for `to`, and at
 * the end call `ended`. `clear` removes all three and the duration.
 */
function phase(h: Host, el: HTMLElement, p: Phase, ms: number, ended: () => void): { steps: Steps; clear: () => void } {
  const steps = new Steps(h);
  const clear = () => {
    removeClasses(el, p.from);
    removeClasses(el, p.active);
    removeClasses(el, p.to);
    clearDuration(el);
  };
  setDuration(el, ms);
  addClasses(el, p.from);
  addClasses(el, p.active);
  steps.afterPaint(() => {
    removeClasses(el, p.from);
    addClasses(el, p.to);
    steps.end(el, ms, ended);
  });
  return { steps, clear };
}

export const cssEnterImpl = (h: Host) => (p: Phase) => (ms: number) => (node: Node) => (): Eff<void> => {
  if (node.nodeType !== ELEMENT) return noop;
  const t = phase(h, node as HTMLElement, p, ms, () => t.clear());
  return () => {
    t.steps.cancel();
    t.clear();
  };
};

export const cssLeaveImpl = (h: Host) => (p: Phase) => (ms: number) => (node: Node) => (done: Eff<void>) => (): Eff<void> => {
  if (node.nodeType !== ELEMENT) {
    done();
    return noop;
  }
  const t = phase(h, node as HTMLElement, p, ms, done);
  return () => {
    t.steps.cancel();
    t.clear();
  };
};

/**
 * FLIP with a class: put the element back where it was with an inline
 * transform, then after a paint add the class and remove the transform, so
 * the class's `transition` moves it to where it is now.
 */
export const cssMoveImpl = (h: Host) => (cls: string) => (ms: number) => (m: { node: Node; before: Rect; after: Rect }) => (): Eff<void> => {
  const el = m.node as HTMLElement;
  const dx = m.before.left - m.after.left;
  const dy = m.before.top - m.after.top;
  if (dx === 0 && dy === 0) return noop;
  const steps = new Steps(h);
  const clear = () => {
    removeClasses(el, cls);
    clearDuration(el);
    el.style.removeProperty('transform');
    el.style.removeProperty('transition-duration');
  };
  el.style.setProperty('transform', `translate(${dx}px, ${dy}px)`);
  el.style.setProperty('transition-duration', '0s');
  steps.afterPaint(() => {
    addClasses(el, cls);
    setDuration(el, ms);
    el.style.removeProperty('transform');
    el.style.removeProperty('transition-duration');
    steps.end(el, ms, clear);
  });
  return () => {
    steps.cancel();
    clear();
  };
};

/** An inline style: the hidden state a preset enters from and leaves to. */
type Look = Record<string, string>;

export const fadeLook: Look = { opacity: '0' };

export const slideLook = (axis: string): Look => ({ opacity: '0', transform: `translate${axis}(-100%)` });

function transitionOf(look: Look, ms: number): string {
  return Object.keys(look).map((p) => `${p} ${ms}ms ease`).join(', ');
}

function setLook(el: HTMLElement, look: Look): void {
  for (const p in look) el.style.setProperty(p, look[p]);
}

function clearLook(el: HTMLElement, look: Look): void {
  for (const p in look) el.style.removeProperty(p);
  el.style.removeProperty('transition');
}

export const styleEnterImpl = (h: Host) => (look: Look) => (ms: number) => (node: Node) => (): Eff<void> => {
  if (node.nodeType !== ELEMENT) return noop;
  const el = node as HTMLElement;
  const steps = new Steps(h);
  setLook(el, look);
  el.style.setProperty('transition', transitionOf(look, ms));
  steps.afterPaint(() => {
    for (const p in look) el.style.removeProperty(p);
    steps.end(el, ms, () => clearLook(el, look));
  });
  return () => {
    steps.cancel();
    clearLook(el, look);
  };
};

export const styleLeaveImpl = (h: Host) => (look: Look) => (ms: number) => (node: Node) => (done: Eff<void>) => (): Eff<void> => {
  if (node.nodeType !== ELEMENT) {
    done();
    return noop;
  }
  const el = node as HTMLElement;
  const steps = new Steps(h);
  el.style.setProperty('transition', transitionOf(look, ms));
  steps.afterPaint(() => {
    setLook(el, look);
    steps.end(el, ms, done);
  });
  return () => {
    steps.cancel();
    clearLook(el, look);
  };
};
