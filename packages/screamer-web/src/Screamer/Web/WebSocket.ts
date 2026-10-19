// Foreign module of Screamer.Web.WebSocket.

interface Handlers {
  url: string;
  onOpen: () => void;
  onClose: () => void;
  onMessage: (text: string) => () => void;
}

export const open = (h: Handlers) => (): WebSocket => {
  const ws = new WebSocket(h.url);
  ws.addEventListener('open', () => h.onOpen());
  ws.addEventListener('close', () => h.onClose());
  ws.addEventListener('message', (e: MessageEvent) => {
    if (typeof e.data === 'string') h.onMessage(e.data)();
  });
  return ws;
};

export const sendImpl = (ws: WebSocket) => (text: string) => () => {
  ws.send(text);
};

export const closeImpl = (ws: WebSocket) => () => {
  ws.close();
};
