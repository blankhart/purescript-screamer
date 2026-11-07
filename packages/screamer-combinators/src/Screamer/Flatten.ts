// Foreign module of Screamer.Flatten: one child scope per inner value.
import type * as Runtime from '../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';
// @ts-ignore: purs copies this file to output/Screamer.Flatten/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';

// @ts-ignore: next to it, too, is Screamer.Event's, which merges the children's events.
import * as eventModule from '../Screamer.Event/foreign.js';
import type * as EventModule from '../../../screamer-reactive/src/Screamer/Event.js';

const R: typeof Runtime = runtime;
const Ev: typeof EventModule = eventModule;

type Scope = Runtime.Scope;
type Eff<A> = () => A;
/** An `Owned b` at run time. */
type Owned<B> = (s: Scope) => Eff<B>;
type Ev<T> = Runtime.EventLike<T>;

/** Run an `Owned` in a new child scope of `parent`, in a batch, untracked. */
function runChild<B>(parent: Scope, o: Owned<B>): { scope: Scope; value: B } {
  const scope = R.createScope(parent);
  const value = R.untracked(() => R.batch(() => R.runInScope(scope, () => o(scope)())));
  return { scope, value };
}

export const switchOwnedImpl = <A, B>(s: Scope) => (sig: Runtime.Readable<A>) => (f: (a: A) => Owned<B>) => () => {
  let child: Scope | null = null;
  let out: Runtime.Cell<B> | null = null;
  R.effectIn(s, () => {
    const a = sig.read();
    R.untracked(() => {
      if (child !== null) child.dispose();
      child = null;
      const made = runChild(s, f(a));
      child = made.scope;
      if (out === null) out = R.cell(made.value);
      else out.putT1(made.value);
    });
  });
  return out!;
};

const MERGE = 0;
const CONCAT = 1;
const EXHAUST = 2;

interface Child<B> {
  event: Ev<B>;
}

/**
 * One child scope per occurrence, under a strategy: merge runs every child;
 * concat queues occurrences while a child runs; exhaust ignores them. A
 * child runs until it calls its `done` action or the parent is disposed.
 */
const flattenImpl =
  (strategy: number) => <A, B>(s: Scope) => (e: Ev<A>) => (f: (a: A) => (done: Eff<void>) => Owned<Ev<B>>) => (): Ev<B> => {
    const live = R.cell<Child<B>[]>([]);
    // Children start and finish from their own subscribers; adding and
    // removing different children commutes.
    live.commutes = true;
    const queue: A[] = [];
    let running = 0;
    const start = (a: A): void => {
      const entry: Child<B> = { event: R.neverEvent };
      let finished = false;
      let scope: Scope | null = null;
      const done = () => {
        if (finished) return;
        finished = true;
        running--;
        R.batch(() => {
          if (scope !== null) scope.dispose();
          live.modifyT1((cs) => cs.filter((c) => c !== entry));
          if (queue.length > 0 && !s.disposed) start(queue.shift()!);
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
      live.modifyT1((cs) => cs.concat([entry]));
    };
    R.subscribeEvent(s, e, (a) => {
      if (running > 0 && strategy === CONCAT) queue.push(a);
      else if (running > 0 && strategy === EXHAUST) return;
      else start(a);
    });
    s.cleanups.push(() => { queue.length = 0; });
    return Ev.mergeAll(R.derived(() => live.read().map((c) => c.event)));
  };

export const mergeOwnedImpl = flattenImpl(MERGE);
export const concatOwnedImpl = flattenImpl(CONCAT);
export const exhaustOwnedImpl = flattenImpl(EXHAUST);
