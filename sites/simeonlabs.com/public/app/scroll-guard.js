// Embedded in a page, the window must never scroll that page. The pinned
// renderer calls scrollIntoView to follow new messages, and in an iframe
// that also scrolls every ancestor, the host page included; focus() does the
// same. Here both only ever move the element's own nearest scroller.
(() => {
  if (window.top === window) return;
  const scrollerOf = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|overlay)/.test(s.overflowY + " " + s.overflowX) &&
          (p.scrollHeight > p.clientHeight || p.scrollWidth > p.clientWidth)) return p;
    }
    return null;
  };
  Element.prototype.scrollIntoView = function (arg) {
    const sc = scrollerOf(this);
    if (!sc) return;
    const o = arg && typeof arg === "object" ? arg : { block: arg === false ? "end" : "start" };
    const r = this.getBoundingClientRect(), c = sc.getBoundingClientRect();
    let top = sc.scrollTop;
    const block = o.block || "start";
    if (block === "start") top += r.top - c.top;
    else if (block === "end") top += r.bottom - c.bottom;
    else if (block === "center") top += r.top + r.height / 2 - (c.top + c.height / 2);
    else if (r.top < c.top) top += r.top - c.top;
    else if (r.bottom > c.bottom) top += r.bottom - c.bottom;
    sc.scrollTo({ top, behavior: o.behavior === "smooth" ? "smooth" : "auto" });
  };
  if (Element.prototype.scrollIntoViewIfNeeded) {
    Element.prototype.scrollIntoViewIfNeeded = function () { this.scrollIntoView({ block: "nearest" }); };
  }
  // The wheel and a finger never reach this window: the page gives it pointer-events:none, so
  // they scroll the page on the browser's scroll thread (28 September 2026, "zero lag").
  // The page pauses this window's frame loop while it scrolls or while the window is out of
  // sight (__sdFreeze), so the app's animations never take a frame from the page. Callbacks
  // asked for meanwhile run together on the first frame after it resumes.
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  const held = new Map();
  let frozen = false, nextId = 0;
  window.requestAnimationFrame = (cb) => { if (!frozen) return raf(cb); const id = --nextId; held.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { if (id < 0) held.delete(id); else caf(id); };
  window.__sdFreeze = (on) => {
    if (on === frozen) return;
    frozen = on;
    if (!on && held.size) { const cbs = [...held.values()]; held.clear(); raf((t) => { for (const cb of cbs) cb(t); }); }
  };
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (o) { return focus.call(this, Object.assign({}, o, { preventScroll: true })); };
})();
