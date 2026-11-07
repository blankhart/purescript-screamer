// @ts-ignore: purs copies this file to output/Screamer.Source/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const signalSourceOf = (c) => {
    return {
        signal: c,
        readT1: () => c.readT1(),
        putT1: (x) => () => c.putT1(x),
        modifyT1: (f) => () => c.modifyT1(f),
    };
};
export const signalSource = (a) => () => signalSourceOf(R.cell(a));
export const commutingSignalSource = (a) => () => {
    const c = R.cell(a);
    c.commutes = true;
    return signalSourceOf(c);
};
const eventSourceOf = (src) => {
    return {
        event: src,
        fireT1: (x) => () => src.fireT1(x),
    };
};
export const eventSource = () => eventSourceOf(R.eventSource());
export const commutingEventSource = () => {
    const src = R.eventSource();
    src.commutes = true;
    return eventSourceOf(src);
};
export const batch = (e) => () => R.batch(e);
