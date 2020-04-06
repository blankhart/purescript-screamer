export namespace codegen {

  export type ValueType =
    | 'boolean'
    | 'int'
    | 'number'
    | 'string'
    | 'effect'
    ;

  // https://pursuit.purescript.org/packages/purescript-dom-classy/2.2.0/docs/DOM.Classy.Event
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

  // This will need to have multiple EventClass superclasses due to synthetic superclasses.  E.g.,
  // * to express dataTransfer as a property both of InputEvent and DragEvent
  // * to express event target values (for example of an InputEvent)
  // These may be more natural as separate types with conversions.
  // There are also issues with shiftKey, which applies to both MouseEvent and KeyboardEvent and TouchEvent
  // Both HTML and SVG allow <style> tags, which are ignored
  // Svg "mask" is both en element and then an attribute that references the element
  // Not generating IsEvent instances
  export const EventClassImplies: Record<EventClass, EventClass | null> = {
    Animation: 'Event',
    Clipboard: 'Event',
    Composition: 'Ui',
    Drag: 'Mouse',
    Event: null,
    Focus: 'Ui',
    Input: 'Ui',
    Keyboard: 'Ui',
    Mouse: 'Ui',
    Pointer: 'Mouse',
    Touch: 'Ui',
    Transition: 'Event',
    Ui: 'Event',
    Wheel: 'Mouse',
  };

  export const EventClassFields: Record<EventClass, Record<string, ValueType>> = {
    Animation: {
      animationName: 'string',
      elapsedTime: 'number',
      //      pseudoElement: 'string',
    },
    Clipboard: {},
    Composition: {},
    Drag: {
      // dataTransfer, overloaded with Input
    },
    Event: {
      bubbles: 'boolean',
      cancelable: 'boolean',
      defaultPrevented: 'boolean',
      preventDefault: 'effect',
      stopImmediatePropagation: 'effect',
      stopPropagation: 'effect',
      timeStamp: 'number',
      type: 'string',
    },
    Focus: {},
    Input: {
      data: 'string',
      // dataTransfer, overloaded with Drag
      inputType: 'string',
      isComposing: 'boolean',
    },
    Keyboard: {
      altKey: 'boolean',
      charCode: 'number',
      code: 'string',
      ctrlKey: 'boolean',
      key: 'string',
      keyCode: 'number',
      location: 'number',
      metaKey: 'boolean',
      repeat: 'boolean',
      shiftKey: 'boolean',
      // which: ... deprecated
    },
    Mouse: {
      // altKey: 'boolean',
      button: 'number',
      buttons: 'number',
      clientX: 'number',
      clientY: 'number',
      // ctrlKey: 'boolean',
      layerX: 'number',
      layerY: 'number',
      // metaKey: 'boolean',
      movementX: 'number',
      movementY: 'number',
      offsetX: 'number',
      offsetY: 'number',
      pageX: 'number',
      pageY: 'number',
      screenX: 'number',
      screenY: 'number',
      //      shiftKey: 'boolean',
      which: 'number',
      x: 'number',
      y: 'number',
    },
    Pointer: {
      height: 'number',
      isPrimary: 'boolean',
      pointerId: 'number',
      pointerType: 'string',
      pressure: 'number',
      tangentialPressure: 'number',
      tiltX: 'number',
      tiltY: 'number',
      twist: 'number',
      width: 'number',
    },
    Touch: {
      // altKey: 'boolean',
      // ctrlKey: 'boolean',
      // metaKey: 'boolean',
      //      shiftKey: 'boolean',
    },
    Transition: {
      // elapsedTime: 'number',
      propertyName: 'string',
      pseudoElement: 'string',
    },
    Ui: {
      detail: 'number',
    },
    Wheel: {
      deltaMode: 'number',
      deltaX: 'number',
      deltaY: 'number',
      deltaZ: 'number',
    },
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

  function* superclasses(e: EventClass) {
    let s = EventClassImplies[e];
    if (s) {
      yield s;
      e = s;
    } else {
      return;
    }
  };

  export let EventHandlers = Object.entries(EventClassHandlers)
    .map(([event_class, event_handlers]) => {
      return { event_class, event_handlers };
    });

  export let EventClasses = Object.entries(EventClassFields)
    .map(([eventClass, fields]) => {
      return {
        event_class: eventClass,
        event_superclasses: [...superclasses(eventClass as EventClass)],
        event_fields: Object.entries(fields)
          .filter(([k, v]) => v !== 'effect')
          .map(([k, v]) => { return { field: k, value: v }; }),
        event_effects: Object.entries(fields)
          .filter(([k, v]) => v === 'effect')
          .map(([k, v]) => { return { field: k, value: v }; }),
      };
    });

  // https://html.spec.whatwg.org/multipage/indices.html#attributes-3
  export const Attributes: Record<string, ValueType | 'record'> = {
    abbr: 'string',
    accept: 'string',
    accept_charset: 'string',
    accesskey: 'string',
    action: 'string',
    allow: 'string',
    allowfullscreen: 'boolean',
    allowpaymentrequest: 'boolean',
    alt: 'string',
    as: 'string',
    async: 'boolean',
    autocapitalize: 'string',
    autocomplete: 'boolean',
    autofocus: 'boolean',
    autoplay: 'boolean',
    charset: 'string',
    checked: 'boolean',
    cite: 'string',
    class: 'string',
    color: 'string',
    cols: 'int',
    colspan: 'int',
    content: 'string',
    contenteditable: 'boolean',
    controls: 'boolean',
    coords: 'string',
    crossorigin: 'string',
    data: 'string',
    datetime: 'string',
    decoding: 'string',
    default: 'boolean',
    defer: 'boolean',
    dir: 'string',
    dirname: 'string',
    disabled: 'boolean',
    download: 'string',
    draggable: 'boolean',
    enctype: 'string',
    enterkeyhint: 'string',
    for: 'string',
    form: 'string',
    formaction: 'string',
    formenctype: 'string',
    formmethod: 'string',
    formnovalidate: 'boolean',
    formtarget: 'string',
    headers: 'string',
    height: 'string',
    hidden: 'boolean',
    high: 'number',
    href: 'string',
    hreflang: 'string',
    http_equiv: 'string',
    id: 'string',
    inputmode: 'string',
    integrity: 'string',
    is: 'string',
    ismap: 'boolean',
    itemid: 'string',
    itemprop: 'string',
    itemref: 'string',
    itemscope: 'boolean',
    itemtype: 'string',
    kind: 'string',
    label: 'string',
    lang: 'string',
    list: 'string',
    loop: 'boolean',
    low: 'number',
    manifest: 'string',
    max: 'number',
    maxlength: 'string',
    media: 'string',
    method: 'string',
    min: 'number',
    minlength: 'int',
    multiple: 'boolean',
    muted: 'boolean',
    name: 'string',
    nomodule: 'boolean',
    nonce: 'string',
    novalidate: 'boolean',
    open: 'boolean',
    optimum: 'number',
    pattern: 'string',
    ping: 'string',
    placeholder: 'string',
    playsinline: 'boolean',
    poster: 'string',
    preload: 'string',
    readonly: 'boolean',
    referrerpolicy: 'string',
    rel: 'string',
    required: 'boolean',
    reversed: 'boolean',
    rows: 'int',
    rowspan: 'int',
    sandbox: 'string',
    scope: 'string',
    selected: 'boolean',
    shape: 'string',
    size: 'int',
    sizes: 'string',
    slot: 'string',
    //    span: 'int',
    spellcheck: 'boolean',
    src: 'string',
    srcdoc: 'string',
    srclang: 'string',
    srcset: 'string',
    start: 'int',
    step: 'number',
    //    style: 'record',
    tabindex: 'int',
    target: 'string',
    title: 'string',
    translate: 'boolean',
    type: 'string',
    typemustmatch: 'boolean',
    usemap: 'string',
    value: 'string',
    width: 'int',
    wrap: 'string',
  };

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
    .replace(/\n/, ' ')
    .split(' ')
    .filter(s => s.trim() !== ``);

  // https://developer.mozilla.org/en-US/docs/Web/SVG/Element

  export const SvgElements: string[] = names(`a animate animateMotion animateTransform circle defs desc discard ellipse feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence foreignObject g hatch hatchpath image line linearGradient marker mesh meshgradient meshpatch meshrow metadata mpath path pattern polygon polyline radialGradient rect script set solidcolor stop svg switch symbol text textPath title tspan unknown use view`);
  // TODO: Add back `mask` and `filter`
  // TODO: Add back `color-profile`?
  // TODO: Add back `clipPath` which conflicts with attribute `clip-path`

  // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute

  export const SvgAttributes = Object.entries({
    boolean: names(`externalResourcesRequired preserveAlpha`),
    int: names(`numOctaves tabindex`),
    number: names(`accent-height ascent azimuth bias diffuseConstant divisor elevation fr k1 k2 k3 k4 limitingConeAngle overline-position overline-thickness pathLength pointsAtX pointsAtY pointsAtZ refX refY scale seed specularConstant specularExponent strikethrough-position strikethrough-thickness stroke-miterlimit surfaceScale targetX targetY underline-position underline-thickness version`),
    string: names(`cx cy fill-opacity fx fy height markerHeight markerWidth r stroke-dashoffset stroke-opacity stroke-width textLength width x x1 x2 y y1 y2 accumulate additive alignment-baseline attributeName attributeType baseFrequency baseline-shift baseProfile begin calcMode class clipPathUnits clip-path clip-rule color color-interpolation color-interpolation-filters color-profile color-rendering contentScriptType contentStyleType cursor d direction display dominant-baseline dur dx dy edgeMode end fill fill-rule filter filterUnits flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight from gradientTransform gradientUnits href image-rendering in in2 kernelMatrix kernelUnitLength kerning keySplines keyTimes lengthAdjust letter-spacing lighting-color local marker-end marker-mid marker-start markerUnits mask maskContentUnits maskUnits max min mode opacity operator order overflow paint-order patternContentUnits patternTransform patternUnits pointer-events points preserveAspectRatio primitiveUnits radius repeatCount repeatDur requiredFeatures restart result rx ry shape-rendering stdDeviation stitchTiles stop-color stop-opacity stroke stroke-dasharray stroke-linecap stroke-linejoin style text-anchor text-decoration text-rendering to transform type values vector-effect viewBox visibility word-spacing writing-mode xChannelSelector yChannelSelector`),
  }).map(([v, k]) => {
    return { names: k, value: v };
  });


}
