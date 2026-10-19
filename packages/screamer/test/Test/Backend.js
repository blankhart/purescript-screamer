// Test backends: one over a separate document that records the name of each
// operation, and a guard that makes the global document's node operations
// throw.

export const recordingBackend = (interactive) => () => {
  const doc = document.implementation.createHTMLDocument('recording');
  const ops = [];
  const log = (name, f) => (...args) => {
    ops.push(name);
    return f(...args);
  };
  const backend = {
    interactive,
    createElement: log('createElement', (tag) => doc.createElement(tag)),
    createElementNS: log('createElementNS', (ns, tag) => doc.createElementNS(ns, tag)),
    createText: log('createText', (data) => doc.createTextNode(data)),
    createComment: log('createComment', (data) => doc.createComment(data)),
    createAnchor: log('createAnchor', () => doc.createComment('')),
    createFragment: log('createFragment', () => doc.createDocumentFragment()),
    appendChild: log('appendChild', (p, c) => { p.appendChild(c); }),
    insertBefore: log('insertBefore', (p, c, r) => { p.insertBefore(c, r); }),
    removeChild: log('removeChild', (p, c) => { p.removeChild(c); }),
    parentNode: log('parentNode', (n) => n.parentNode),
    nextSibling: log('nextSibling', (n) => n.nextSibling),
    firstChild: log('firstChild', (n) => n.firstChild),
    lastChild: log('lastChild', (n) => n.lastChild),
    nodeType: log('nodeType', (n) => n.nodeType),
    clearChildren: log('clearChildren', (n) => { n.textContent = ''; }),
    setAttribute: log('setAttribute', (el, k, v) => { el.setAttribute(k, v); }),
    removeAttribute: log('removeAttribute', (el, k) => { el.removeAttribute(k); }),
    setProperty: log('setProperty', (el, k, v) => { if (el[k] !== v) el[k] = v; }),
    setStyle: log('setStyle', (el, k, v) => { el.style.setProperty(k, v); }),
    setText: log('setText', (n, d) => { n.data = d; }),
    listen: log('listen', (el, name, handler, scope) => {
      const l = (e) => handler(e)();
      el.addEventListener(name, l);
      scope.cleanups.push(() => el.removeEventListener(name, l));
    }),
    enter: log('enter', () => {}),
    leave: log('leave', () => {}),
    select: log('select', (sel) => doc.querySelector(sel)),
  };
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  return {
    backend,
    ops: () => [...new Set(ops)].sort(),
    attach: (node) => () => { container.appendChild(node); },
    html: () => container.innerHTML,
    click: (sel) => () => {
      container.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    },
  };
};

const GUARDED = [
  'createElement', 'createElementNS', 'createTextNode', 'createComment',
  'createDocumentFragment', 'querySelector', 'addEventListener',
];

export const guardDocument = (action) => () => {
  const saved = GUARDED.map((name) => [name, Object.getOwnPropertyDescriptor(document, name)]);
  for (const name of GUARDED) {
    Object.defineProperty(document, name, {
      configurable: true,
      value: () => { throw new Error(`document.${name} called directly`); },
    });
  }
  try {
    return action();
  } finally {
    for (const [name, d] of saved) {
      if (d === undefined) delete document[name];
      else Object.defineProperty(document, name, d);
    }
  }
};

export const addTarget = (id) => () => {
  const el = document.createElement('div');
  el.id = id;
  document.body.appendChild(el);
};

export const crash = (message) => {
  throw new Error(message);
};
