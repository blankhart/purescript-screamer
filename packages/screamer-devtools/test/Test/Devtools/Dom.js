export const querySelector = (selector) => () => {
  const n = document.querySelector(selector);
  if (n === null) throw new Error(`no element matches ${selector}`);
  return n;
};

export const firstChild = (n) => () => n.firstChild;

export const setTextOf = (selector) => (text) => () => {
  document.querySelector(selector).firstChild.data = text;
};

export const globalSnapshotText = () => globalThis.__SCREAMER_DEVTOOLS__.snapshotText();
