// Return whether the router prevented each click. Prevent browser navigation
// afterwards, while still exercising the real delegated window listener.
export const exercise = () => {
  const cases = [
    ['/next?x=1#top', {}, {}],
    ['/next', {}, { ctrlKey: true }],
    ['/next', {}, { metaKey: true }],
    ['/next', {}, { shiftKey: true }],
    ['/next', {}, { altKey: true }],
    ['/next', {}, { button: 1 }],
    ['/next', { target: '_blank' }, {}],
    ['/next', { target: 'frame' }, {}],
    ['/next', { download: '' }, {}],
    ['https://elsewhere.test/next', {}, {}],
    ['mailto:test@example.test', {}, {}],
    ['/auth/login', {}, {}],
    ['/api/data', {}, {}],
    ['#fragment', {}, {}],
    ['/prevented', {}, {}, true],
    ['/self', { target: '_self' }, {}],
    ['http://[invalid', {}, {}],
  ];
  return cases.map(([href, attrs, options, prevented]) => {
    const a = document.createElement('a');
    a.href = href;
    for (const [key, value] of Object.entries(attrs)) a.setAttribute(key, value);
    a.innerHTML = '<span>nested target</span>';
    document.body.append(a);
    let result;
    const stopNavigation = e => { result = e.defaultPrevented; e.preventDefault(); };
    window.addEventListener('click', stopNavigation);
    const e = new window.MouseEvent('click', { bubbles: true, cancelable: true, ...options });
    if (prevented) e.preventDefault();
    a.firstChild.dispatchEvent(e);
    window.removeEventListener('click', stopNavigation);
    a.remove();
    return result;
  });
};
