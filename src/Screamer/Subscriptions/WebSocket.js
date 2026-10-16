// Foreign module of Screamer.Subscriptions.WebSocket.
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
