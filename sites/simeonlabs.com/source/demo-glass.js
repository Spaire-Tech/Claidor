// The two round glass buttons at the top of the sidebar (the founder, 5 October 2026), in the demo only: search, and
// the create button drawn with the founder's compose glyph (a square and a pencil) in place of the plus.
(() => {
  const LINES = '<span class="sand-kit-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V12M18.3 3.7a1.9 1.9 0 0 1 2.7 2.7L13 14.4l-3.6.9.9-3.6z"/></svg></span>';
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
  // The agent's pane opens by itself the first time the chat header is up (the founder, 5 October 2026); closing it afterwards sticks.
  let opened = false;
  const open = () => {
    if (opened) return;
    const identity = document.querySelector('.sand-chat-header__identity');
    const pane = document.querySelector('.sand-info-pane');
    if (!identity || !pane || pane.getAttribute('data-open') === 'true') return;
    opened = true;
    identity.click();
  };
  const tick = () => { put(); open(); };
  tick();
  new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
})();
