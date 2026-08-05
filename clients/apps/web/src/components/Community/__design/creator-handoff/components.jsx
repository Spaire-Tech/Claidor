/* ============================================================
   SPAIRE — shared components & icon set
   ============================================================ */
const { useState, useRef, useEffect, useLayoutEffect, useCallback } = React;

/* ---------- Icon set (Lucide-style, 1.8 stroke) ---------- */
const PATHS = {
  feed: '<path d="M3 5h18M3 12h18M3 19h12"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  community: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 3.5a3 3 0 0 1 0 6"/><path d="M18 14.5c2.2.6 3.5 2.2 3.5 4.5"/>',
  events: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  directory: '<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/>',
  bell: '<path d="M18 8.5a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5"/><path d="M10.5 20a1.8 1.8 0 0 0 3 0"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.5 7.2L4 20.5l1.3-5.5A8 8 0 1 1 21 12Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.3 2-2.3 3.5"/><circle cx="12" cy="17.5" r=".6" fill="currentColor" stroke="none"/>',
  bookmark: '<path d="M6 4.5h12v16l-6-4-6 4z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  caretUp: '<path d="m6 15 6-6 6 6"/>',
  caretRight: '<path d="m9 6 6 6-6 6"/>',
  hand: '<path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11m0-1V3.5a1.5 1.5 0 0 1 3 0V11m0-.5V5a1.5 1.5 0 0 1 3 0v7.5c0 4-2.5 7.5-6.5 7.5-2.5 0-4-1-5.3-3L6 17c-.7-1-1-2.2.2-2.8 1-.5 1.8.2 2.3 1l.5.8"/>',
  message: '<path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.5A8 8 0 1 1 21 11.5Z"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 8.5A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7.5 15h9"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 3.5a3 3 0 0 1 0 6"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 3 2.4M17 6h2.5a2.5 2.5 0 0 1-3 2.4M9.5 20h5M12 13v3.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5V20.5"/>',
  rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 11a13 13 0 0 1 9-8 13 13 0 0 1-8 9l-3 1-2-2z"/><circle cx="14.5" cy="9.5" r="1.3"/>',
  pin: '<path d="M9 4h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 15v5"/>',
  heart: '<path d="M12 20s-7-4.3-9.2-9C1.3 8 3 4.5 6.5 4.5c2 0 3.2 1.2 3.5 1.8.3-.6 1.5-1.8 3.5-1.8 3.5 0 5.2 3.5 3.7 6.5C19 15.7 12 20 12 20Z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 15V3m0 0 4 4m-4-4-4 4"/>',
  dots: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  dotsV: '<circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none"/>',
  comment: '<path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.5A8 8 0 1 1 21 11.5Z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><circle cx="9" cy="10" r=".7" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r=".7" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 3v4M16 3v4"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10 5-3v10l-5-3z"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m3 16 5-4 4 3 3-2 6 5"/>',
  link: '<path d="M9.5 14.5 14.5 9.5"/><path d="M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2"/>',
  paperclip: '<path d="M20 11.5 11.5 20a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.3 4.3l-7.8 7.8a1.5 1.5 0 0 1-2.2-2.1l7-7"/>',
  send: '<path d="M21 3 3 11l7 2.5L13 21l8-18Z"/><path d="m10 13.5 3.5-3.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 6.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.3 2.3 4.7-4.7"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  eyeOff: '<path d="M3 3l18 18M10.5 6.3A8.6 8.6 0 0 1 12 6c5 0 9 6 9 6a16 16 0 0 1-2.6 3M6.3 8.3A16 16 0 0 0 3 12s4 6 9 6a8.6 8.6 0 0 0 3.3-.7"/><path d="M9.9 10.1a3 3 0 0 0 4 4"/>',
  eye: '<path d="M2.5 12S6.5 5.5 12 5.5 21.5 12 21.5 12 17.5 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  download: '<path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 0 1 0-4h.2A1.6 1.6 0 0 0 4.3 7.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 0 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1Z"/>',
  drag: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrowLeft: '<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 3 2 3H5"/>',
  star: '<path d="M12 4l2.3 4.8 5.2.7-3.8 3.7.9 5.3-4.6-2.5-4.6 2.5.9-5.3L4.5 9.5l5.2-.7z"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  bolt: '<path d="M13 3 4 14h6l-1 7 9-11h-6z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1Z"/><path d="M18 9a3 3 0 0 1 0 6"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  thumbUp: '<path d="M7 10.5V19a1 1 0 0 1-1 1H4.2a1 1 0 0 1-1-1v-7.5a1 1 0 0 1 1-1H7Z"/><path d="M7 10.5 11 3.2A2 2 0 0 1 14.5 4.6V8.5h4.7a2 2 0 0 1 2 2.35l-1.15 6.5A2 2 0 0 1 18.1 20H7"/>',
  reply: '<path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 5 5v1"/>',
};
function Icon({ name, size = 19, stroke = 1.8, color, style, className }) {
  const d = PATHS[name] || '';
  return React.createElement('svg', {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color || 'currentColor', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round',
    style, className, dangerouslySetInnerHTML: { __html: d },
  });
}

