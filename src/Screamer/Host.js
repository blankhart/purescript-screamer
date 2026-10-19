export const browserHost = {
    now: () => Date.now(),
    setTimeout: (ms) => (action) => () => {
        const id = setTimeout(() => action(), ms);
        return () => clearTimeout(id);
    },
    setInterval: (ms) => (action) => () => {
        const id = setInterval(() => action(), ms);
        return () => clearInterval(id);
    },
    requestFrame: (action) => () => {
        const id = requestAnimationFrame((t) => action(t)());
        return () => cancelAnimationFrame(id);
    },
};
