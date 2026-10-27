// DOM helpers for the motion tests, under jsdom.

const at = (sel) => {
  const el = document.querySelector(sel);
  if (el === null) throw new Error(`no element matches ${sel}`);
  return el;
};

export const classes = (sel) => () => at(sel).className;

export const styleOf = (sel) => (prop) => () => at(sel).style.getPropertyValue(prop);

export const count = (sel) => () => document.querySelectorAll(sel).length;

export const dispatch = (sel) => (type) => () => {
  at(sel).dispatchEvent(new window.Event(type, { bubbles: true }));
};

// jsdom lays nothing out: each element's rect comes from its index among
// its parent's element children, 10px rows one under another.
export const stubRects = () => {
  const proto = window.Element.prototype;
  const saved = proto.getBoundingClientRect;
  proto.getBoundingClientRect = function () {
    const i = this.parentNode === null ? 0 : Array.prototype.indexOf.call(this.parentNode.children, this);
    const top = i * 10;
    return { top, bottom: top + 10, left: 0, right: 100, width: 100, height: 10, x: 0, y: top };
  };
  return () => { proto.getBoundingClientRect = saved; };
};

// A stand-in for Element.animate: it records each animation, which the
// test finishes; finishing or cancelling settles its `finished` promise.
const animations = [];

export const stubAnimate = () => {
  animations.length = 0;
  const proto = window.Element.prototype;
  const saved = proto.animate;
  proto.animate = function (keyframes, options) {
    let resolve, reject;
    const finished = new Promise((res, rej) => { resolve = res; reject = rej; });
    const a = {
      target: this,
      keyframes,
      options,
      state: 'running',
      finished,
      cancel() { if (a.state === 'running') { a.state = 'cancelled'; reject(new Error('cancelled')); } },
      finish() { if (a.state === 'running') { a.state = 'finished'; resolve(a); } },
    };
    animations.push(a);
    return a;
  };
  return () => { if (saved === undefined) delete proto.animate; else proto.animate = saved; };
};

const describe = (a) => ({
  text: a.target.textContent,
  state: a.state,
  transforms: a.keyframes.map((k) => k.transform ?? ''),
  opacities: a.keyframes.map((k) => k.opacity ?? ''),
});

export const animationLog = () => animations.map(describe);

export const finishAll = () => { for (const a of animations) a.finish(); };

// document.startViewTransition, recording the calls and running the update
// at once.
export const stubViewTransition = (log) => () => {
  document.startViewTransition = (update) => { log(); update(); return {}; };
  return () => { delete document.startViewTransition; };
};

// matchMedia, with `(prefers-reduced-motion: reduce)` set by the test.
let reduced = false;
let realMatchMedia;

export const installMatchMedia = () => {
  reduced = false;
  realMatchMedia = window.matchMedia;
  window.matchMedia = (query) => ({ media: query, matches: query === '(prefers-reduced-motion: reduce)' && reduced });
};

export const uninstallMatchMedia = () => {
  if (realMatchMedia === undefined) delete window.matchMedia;
  else window.matchMedia = realMatchMedia;
};

export const setReduced = (r) => () => { reduced = r; };

export const inert = (b) => ({ ...b, interactive: false });
