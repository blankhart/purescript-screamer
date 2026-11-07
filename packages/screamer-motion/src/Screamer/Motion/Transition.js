// @ts-ignore: purs copies this file to output/Screamer.Motion.Transition/foreign.js, next to the runtime's.
import * as runtime from '../Screamer.Runtime.Unsafe/foreign.js';
const R = runtime;
const ELEMENT = 1;
const DURATION = '--screamer-duration';
const noop = () => { };
const words = (s) => s.split(/\s+/).filter((w) => w.length > 0);
function addClasses(el, s) {
    const w = words(s);
    if (w.length > 0)
        el.classList.add(...w);
}
function removeClasses(el, s) {
    const w = words(s);
    if (w.length > 0)
        el.classList.remove(...w);
}
/** The frames, timer and listeners of one transition, cancelled together. */
class Steps {
    constructor(h) {
        this.h = h;
        this.cancels = [];
    }
    frame(f) {
        this.cancels.push(this.h.requestFrame(() => () => R.batch(f))());
    }
    /**
     * Run `f` two frames from now: the styles set before have then been
     * rendered once, so a change made in `f` transitions from them.
     */
    afterPaint(f) {
        this.frame(() => this.frame(f));
    }
    /** Run `f` once, at the first of `el`'s own end events and `ms` from now. */
    end(el, ms, f) {
        let ended = false;
        const finish = (e) => {
            if (ended || (e !== undefined && e.target !== el))
                return;
            ended = true;
            this.cancel();
            R.batch(f);
        };
        el.addEventListener('transitionend', finish);
        el.addEventListener('animationend', finish);
        this.cancels.push(() => {
            el.removeEventListener('transitionend', finish);
            el.removeEventListener('animationend', finish);
        });
        this.cancels.push(this.h.setTimeout(ms)(() => finish())());
    }
    cancel() {
        const cs = this.cancels;
        this.cancels = [];
        for (let i = 0; i < cs.length; i++)
            cs[i]();
    }
}
const setDuration = (el, ms) => el.style.setProperty(DURATION, `${ms}ms`);
const clearDuration = (el) => el.style.removeProperty(DURATION);
/**
 * Apply `from` and `active`, then after a paint swap `from` for `to`, and at
 * the end call `ended`. `clear` removes all three and the duration.
 */
function phase(h, el, p, ms, ended) {
    const steps = new Steps(h);
    const clear = () => {
        removeClasses(el, p.from);
        removeClasses(el, p.active);
        removeClasses(el, p.to);
        clearDuration(el);
    };
    setDuration(el, ms);
    addClasses(el, p.from);
    addClasses(el, p.active);
    steps.afterPaint(() => {
        removeClasses(el, p.from);
        addClasses(el, p.to);
        steps.end(el, ms, ended);
    });
    return { steps, clear };
}
export const cssEnterImpl = (h) => (p) => (ms) => (node) => () => {
    if (node.nodeType !== ELEMENT)
        return noop;
    const t = phase(h, node, p, ms, () => t.clear());
    return () => {
        t.steps.cancel();
        t.clear();
    };
};
export const cssLeaveImpl = (h) => (p) => (ms) => (node) => (done) => () => {
    if (node.nodeType !== ELEMENT) {
        done();
        return noop;
    }
    const t = phase(h, node, p, ms, done);
    return () => {
        t.steps.cancel();
        t.clear();
    };
};
/**
 * FLIP with a class: put the element back where it was with an inline
 * transform, then after a paint add the class and remove the transform, so
 * the class's `transition` moves it to where it is now.
 */
export const cssMoveImpl = (h) => (cls) => (ms) => (m) => () => {
    const el = m.node;
    const dx = m.before.left - m.after.left;
    const dy = m.before.top - m.after.top;
    if (dx === 0 && dy === 0)
        return noop;
    const steps = new Steps(h);
    const clear = () => {
        removeClasses(el, cls);
        clearDuration(el);
        el.style.removeProperty('transform');
        el.style.removeProperty('transition-duration');
    };
    el.style.setProperty('transform', `translate(${dx}px, ${dy}px)`);
    el.style.setProperty('transition-duration', '0s');
    steps.afterPaint(() => {
        addClasses(el, cls);
        setDuration(el, ms);
        el.style.removeProperty('transform');
        el.style.removeProperty('transition-duration');
        steps.end(el, ms, clear);
    });
    return () => {
        steps.cancel();
        clear();
    };
};
export const fadeLook = { opacity: '0' };
export const slideLook = (axis) => ({ opacity: '0', transform: `translate${axis}(-100%)` });
function transitionOf(look, ms) {
    return Object.keys(look).map((p) => `${p} ${ms}ms ease`).join(', ');
}
function setLook(el, look) {
    for (const p in look)
        el.style.setProperty(p, look[p]);
}
function clearLook(el, look) {
    for (const p in look)
        el.style.removeProperty(p);
    el.style.removeProperty('transition');
}
export const styleEnterImpl = (h) => (look) => (ms) => (node) => () => {
    if (node.nodeType !== ELEMENT)
        return noop;
    const el = node;
    const steps = new Steps(h);
    setLook(el, look);
    el.style.setProperty('transition', transitionOf(look, ms));
    steps.afterPaint(() => {
        for (const p in look)
            el.style.removeProperty(p);
        steps.end(el, ms, () => clearLook(el, look));
    });
    return () => {
        steps.cancel();
        clearLook(el, look);
    };
};
export const styleLeaveImpl = (h) => (look) => (ms) => (node) => (done) => () => {
    if (node.nodeType !== ELEMENT) {
        done();
        return noop;
    }
    const el = node;
    const steps = new Steps(h);
    el.style.setProperty('transition', transitionOf(look, ms));
    steps.afterPaint(() => {
        setLook(el, look);
        steps.end(el, ms, done);
    });
    return () => {
        steps.cancel();
        clearLook(el, look);
    };
};
