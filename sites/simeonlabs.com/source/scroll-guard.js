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
  // Over the demo the wheel and a finger scroll the page, never the chat:
  // it is a picture of the app on a page people are reading, and a chat
  // that swallows the scroll traps them (the founder, 28 September 2026).
  let host = null;
  try { host = window.parent !== window && window.parent.scrollBy ? window.parent : null; } catch { host = null; }
  if (host) {
    const px = (e) => e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      host.scrollBy(0, px(e));
    }, { passive: false, capture: true });
    let lastY = null;
    window.addEventListener("touchstart", (e) => { lastY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true, capture: true });
    window.addEventListener("touchmove", (e) => {
      if (lastY == null || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      e.preventDefault();
      // The window is drawn scaled, so a finger's travel is converted to page pixels.
      let k = 1; try { k = window.frameElement.getBoundingClientRect().height / innerHeight || 1; } catch {}
      host.scrollBy(0, (lastY - y) * k);
      lastY = y;
    }, { passive: false, capture: true });
    window.addEventListener("touchend", () => { lastY = null; }, { passive: true, capture: true });
  }
  const focus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (o) { return focus.call(this, Object.assign({}, o, { preventScroll: true })); };
})();
