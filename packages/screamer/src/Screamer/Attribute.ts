// Foreign module of Screamer.Attribute. An attribute is a plain record that
// Element.ts applies when it builds the element.
import type * as Runtime from '../../../screamer-reactive/src/Screamer/Runtime/Unsafe.js';

type Sig<T> = Runtime.Readable<T>;

// The kinds must match Element.ts.
const PROPERTY = 0;
const ATTRIBUTE = 1;
const BOOLEAN = 2;
const STYLE = 3;
const EVENT = 4;
const GROUP = 5;

export interface Attr {
  kind: number;
  name: string;
  value: any;
}

export const property = (name: string) => (value: Sig<any>): Attr => ({ kind: PROPERTY, name, value });

export const attribute = (name: string) => (value: Sig<string>): Attr => ({ kind: ATTRIBUTE, name, value });

export const booleanAttribute = (name: string) => (value: Sig<boolean>): Attr => ({ kind: BOOLEAN, name, value });

export const styleProperty = (name: string) => (value: Sig<string>): Attr => ({ kind: STYLE, name, value });

export const on_ = (name: string) => (handler: (e: Event) => () => void): Attr => ({ kind: EVENT, name, value: handler });

export const unsafeOn_ = on_;

export const attributes = (list: Attr[]): Attr => ({ kind: GROUP, name: '', value: list });
