// Foreign module of Test.MockWebSocket.

const real = {};

// A mock WebSocket that records what is sent and whether it was closed.
const sockets = [];
class MockWebSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url;
    this.sent = [];
    this.closed = false;
    sockets.push(this);
  }
  send(text) { this.sent.push(text); }
  close() {
    this.closed = true;
    this.dispatchEvent(new Event('close'));
  }
}

export const installMockWebSocket = () => {
  sockets.length = 0;
  real.WebSocket = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;
};

export const uninstallMockWebSocket = () => { globalThis.WebSocket = real.WebSocket; };

const last = () => sockets[sockets.length - 1];
export const serverOpen = () => last().dispatchEvent(new Event('open'));
export const serverSend = (text) => () => {
  const e = new Event('message');
  e.data = text;
  last().dispatchEvent(e);
};
export const socketInfo = () => { const s = last(); return { url: s.url, sent: [...s.sent], closed: s.closed }; };
