// Foreign module of Test.MockWebSocket.

const real = {};

// A mock WebSocket that records what is sent and whether it was closed.
const sockets = [];
let failNext = false;
class MockWebSocket extends EventTarget {
  constructor(url) {
    super();
    if (failNext) { failNext = false; throw new Error('invalid socket URL'); }
    this.url = url;
    this.sent = [];
    this.closed = false;
    this.readyState = 0;
    this.listeners = new Map();
    this.callbacks = new Map();
    sockets.push(this);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    if (!this.callbacks.has(type)) this.callbacks.set(type, []);
    this.callbacks.get(type).push(listener);
    super.addEventListener(type, listener);
  }
  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener);
  }
  send(text) {
    if (this.readyState !== 1) throw new Error('send while not open');
    this.sent.push(text);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
}

export const installMockWebSocket = () => {
  sockets.length = 0;
  failNext = false;
  real.WebSocket = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;
};

export const uninstallMockWebSocket = () => { globalThis.WebSocket = real.WebSocket; };

const last = () => sockets[sockets.length - 1];
export const serverOpen = () => { last().readyState = 1; last().dispatchEvent(new Event('open')); };
export const serverSend = (text) => () => {
  const e = new Event('message');
  e.data = text;
  last().dispatchEvent(e);
};
export const socketInfo = () => { const s = last(); return { url: s.url, sent: [...s.sent], closed: s.closed }; };
export const socketCount = () => sockets.length;
export const listenerCount = () => sockets.reduce((n, s) => n + [...s.listeners.values()].reduce((m, set) => m + set.size, 0), 0);
export const failNextOpen = () => { failNext = true; };
export const serverClose = info => () => {
  const s = last();
  s.readyState = 3;
  s.closed = true;
  const event = new Event('close');
  Object.assign(event, info);
  s.dispatchEvent(event);
};
export const staleEvents = () => {
  const s = sockets[0];
  for (const callback of s.callbacks.get('open') ?? []) callback(new Event('open'));
  const message = new Event('message');
  message.data = 'obsolete';
  for (const callback of s.callbacks.get('message') ?? []) callback(message);
  const close = new Event('close');
  Object.assign(close, { code: 1006, reason: 'obsolete', wasClean: false });
  for (const callback of s.callbacks.get('close') ?? []) callback(close);
};