/* ---------- Avatar ---------- */
function Avatar({ name, size = 40, src, ring }) {
  const [failed, setFailed] = useState(false);
  const photo = src || (window.PHOTOS && window.PHOTOS[name]);
  const st = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  const ringStyle = ring ? { boxShadow: '0 0 0 2px #fff, 0 0 0 3.5px var(--brand-200)' } : {};
  if (photo && !failed) {
    return <div className="av" style={{ ...st, ...ringStyle, background: window.avColor(name) }}>
      <img className="av-img" src={photo} alt="" loading="lazy" onError={() => setFailed(true)}/>
    </div>;
  }
  return <div className="av" style={{ ...st, ...ringStyle, background: window.avColor(name) }}>{window.initials(name)}</div>;
}
function AvStack({ names, size = 30, max = 3, extra }) {
  const shown = names.slice(0, max);
  const more = (extra != null ? extra : names.length) - shown.length;
  return (
    <div className="av-stack">
      {shown.map((n,i)=><div key={i} style={{ marginLeft: i?-9:0, position:'relative', zIndex: max-i }}><Avatar name={n} size={size}/></div>)}
      {more > 0 && <div className="av-more" style={{ height:size, minWidth:size, fontSize:Math.round(size*0.36) }}>+{more}</div>}
    </div>
  );
}

/* ---------- Badge ---------- */
function Badge({ kind, children }) {
  const cls = { Admin:'badge-admin', Team:'badge-team', Moderator:'badge-mod', soft:'badge-soft' }[kind] || 'badge-soft';
  return <span className={`badge ${cls}`}>{kind==='Team' && <Icon name="check" size={11} stroke={2.4}/>}{children || kind}</span>;
}

/* ---------- Toggle ---------- */
function Toggle({ on, onChange }) {
  return <button className={`toggle ${on?'on':''}`} onClick={()=>onChange(!on)} aria-pressed={on}/>;
}

/* ---------- Dropdown menu ---------- */
function useClickOutside(ref, onClose, active) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [active, onClose]);
}
function Menu({ open, onClose, children, align='right', top='calc(100% + 6px)' }) {
  const ref = useRef();
  useClickOutside(ref, onClose, open);
  if (!open) return null;
  const pos = align==='right' ? { right: 0 } : { left: 0 };
  return <div className="menu fade-in" ref={ref} style={{ ...pos, top }}>{children}</div>;
}
function MenuItem({ icon, children, onClick, danger }) {
  return <button className={`menu-item ${danger?'danger':''}`} onClick={onClick}>{icon && <span className="mi-ico"><Icon name={icon} size={17}/></span>}{children}</button>;
}

/* ---------- Reaction bar ---------- */
function ReactionBar({ reactions, myReactions, onToggle, enabled = true }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useClickOutside(ref, ()=>setOpen(false), open);
  if (!enabled) return null;
  const entries = window.REACTION_SET.filter(r => (reactions[r.key]||[]).length > 0);
  return (
    <div className="reactions" ref={ref} style={{ position:'relative' }}>
      {entries.map(r => {
        const list = reactions[r.key] || [];
        const mine = (myReactions||[]).includes(r.key);
        return <button key={r.key} className={`rx-pill ${mine?'mine':''}`} onClick={()=>onToggle(r.key)} title={list.slice(0,6).join(', ')+(list.length>6?` +${list.length-6}`:'')}>
          <span className="emoji">{r.emoji}</span>{list.length}
        </button>;
      })}
      <button className="rx-add" onClick={()=>setOpen(o=>!o)} aria-label="Add reaction"><Icon name="smile" size={17}/></button>
      {open && (
        <div className="rx-popover">
          {window.REACTION_SET.map(r => (
            <button key={r.key} title={r.label} onClick={()=>{ onToggle(r.key); setOpen(false); }}>{r.emoji}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Toast system ---------- */
const ToastCtx = React.createContext(()=>{});
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((msg, icon='check') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, icon }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => <div className="toast" key={t.id}><span className="tk"><Icon name={t.icon} size={17} stroke={2.4}/></span>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => React.useContext(ToastCtx);

/* ---------- Modal shell ---------- */
function Modal({ title, onClose, children, footer, wide, headRight }) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, []);
  return (
    <div className="overlay" onMouseDown={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className={`modal ${wide?'wide':''}`}>
        <div className="modal-head">
          <h2>{title}</h2>
          {headRight}
          <button className="x-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- small helpers ---------- */
function Segmented({ options, value, onChange }) {
  return <div className="segmented">{options.map(o => <button key={o.value} className={value===o.value?'active':''} onClick={()=>onChange(o.value)}>{o.label}</button>)}</div>;
}
function moduleName(id) { const m = window.MODULES.find(x=>x.id===id); return m ? `Module ${m.n}` : null; }
function moduleFull(id) { const m = window.MODULES.find(x=>x.id===id); return m ? `Module ${m.n} · ${m.title}` : null; }

Object.assign(window, {
  Icon, Avatar, AvStack, Badge, Toggle, Menu, MenuItem, ReactionBar,
  ToastProvider, useToast, Modal, Segmented, useClickOutside,
  moduleName, moduleFull,
});
