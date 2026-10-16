// @ts-ignore: purs copies this file to output/Screamer.EventSource/foreign.js, next to the core's.
import * as CoreRuntime from '../Screamer.Reactive.Core/foreign.js';
const R = CoreRuntime;
export const eventSource = () => {
    const src = R.eventSource();
    return {
        event: src,
        fire: (x) => () => src.fire(x),
    };
};
