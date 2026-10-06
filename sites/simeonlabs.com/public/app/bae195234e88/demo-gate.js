// On the website the laptop hero shows the painting first and raises the app
// window as you scroll; the story should start then, not while it is hidden.
// The page marks the iframe data-hold and calls __simeonStart when it shows.
(() => {
  const demo = window.__simeonDemo;
  if (!demo) return;
  const play = demo.onServing.bind(demo);
  let served = false, started = false;
  const held = () => { try { return !!(window.frameElement && window.frameElement.hasAttribute("data-hold")); } catch { return false; } };
  const go = () => { if (served && !started) { started = true; play(); } };
  demo.onServing = () => { served = true; if (!held()) go(); };
  window.__simeonStart = go;
})();
