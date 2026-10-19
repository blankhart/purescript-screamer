// Stand-ins for browser APIs jsdom lacks or cannot drive.

// matchMedia: one list per query, whose `matches` the test sets.
const lists = new Map();
let realMatchMedia;

export const installMatchMedia = () => {
  lists.clear();
  realMatchMedia = window.matchMedia;
  window.matchMedia = (query) => {
    let mql = lists.get(query);
    if (mql === undefined) {
      mql = new window.EventTarget();
      mql.media = query;
      mql.matches = false;
      lists.set(query, mql);
    }
    return mql;
  };
};

export const uninstallMatchMedia = () => { window.matchMedia = realMatchMedia; };

export const setMedia = (query) => (matches) => () => {
  const mql = window.matchMedia(query);
  mql.matches = matches;
  const e = new window.Event('change');
  e.matches = matches;
  mql.dispatchEvent(e);
};

// ResizeObserver and IntersectionObserver: the test reports to every live
// observer.
const observers = { resize: new Set(), intersection: new Set() };
const saved = {};

const stub = (kind) => class {
  constructor(callback) { this.callback = callback; this.targets = []; }
  observe(el) { this.targets.push(el); observers[kind].add(this); }
  disconnect() { observers[kind].delete(this); }
};

export const installObservers = () => {
  saved.ResizeObserver = globalThis.ResizeObserver;
  saved.IntersectionObserver = globalThis.IntersectionObserver;
  globalThis.ResizeObserver = stub('resize');
  globalThis.IntersectionObserver = stub('intersection');
};

export const uninstallObservers = () => {
  globalThis.ResizeObserver = saved.ResizeObserver;
  globalThis.IntersectionObserver = saved.IntersectionObserver;
  observers.resize.clear();
  observers.intersection.clear();
};

export const resizeTo = (width) => (height) => () => {
  for (const o of [...observers.resize]) {
    o.callback(o.targets.map((target) => ({ target, contentRect: { width, height } })), o);
  }
};

export const intersect = (yes) => () => {
  for (const o of [...observers.intersection]) {
    o.callback(o.targets.map((target) => ({ target, isIntersecting: yes })), o);
  }
};

export const liveObservers = () => observers.resize.size + observers.intersection.size;

export const newElement = () => document.createElement('div');

// Storage, visibility and connectivity events.

export const clearStorage = () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
};

export const otherTabWrites = (key) => (value) => () => {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new window.StorageEvent('storage', { key, newValue: value, storageArea: window.localStorage }));
};

export const storedLocal = (key) => () => window.localStorage.getItem(key) ?? '(none)';

export const setVisibility = (state) => () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new window.Event('visibilitychange'));
};

export const setOnline = (yes) => () => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => yes });
  window.dispatchEvent(new window.Event(yes ? 'online' : 'offline'));
};
