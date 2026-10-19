// @ts-ignore: purs copies this file to output/Screamer.Flatten/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
// @ts-ignore: next to it, too, is Screamer.Event's, which merges the children's events.
import * as eventModule from '../Screamer.Event/foreign.js';
const R = runtime;
const Ev = eventModule;
/** Run an `Owned` in a new child scope of `parent`, in a batch, untracked. */
function runChild(parent, o) {
    const scope = R.createScope(parent);
    const value = R.untracked(() => R.batch(() => R.runInScope(scope, () => o(scope)())));
    return { scope, value };
}
export const switchOwnedImpl = (s) => (sig) => (f) => () => {
    let child = null;
    let out = null;
    R.effectIn(s, () => {
        const a = sig.read();
        R.untracked(() => {
            if (child !== null)
                child.dispose();
            child = null;
            const made = runChild(s, f(a));
            child = made.scope;
            if (out === null)
                out = R.cell(made.value);
            else
                out.write(made.value);
        });
    });
    return out;
};
const MERGE = 0;
const CONCAT = 1;
const EXHAUST = 2;
/**
 * One child scope per occurrence, under a strategy: merge runs every child;
 * concat queues occurrences while a child runs; exhaust ignores them. A
 * child runs until it calls its `done` action or the parent is disposed.
 */
const flattenImpl = (strategy) => (s) => (e) => (f) => () => {
    const live = R.cell([]);
    const queue = [];
    let running = 0;
    const start = (a) => {
        const entry = { event: R.neverEvent };
        let finished = false;
        let scope = null;
        const done = () => {
            if (finished)
                return;
            finished = true;
            running--;
            R.batch(() => {
                if (scope !== null)
                    scope.dispose();
                live.write(live.value.filter((c) => c !== entry));
                if (queue.length > 0 && !s.disposed)
                    start(queue.shift());
            });
        };
        running++;
        const made = runChild(s, f(a)(done));
        scope = made.scope;
        if (finished) {
            made.scope.dispose();
            return;
        }
        entry.event = made.value;
        live.write(live.value.concat([entry]));
    };
    R.subscribeEvent(s, e, (a) => {
        if (running > 0 && strategy === CONCAT)
            queue.push(a);
        else if (running > 0 && strategy === EXHAUST)
            return;
        else
            start(a);
    });
    s.cleanups.push(() => { queue.length = 0; });
    return Ev.mergeAll(R.derived(() => live.read().map((c) => c.event)));
};
export const mergeOwnedImpl = flattenImpl(MERGE);
export const concatOwnedImpl = flattenImpl(CONCAT);
export const exhaustOwnedImpl = flattenImpl(EXHAUST);
