// Foreign module of Screamer.Runtime.Unsafe: the runtime API that add-on
// FFI may rely on.
//
// The names below are the stable contract between the reactive runtime
// (`src/Screamer/Runtime.ts`) and foreign modules outside it. Add-ons import
// them at run time as `../Screamer.Runtime.Unsafe/foreign.js` (where `purs`
// puts this file in `output/`) and their types from
// `./Runtime/Unsafe.js`. Everything here re-exports the runtime's own
// bindings, so it is the same graph as `../Screamer.Runtime/foreign.js`.
// Anything the runtime exports that is not listed here may change without
// notice.
//
// Beyond the list in #47:
// - `isConstant`: lets a combinator skip the graph when an input can never
//   change, as `Screamer.Element` does for static attributes and text.
// - `subscribeEvent`: the one way an effect consumes each occurrence once;
//   its version bookkeeping is internal to the runtime.
// - `Cell`: the type `cell` returns.
// - `contextOf`, `lookupContext` and the `Context` type (#48): how FFI
//   reads the values `Screamer.Context.provide` puts on scopes.
// - `development` is `DEV`: an FFI module may export only names that are
//   valid PureScript identifiers, and this one is also the module's foreign
//   import (purs emits `foreign.js` only for modules that have one).
import type * as Runtime from '../Runtime.js';
// @ts-ignore: purs copies this file to output/Screamer.Runtime.Unsafe/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';

const R: typeof Runtime = runtime;

// Nodes
export const cell = R.cell;
export const constant = R.constant;

/** Whether the signal is a constant, which never changes or notifies. */
export const isConstant = <T>(s: Runtime.Readable<T>): boolean => s instanceof R.Constant;
export const derived = R.derived;
export const stateful = R.stateful;
export const eventSource = R.eventSource;
export const eventDerived = R.eventDerived;
export const eventStateful = R.eventStateful;
export const accumEvent = R.accumEvent;
export const neverEvent = R.neverEvent;
export const touch = R.touch;
export const interleave = R.interleave;
export const signalStamp = R.signalStamp;

// Effects and scopes
export const effect = R.effect;
export const effectIn = R.effectIn;
export const subscribeEvent = R.subscribeEvent;
export const createScope = R.createScope;
export const runInScope = R.runInScope;
export const scope = R.scope;
export const getOwner = R.getOwner;
export const onCleanup = R.onCleanup;
export const reportError = R.reportError;
export const contextOf = R.contextOf;
export const lookupContext = R.lookupContext;

// Batching and reading
export const batch = R.batch;
export const isBatching = R.isBatching;
export const sample = R.sample;
export const untracked = R.untracked;

/** Development checks are on: `DEV` in the runtime. */
export const development: boolean = R.DEV;

export type Readable<T> = Runtime.Readable<T>;
export type EventLike<T> = Runtime.EventLike<T>;
export type Occ<T> = Runtime.Occ<T>;
export type Inputs = Runtime.Inputs;
export type Step<S> = Runtime.Step<S>;
export type EventStep<S, T> = Runtime.EventStep<S, T>;
export type Scope = Runtime.Scope;
export type Context = Runtime.Context;
export type Cell<T> = Runtime.Cell<T>;
export type Constant<T> = Runtime.Constant<T>;
export type Accum<S, B> = Runtime.Accum<S, B>;
