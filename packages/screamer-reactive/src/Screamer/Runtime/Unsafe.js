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
export const development = R.DEV;
