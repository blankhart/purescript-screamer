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

interface CloseInfo { code: number; reason: string; wasClean: boolean }
interface ManagedSocket { socket: WebSocket; dispose: () => void }

export const openManaged = (h: {
  url: string;
  onOpen: () => void;
  onClose: (info: CloseInfo) => () => void;
  onMessage: (text: string) => () => void;
}) => (): ManagedSocket => {
  const socket = new WebSocket(h.url);
  const opened = () => h.onOpen();
  const closed = (event: CloseEvent) => h.onClose({ code: event.code, reason: event.reason, wasClean: event.wasClean })();
  const message = (event: MessageEvent) => {
    if (typeof event.data === 'string') h.onMessage(event.data)();
  };
  socket.addEventListener('open', opened);
  socket.addEventListener('close', closed);
  socket.addEventListener('message', message);
  let disposed = false;
  return {
    socket,
    dispose() {
      if (disposed) return;
      disposed = true;
      socket.removeEventListener('open', opened);
      socket.removeEventListener('close', closed);
      socket.removeEventListener('message', message);
      if (socket.readyState < 2) socket.close();
    },
  };
};

export const sendManaged = (handle: ManagedSocket) => (text: string) => () => {
  if (handle.socket.readyState === 1) handle.socket.send(text);
};

export const disposeManaged = (handle: ManagedSocket) => () => handle.dispose();
