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
// - `noUpdate`: what a `stateful` step returns to keep its state without
//   updating (#68).
// - `isConstant`: lets a combinator skip the graph when an input can never
//   change, as `Screamer.Element` does for static attributes and text.
// - `subscribeEvent`: the one way an effect consumes each occurrence once;
//   its version bookkeeping is internal to the runtime.
// - `Cell` and `EventSourceNode`: the types `cell` and `eventSource`
//   return. Setting `commutes` on either turns off the development warning
//   for writes from several subscribers in one timestep.
// - `inTimestep`: whether a timestep is running, for development warnings
//   about code that expects to run between timesteps.
// - `contextOf`, `lookupContext` and the `Context` type (#48): how FFI
//   reads the values `Screamer.Context.provide` puts on scopes.
// - `setDevHook`, `setStrict`, `isStrict`, `scopeInfo`, `tagScope`,
//   `rootScopes`, `effectCount`, `readStats`, `setScopeNodes`,
//   `ownerOfNode`, `setTrackOrigins`, `originOf`, `setConsistencyCheck`,
//   `consistencyChecking`, `registerCheck`, `nodeKind`, `nodeLabel`,
//   `nodeInputs` and `effectDisposed` (#84): the development hook, strict
//   mode, and what development tools read about scopes. All do nothing, or
//   return nothing, outside development. `Scope.parent` and
//   `Scope.children` are part of the contract for walking the tree, read
//   only.
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
export const noUpdate = R.noUpdate;
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
export const inTimestep = R.inTimestep;
export const sample = R.sample;
export const untracked = R.untracked;

// Development tools
export const setDevHook = R.setDevHook;
export const setStrict = R.setStrict;
/** Report an add-on warning through the devtools hook and strict mode. */
export const warnDevelopment = R.warnDevelopment;
export const isStrict = R.isStrict;
export const scopeInfo = R.scopeInfo;
export const tagScope = R.tagScope;
export const rootScopes = R.rootScopes;
export const effectCount = R.effectCount;
export const readStats = R.readStats;
export const setScopeNodes = R.setScopeNodes;
export const ownerOfNode = R.ownerOfNode;
export const setTrackOrigins = R.setTrackOrigins;
export const originOf = R.originOf;
export const setConsistencyCheck = R.setConsistencyCheck;
export const consistencyChecking = R.consistencyChecking;
export const registerCheck = R.registerCheck;
export const nodeKind = R.nodeKind;
export const nodeLabel = R.nodeLabel;
export const nodeInputs = R.nodeInputs;
export const effectDisposed = R.effectDisposed;

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
export type EventSourceNode<T> = Runtime.EventSourceNode<T>;
export type Constant<T> = Runtime.Constant<T>;
export type Accum<S, B> = Runtime.Accum<S, B>;
export type DevEvent = Runtime.DevEvent;
export type DevHook = Runtime.DevHook;
export type ScopeInfo = Runtime.ScopeInfo;
export type Source = Runtime.Source;
export type EffectNode = Runtime.EffectNode;
