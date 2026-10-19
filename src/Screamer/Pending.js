// @ts-ignore: purs copies this file to output/Screamer.Pending/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const counts = new WeakMap();
// Work still outstanding on each scope, done when the scope is disposed.
const outstanding = new WeakMap();
function countOf(s) {
    let c = counts.get(s);
    if (c === undefined) {
        c = R.cell(0);
        counts.set(s, c);
    }
    return c;
}
const add = (cells, d) => R.batch(() => {
    for (const c of cells)
        c.write(c.value + d);
});
const noop = () => { };
export const pendingImpl = (s) => () => {
    if (s.disposed)
        return noop;
    const cells = [];
    for (let x = s; x !== null; x = x.parent)
        cells.push(countOf(x));
    let work = outstanding.get(s);
    if (work === undefined) {
        const w = new Set();
        outstanding.set(s, w);
        s.cleanups.push(() => {
            for (const d of [...w])
                d();
        });
        work = w;
    }
    const set = work;
    let finished = false;
    const done = () => {
        if (finished)
            return;
        finished = true;
        set.delete(done);
        add(cells, -1);
    };
    set.add(done);
    add(cells, 1);
    return done;
};
export const settledImpl = (s) => () => {
    const c = countOf(s);
    return R.derived(() => c.read() === 0);
};
