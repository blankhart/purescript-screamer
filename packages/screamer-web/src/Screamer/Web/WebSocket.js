// Foreign module of Screamer.Web.WebSocket.
export const open = (h) => () => {
    const ws = new WebSocket(h.url);
    ws.addEventListener('open', () => h.onOpen());
    ws.addEventListener('close', () => h.onClose());
    ws.addEventListener('message', (e) => {
        if (typeof e.data === 'string')
            h.onMessage(e.data)();
    });
    return ws;
};
export const sendImpl = (ws) => (text) => () => {
    ws.send(text);
};
export const closeImpl = (ws) => () => {
    ws.close();
};
export const openManaged = (h) => () => {
    const socket = new WebSocket(h.url);
    const opened = () => h.onOpen();
    const closed = (event) => h.onClose({ code: event.code, reason: event.reason, wasClean: event.wasClean })();
    const message = (event) => {
        if (typeof event.data === 'string')
            h.onMessage(event.data)();
    };
    socket.addEventListener('open', opened);
    socket.addEventListener('close', closed);
    socket.addEventListener('message', message);
    let disposed = false;
    return {
        socket,
        dispose() {
            if (disposed)
                return;
            disposed = true;
            socket.removeEventListener('open', opened);
            socket.removeEventListener('close', closed);
            socket.removeEventListener('message', message);
            if (socket.readyState < 2)
                socket.close();
        },
    };
};
export const sendManaged = (handle) => (text) => () => {
    if (handle.socket.readyState === 1)
        handle.socket.send(text);
};
export const disposeManaged = (handle) => () => handle.dispose();
