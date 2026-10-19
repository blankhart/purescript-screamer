// @ts-ignore: purs copies this file to output/Screamer.Runtime.Unsafe/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime/foreign.js';
const R = runtime;
// Nodes
export const cell = R.cell;
export const constant = R.constant;
/** Whether the signal is a constant, which never changes or notifies. */
export const isConstant = (s) => s instanceof R.Constant;
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
// Batching and reading
export const batch = R.batch;
export const isBatching = R.isBatching;
export const sample = R.sample;
export const untracked = R.untracked;
/** Development checks are on: `DEV` in the runtime. */
export const development = R.DEV;
