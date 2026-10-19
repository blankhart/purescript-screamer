// The kinds must match Element.ts.
const PROPERTY = 0;
const ATTRIBUTE = 1;
const BOOLEAN = 2;
const STYLE = 3;
const EVENT = 4;
const GROUP = 5;
export const property = (name) => (value) => ({ kind: PROPERTY, name, value });
export const attribute = (name) => (value) => ({ kind: ATTRIBUTE, name, value });
export const booleanAttribute = (name) => (value) => ({ kind: BOOLEAN, name, value });
export const styleProperty = (name) => (value) => ({ kind: STYLE, name, value });
export const on_ = (name) => (handler) => ({ kind: EVENT, name, value: handler });
export const unsafeOn_ = on_;
export const attributes = (list) => ({ kind: GROUP, name: '', value: list });
