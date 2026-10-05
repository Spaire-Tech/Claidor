// The two round glass buttons at the top of the sidebar (the founder, 5 October 2026), in the demo only: search, and
// the create button drawn with the founder's three-line glyph in place of the plus.
(() => {
  const LINES = '<span class="sand-kit-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M8 12h8M10.5 16h3"/></svg></span>';
  const put = () => {
    const actions = document.querySelector('.sand-agents-sidebar__new-actions');
    if (!actions) return;
    const plus = actions.querySelector('.sand-kit-icon-button:not(.simeon-sidebar-search)');
    if (!plus) return;
    if (!plus.classList.contains('simeon-sidebar-create')) { plus.classList.add('simeon-sidebar-create'); plus.innerHTML = LINES; }
    if (!actions.querySelector('.simeon-sidebar-search')) {
      const search = document.createElement('button');
      search.type = 'button';
      search.className = plus.className.replace('simeon-sidebar-create', '') + ' simeon-sidebar-search';
      search.setAttribute('aria-label', 'Search');
      search.innerHTML = '<span class="sand-kit-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></span>';
      actions.insertBefore(search, plus);
    }
  };
  put();
  new MutationObserver(put).observe(document.documentElement, { childList: true, subtree: true });
})();
