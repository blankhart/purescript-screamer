export namespace codegen {

  // Event handlers take the standard Web.* event types. Each class of
  // handlers names the PureScript type and the module that exports it.
  export type EventClass =
    | 'Animation'
    | 'Clipboard'
    | 'Composition'
    | 'Drag'
    | 'Event'
    | 'Focus'
    | 'Input'
    | 'Keyboard'
    | 'Mouse'
    | 'Pointer'
    | 'Touch'
    | 'Transition'
    | 'Ui'
    | 'Wheel'
    ;

  export const EventClassTypes: Record<EventClass, { type: string; module: string }> = {
    Animation: { type: 'Event', module: 'Web.Event.Event' },
    Clipboard: { type: 'ClipboardEvent', module: 'Web.Clipboard.ClipboardEvent' },
    Composition: { type: 'CompositionEvent', module: 'Web.UIEvent.CompositionEvent' },
    Drag: { type: 'DragEvent', module: 'Web.HTML.Event.DragEvent' },
    Event: { type: 'Event', module: 'Web.Event.Event' },
    Focus: { type: 'FocusEvent', module: 'Web.UIEvent.FocusEvent' },
    Input: { type: 'Event', module: 'Web.Event.Event' },
    Keyboard: { type: 'KeyboardEvent', module: 'Web.UIEvent.KeyboardEvent' },
    Mouse: { type: 'MouseEvent', module: 'Web.UIEvent.MouseEvent' },
    Pointer: { type: 'PointerEvent', module: 'Web.PointerEvent.PointerEvent' },
    Touch: { type: 'TouchEvent', module: 'Web.TouchEvent.TouchEvent' },
    Transition: { type: 'Event', module: 'Web.Event.Event' },
    Ui: { type: 'Event', module: 'Web.Event.Event' },
    Wheel: { type: 'WheelEvent', module: 'Web.UIEvent.WheelEvent' },
  };

  // https://developer.mozilla.org/en-US/docs/Web/Events
  export const EventClassHandlers: Record<EventClass, string[]> = {
    Animation: [
      'onAnimationEnd',
      'onAnimationIteration',
      'onAnimationStart',
    ],
    Clipboard: [
      'onCopy',
      'onCut',
      'onPaste',
    ],
    Composition: [
      'onCompositionEnd',
      'onCompositionStart',
      'onCompositionUpdate',
    ],
    Drag: [
      'onDrag',
      'onDragEnd',
      'onDragEnter',
      'onDragExit',
      'onDragLeave',
      'onDragOver',
      'onDrop',
    ],
    Event: [
      'onChange',
      'onReset',
      'onSelect',
      'onSubmit',
    ],
    Focus: [
      'onBlur',
      'onFocus',
      'onFocusIn',
      'onFocusOut',
    ],
    Input: [
      'onInput',
    ],
    Keyboard: [
      'onKeyDown',
      'onKeyPress',
      'onKeyUp',
    ],
    Mouse: [
      'onClick',
      'onContextMenu',
      'onDblClick',
      'onMouseDown',
      'onMouseEnter',
      'onMouseLeave',
      'onMouseMove',
      'onMouseOut',
      'onMouseOver',
      'onMouseUp',
    ],
    Pointer: [
      'onGotPointerCapture',
      'onLostPointerCapture',
      'onPointerCancel',
      'onPointerDown',
      'onPointerEnter',
      'onPointerLeave',
      'onPointerMove',
      'onPointerOut',
      'onPointerOver',
      'onPointerUp',
    ],
    Touch: [
      'onTouchCancel',
      'onTouchEnd',
      'onTouchMove',
      'onTouchStart',
    ],
    Transition: [
      'onTransitionStart',
      'onTransitionCancel',
      'onTransitionEnd',
      'onTransitionRun',
    ],
    Ui: [
      'onScroll',
    ],
    Wheel: [
      'onWheel',
    ],
  };

  export const EventHandlers = Object.entries(EventClassHandlers)
    .map(([event_class, event_handlers]) => {
      const { type, module } = EventClassTypes[event_class as EventClass];
      return { event_class, event_type: type, event_handlers };
    });

  export const EventImports = [...new Set(Object.values(EventClassTypes).map(({ type, module }) => `${module}|${type}`))]
    .sort()
    .map((s) => {
      const [module, type] = s.split('|');
      return { module, type };
    });

  // ---------------------------------------------------------------------------
  // Attributes

  // How an attribute is bound to the element:
  // - property: assigns the DOM property (named by `prop`)
  // - attribute: setAttribute with the value printed as a string
  // - boolean: adds the attribute when true and removes it when false
  export type AttrKind = 'property' | 'attribute' | 'boolean';

  // Enumerated attribute values get an ADT. Constructors are the prefix
  // followed by the value in PascalCase.
  export const Enums: Record<string, { prefix: string; values: string[] }> = {
    InputType: {
      prefix: 'Input',
      values: ['button', 'checkbox', 'color', 'date', 'datetime-local', 'email', 'file', 'hidden', 'image', 'month', 'number', 'password', 'radio', 'range', 'reset', 'search', 'submit', 'tel', 'text', 'time', 'url', 'week'],
    },
    Autocapitalize: { prefix: 'Autocapitalize', values: ['off', 'none', 'on', 'sentences', 'words', 'characters'] },
    CrossOrigin: { prefix: 'CrossOrigin', values: ['anonymous', 'use-credentials'] },
    Decoding: { prefix: 'Decoding', values: ['sync', 'async', 'auto'] },
    Dir: { prefix: 'Dir', values: ['ltr', 'rtl', 'auto'] },
    EnterKeyHint: { prefix: 'EnterKey', values: ['enter', 'done', 'go', 'next', 'previous', 'search', 'send'] },
    FormMethod: { prefix: 'Method', values: ['get', 'post', 'dialog'] },
    InputMode: { prefix: 'InputMode', values: ['none', 'text', 'decimal', 'numeric', 'tel', 'search', 'email', 'url'] },
    Preload: { prefix: 'Preload', values: ['none', 'metadata', 'auto'] },
    Wrap: { prefix: 'Wrap', values: ['hard', 'soft'] },
  };

  const pascal = (s: string) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');

  export const EnumTypes = Object.entries(Enums).map(([name, { prefix, values }]) => ({
    name,
    constructors: values.map((value) => ({ constructor: prefix + pascal(value), value })),
  }));

  // How a property is written in HTML, for a renderer that serializes the
  // properties an element was given (see `Screamer.Html.Reflect`):
  // - attribute: the attribute, with the value as its text
  // - boolean: the bare attribute when true, nothing when false
  // - enumerated: the attribute, with one word for true and one for false
  export type ReflectKind = 'attribute' | 'boolean' | 'enumerated';
  type Reflect = { kind: ReflectKind; on?: string; off?: string };

  type AttrSpec = { type: string; kind: AttrKind; prop?: string; reflect?: Reflect };

  const str: AttrSpec = { type: 'String', kind: 'attribute' };
  const int: AttrSpec = { type: 'Int', kind: 'attribute' };
  const num: AttrSpec = { type: 'Number', kind: 'attribute' };
  const bool: AttrSpec = { type: 'Boolean', kind: 'boolean' };
  const prop = (type: string, name: string, reflect: Reflect = { kind: 'attribute' }): AttrSpec =>
    ({ type, kind: 'property', prop: name, reflect });
  const boolProp = (name: string) => prop('Boolean', name, { kind: 'boolean' });
  const trueFalseProp = (name: string) => prop('Boolean', name, { kind: 'enumerated', on: 'true', off: 'false' });
  const enumerated = (type: string): AttrSpec => ({ type, kind: 'attribute' });

  // https://html.spec.whatwg.org/multipage/indices.html#attributes-3
  // https://html.spec.whatwg.org/multipage/indices.html#attributes-3
  // Keys are PureScript names; the DOM name replaces `_` with `-`.
  export const Attributes: Record<string, AttrSpec> = {
    abbr: str,
    accept: str,
    accept_charset: str,
    accesskey: str,
    action: str,
    allow: str,
    allowfullscreen: bool,
    allowpaymentrequest: bool,
    alt: str,
    as: str,
    async: bool,
    autocapitalize: enumerated('Autocapitalize'),
    autocomplete: str, // takes tokens such as "on", "off" and "email", not a boolean
    autofocus: bool,
    autoplay: bool,
    charset: str,
    checked: boolProp('checked'),
    cite: str,
    class: str,
    color: str,
    cols: int,
    colspan: int,
    content: str,
    contenteditable: trueFalseProp('contentEditable'),
    controls: bool,
    coords: str,
    crossorigin: enumerated('CrossOrigin'),
    data: str,
    datetime: str,
    decoding: enumerated('Decoding'),
    default: bool,
    defer: bool,
    dir: enumerated('Dir'),
    dirname: str,
    disabled: bool,
    download: str,
    draggable: trueFalseProp('draggable'),
    enctype: str,
    enterkeyhint: enumerated('EnterKeyHint'),
    for: str,
    form: str,
    formaction: str,
    formenctype: str,
    formmethod: enumerated('FormMethod'),
    formnovalidate: bool,
    formtarget: str,
    headers: str,
    height: str,
    hidden: bool,
    high: num,
    href: str,
    hreflang: str,
    http_equiv: str,
    id: str,
    inputmode: enumerated('InputMode'),
    integrity: str,
    is: str,
    ismap: bool,
    itemid: str,
    itemprop: str,
    itemref: str,
    itemscope: bool,
    itemtype: str,
    kind: str,
    label: str,
    lang: str,
    list: str,
    loop: bool,
    low: num,
    manifest: str,
    max: num,
    maxlength: int, // a non-negative integer, like minlength
    media: str,
    method: enumerated('FormMethod'),
    min: num,
    minlength: int,
    multiple: bool,
    muted: boolProp('muted'),
    name: str,
    nomodule: bool,
    nonce: str,
    novalidate: bool,
    open: bool,
    optimum: num,
    pattern: str,
    ping: str,
    placeholder: str,
    playsinline: bool,
    poster: str,
    preload: enumerated('Preload'),
    readonly: bool,
    referrerpolicy: str,
    rel: str,
    required: bool,
    reversed: bool,
    rows: int,
    rowspan: int,
    sandbox: str,
    scope: str,
    selected: boolProp('selected'),
    shape: str,
    size: int,
    sizes: str,
    slot: str,
    spellcheck: trueFalseProp('spellcheck'),
    src: str,
    srcdoc: str,
    srclang: str,
    srcset: str,
    start: int,
    step: num,
    tabindex: int,
    target: str,
    title: str,
    translate: prop('Boolean', 'translate', { kind: 'enumerated', on: 'yes', off: 'no' }),
    type: enumerated('InputType'),
    typemustmatch: bool,
    usemap: str,
    value: prop('String', 'value'),
    width: int,
    wrap: enumerated('Wrap'),
  };

  // ARIA and role, as plain string attributes.
  export const AriaAttributes: string[] = [
    'role',
    'aria-activedescendant',
    'aria-checked',
    'aria-controls',
    'aria-current',
    'aria-describedby',
    'aria-disabled',
    'aria-expanded',
    'aria-haspopup',
    'aria-hidden',
    'aria-label',
    'aria-labelledby',
    'aria-live',
    'aria-pressed',
    'aria-selected',
  ];

  const camel = (s: string) => s.split('-').map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1))).join('');

  const printer = (type: string) =>
    type === 'String' ? '' : type === 'Int' || type === 'Number' || type === 'Boolean' ? 'show <$> ' : `print${type} <$> `;

  // The binding each attribute function generates.
  const binding = (dom: string, spec: AttrSpec) => {
    switch (spec.kind) {
      case 'property':
        return `property "${spec.prop}" (toSignal v)`;
      case 'boolean':
        return `booleanAttribute "${dom}" (toSignal v)`;
      case 'attribute':
        return `attribute "${dom}" (${printer(spec.type)}toSignal v)`;
    }
  };

  export const HtmlAttributes = [
    ...Object.entries(Attributes).map(([name, spec]) => {
      const dom = name.replace(/_/g, '-');
      return { name, dom, type: spec.type, binding: binding(dom, spec) };
    }),
    ...AriaAttributes.map((dom) => ({ name: camel(dom), dom, type: 'String', binding: binding(dom, str) })),
  ];


  // The HTML form of every property the generated attributes set, plus the
  // DOM properties whose name differs from their attribute's. `value` is
  // special on two elements: a textarea's value is its text, and a select's
  // value selects the option with that value.
  export const PropertyReflections: Record<string, { attribute: string; kind: ReflectKind; on?: string; off?: string; elements?: Record<string, 'text' | 'option'> }> =
    Object.fromEntries([
      ...Object.entries(Attributes).flatMap(([name, spec]) =>
        spec.kind === 'property' && spec.prop !== undefined
          ? [[spec.prop, {
              attribute: name.replace(/_/g, '-'),
              ...spec.reflect,
              ...(spec.prop === 'value' ? { elements: { textarea: 'text', select: 'option' } } : {}),
            }]]
          : []),
      ['className', { attribute: 'class', kind: 'attribute' }],
      ['htmlFor', { attribute: 'for', kind: 'attribute' }],
    ].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

  // https://html.spec.whatwg.org/multipage/indices.html#elements-3
  export const Elements: Record<string, string[]> = {
    a: [],
    abbr: [],
    address: [],
    area: [],
    article: [],
    aside: [],
    audio: [],
    b: [],
    base: [],
    bdi: [],
    bdo: [],
    blockquote: [],
    body: [],
    br: [],
    button: [],
    canvas: [],
    caption: [],
    cite: [],
    code: [],
    col: [],
    colgroup: [],
    data: [],
    datalist: [],
    dd: [],
    del: [],
    details: [],
    dfn: [],
    dialog: [],
    div: [],
    dl: [],
    dt: [],
    em: [],
    embed: [],
    fieldset: [],
    figcaption: [],
    figure: [],
    footer: [],
    form: [],
    h1: [],
    h2: [],
    h3: [],
    h4: [],
    h5: [],
    h6: [],
    head: [],
    header: [],
    hgroup: [],
    hr: [],
    html: [],
    i: [],
    iframe: [],
    img: [],
    input: [],
    ins: [],
    kbd: [],
    label: [],
    legend: [],
    li: [],
    link: [],
    main: [],
    map: [],
    mark: [],
    menu: [],
    meta: [],
    meter: [],
    nav: [],
    noscript: [],
    object: [],
    ol: [],
    optgroup: [],
    option: [],
    output: [],
    p: [],
    param: [],
    picture: [],
    pre: [],
    progress: [],
    q: [],
    rp: [],
    rt: [],
    ruby: [],
    s: [],
    samp: [],
    script: [],
    section: [],
    select: [],
    slot: [],
    small: [],
    source: [],
    span: [],
    strong: [],
    //    style: [],
    sub: [],
    summary: [],
    sup: [],
    table: [],
    tbody: [],
    td: [],
    template: [],
    textarea: [],
    tfoot: [],
    th: [],
    thead: [],
    time: [],
    title: [],
    tr: [],
    track: [],
    u: [],
    ul: [],
    var: [],
    video: [],
    wbr: [],
  };

  const names = (s: string) => s
    .split(/\s+/)
    .filter(s => s.trim() !== ``);

  // https://developer.mozilla.org/en-US/docs/Web/SVG/Element

  export const SvgElements: string[] = names(`a animate animateMotion animateTransform circle defs desc discard ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject g hatch hatchpath image line linearGradient marker mesh meshgradient meshpatch meshrow metadata mpath path pattern polygon polyline radialGradient rect script set solidcolor stop svg switch symbol text textPath title tspan unknown use view`);

  // Elements whose names clash with attributes, under suffixed names.
  export const SvgSuffixedElements: { name: string; tag: string }[] = [
    { name: 'clipPathEl', tag: 'clipPath' },
    { name: 'colorProfileEl', tag: 'color-profile' },
    { name: 'filterEl', tag: 'filter' },
    { name: 'maskEl', tag: 'mask' },
  ];

  // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute

  const SvgAttributeTypes = Object.entries({
    Boolean: names(`externalResourcesRequired preserveAlpha`),
    Int: names(`numOctaves tabindex`),
    Number: names(`accent-height ascent azimuth bias diffuseConstant divisor elevation fr k1 k2 k3 k4 limitingConeAngle overline-position overline-thickness pathLength pointsAtX pointsAtY pointsAtZ refX refY scale seed specularConstant specularExponent strikethrough-position strikethrough-thickness stroke-miterlimit surfaceScale targetX targetY underline-position underline-thickness version`),
    String: names(`cx cy fill-opacity fx fy height markerHeight markerWidth r stroke-dashoffset stroke-opacity stroke-width textLength width x x1 x2 y y1 y2 accumulate additive alignment-baseline attributeName attributeType baseFrequency baseline-shift baseProfile begin calcMode class clipPathUnits clip-path clip-rule color color-interpolation color-interpolation-filters color-profile color-rendering contentScriptType contentStyleType cursor d direction display dominant-baseline dur dx dy edgeMode end fill fill-rule filter filterUnits flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight from gradientTransform gradientUnits href image-rendering in in2 kernelMatrix kernelUnitLength kerning keySplines keyTimes lengthAdjust letter-spacing lighting-color local marker-end marker-mid marker-start markerUnits mask maskContentUnits maskUnits max min mode opacity operator order overflow paint-order patternContentUnits patternTransform patternUnits pointer-events points preserveAspectRatio primitiveUnits radius repeatCount repeatDur requiredFeatures restart result rx ry shape-rendering stdDeviation stitchTiles stop-color stop-opacity stroke stroke-dasharray stroke-linecap stroke-linejoin style text-anchor text-decoration text-rendering to transform type values vector-effect viewBox visibility word-spacing writing-mode xChannelSelector yChannelSelector`),
  });

  // SVG attributes are always set with setAttribute.
  export const SvgAttributes = SvgAttributeTypes.flatMap(([type, list]) =>
    list.map((dom) => ({ name: unhyphenate(dom), dom, type, binding: binding(dom, { type, kind: 'attribute' }) })));

  function unhyphenate(s: string) {
    const parts = s.split('-');
    return parts[0] + parts.slice(1).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  }

  // https://developer.mozilla.org/en-US/docs/Web/CSS/Reference
  // Labels of the row that `style_` checks its record against.
  export const CssProperties: string[] = names(`
    accent-color align-content align-items align-self all animation animation-delay animation-direction
    animation-duration animation-fill-mode animation-iteration-count animation-name animation-play-state
    animation-timing-function appearance aspect-ratio backdrop-filter backface-visibility background
    background-attachment background-blend-mode background-clip background-color background-image
    background-origin background-position background-position-x background-position-y background-repeat
    background-size block-size border border-block border-block-color border-block-end border-block-start
    border-block-style border-block-width border-bottom border-bottom-color border-bottom-left-radius
    border-bottom-right-radius border-bottom-style border-bottom-width border-collapse border-color
    border-end-end-radius border-end-start-radius border-image border-image-outset border-image-repeat
    border-image-slice border-image-source border-image-width border-inline border-inline-color
    border-inline-end border-inline-start border-inline-style border-inline-width border-left
    border-left-color border-left-style border-left-width border-radius border-right border-right-color
    border-right-style border-right-width border-spacing border-start-end-radius border-start-start-radius
    border-style border-top border-top-color border-top-left-radius border-top-right-radius
    border-top-style border-top-width border-width bottom box-decoration-break box-shadow box-sizing
    break-after break-before break-inside caption-side caret-color clear clip clip-path color
    color-scheme column-count column-fill column-gap column-rule column-rule-color column-rule-style
    column-rule-width column-span column-width columns contain container container-name container-type
    content content-visibility counter-increment counter-reset counter-set cursor direction display
    empty-cells fill fill-opacity fill-rule filter flex flex-basis flex-direction flex-flow flex-grow
    flex-shrink flex-wrap float font font-family font-feature-settings font-kerning font-optical-sizing
    font-size font-size-adjust font-stretch font-style font-synthesis font-variant font-variant-caps
    font-variant-numeric font-variation-settings font-weight gap grid grid-area grid-auto-columns
    grid-auto-flow grid-auto-rows grid-column grid-column-end grid-column-start grid-row grid-row-end
    grid-row-start grid-template grid-template-areas grid-template-columns grid-template-rows
    height hyphens image-rendering inline-size inset inset-block inset-block-end inset-block-start
    inset-inline inset-inline-end inset-inline-start isolation justify-content justify-items justify-self
    left letter-spacing line-break line-height list-style list-style-image list-style-position
    list-style-type margin margin-block margin-block-end margin-block-start margin-bottom margin-inline
    margin-inline-end margin-inline-start margin-left margin-right margin-top mask mask-image
    max-block-size max-height max-inline-size max-width min-block-size min-height min-inline-size
    min-width mix-blend-mode object-fit object-position offset opacity order orphans outline
    outline-color outline-offset outline-style outline-width overflow overflow-anchor overflow-wrap
    overflow-x overflow-y overscroll-behavior overscroll-behavior-x overscroll-behavior-y padding
    padding-block padding-block-end padding-block-start padding-bottom padding-inline padding-inline-end
    padding-inline-start padding-left padding-right padding-top page-break-after page-break-before
    page-break-inside perspective perspective-origin place-content place-items place-self pointer-events
    position quotes resize right rotate row-gap scale scroll-behavior scroll-margin scroll-padding
    scroll-snap-align scroll-snap-stop scroll-snap-type scrollbar-color scrollbar-gutter scrollbar-width
    shape-outside stroke stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin
    stroke-miterlimit stroke-opacity stroke-width tab-size table-layout text-align text-align-last
    text-decoration text-decoration-color text-decoration-line text-decoration-style
    text-decoration-thickness text-emphasis text-indent text-justify text-orientation text-overflow
    text-rendering text-shadow text-transform text-underline-offset text-underline-position top
    touch-action transform transform-box transform-origin transform-style transition transition-delay
    transition-duration transition-property transition-timing-function translate unicode-bidi
    user-select vertical-align visibility white-space widows width will-change word-break word-spacing
    word-wrap writing-mode z-index zoom
  `);
}
