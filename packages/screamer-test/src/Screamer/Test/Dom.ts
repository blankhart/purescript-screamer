// Foreign module of Screamer.Test.Dom. It counts listeners by patching
// EventTarget when it loads.
// Count listeners that are added and not yet removed, across all targets.
let live = 0;
const proto = window.EventTarget.prototype;
const add = proto.addEventListener;
const remove = proto.removeEventListener;
const registered = new WeakMap<object, Map<any, Set<string>>>(); // target -> Set of "type|capture" keys per listener
const keyOf = (type: string, options: any) => type + '|' + (options === true || (options && options.capture) ? 'c' : '');
proto.addEventListener = function (this: any, type: string, listener: any, options?: any) {
  let byListener = registered.get(this);
  if (!byListener) registered.set(this, (byListener = new Map()));
  let keys = byListener.get(listener);
  if (!keys) byListener.set(listener, (keys = new Set()));
  const k = keyOf(type, options);
  if (!keys.has(k)) {
    keys.add(k);
    live++;
  }
  return add.call(this, type, listener, options);
};
proto.removeEventListener = function (this: any, type: string, listener: any, options?: any) {
  const keys = registered.get(this)?.get(listener);
  if (keys && keys.delete(keyOf(type, options))) live--;
  return remove.call(this, type, listener, options);
};

export const resetBody = () => {
  document.body.innerHTML = '<main id="root"></main>';
};

export const innerHTML = (sel: string) => () => document.querySelector(sel)!.innerHTML;

export const click = (sel) => () => {
  document.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 12, clientY: 34 }));
};

export const liveListeners = () => live;

export const mutationsDuring = (sel) => (action) => () => {
  const root = document.querySelector(sel);
  const observer = new window.MutationObserver(() => {});
  observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  action();
  const records = observer.takeRecords();
  observer.disconnect();
  return new Set(records.map((r) => r.target)).size;
};

export const rowNodes = (sel) => () =>
  Array.from(document.querySelectorAll(sel)).map((node) => ({ key: node.getAttribute('data-key'), node }));

export const sameNode = (a) => (b) => a === b;

export const textsOf = (sel) => () => Array.from(document.querySelectorAll(sel)).map((n) => n.textContent);

export const propertyOf = (sel) => (name) => () => String(document.querySelector(sel)[name]);

export const currentTag = (e) => e.currentTarget.tagName;

// Set an input's value and dispatch the event a user's edit would.
export const typeInto = (sel) => (value) => () => {
  const el = document.querySelector(sel);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};

export const setChecked = (sel) => (checked) => () => {
  const el = document.querySelector(sel);
  el.checked = checked;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

export const selectIndex = (sel) => (index) => () => {
  const el = document.querySelector(sel);
  el.selectedIndex = index;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};

// The text of each element matching the selector that is not hidden.
export const visibleTextsOf = (sel) => () =>
  Array.from(document.querySelectorAll(sel)).filter((n) => !n.hidden).map((n) => n.textContent);

export const fakeWidget = (host) => (label) => () => {
  host.innerHTML = `<i>widget ${label}</i>`;
  return () => { host.innerHTML = ''; };
};
