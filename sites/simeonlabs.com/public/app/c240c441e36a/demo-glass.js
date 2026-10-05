// A search button beside the plus at the top of the sidebar (the founder, 5 October 2026), in the demo only.
(() => {
  const put = () => {
    const actions = document.querySelector('.sand-agents-sidebar__new-actions');
    if (!actions || actions.querySelector('.simeon-sidebar-search')) return;
    const plus = actions.querySelector('.sand-kit-icon-button');
    if (!plus) return;
    const search = document.createElement('button');
    search.type = 'button';
    search.className = plus.className + ' simeon-sidebar-search';
    search.setAttribute('aria-label', 'Search');
    search.innerHTML = '<span class="sand-kit-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg></span>';
    actions.insertBefore(search, plus);
  };
  put();
  new MutationObserver(put).observe(document.documentElement, { childList: true, subtree: true });
})();
