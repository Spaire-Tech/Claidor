/* ============================================================
   SPAIRE ORIGINALS — Community · CREATOR console
   The creator authors a small set of high-leverage choices:
   the prompt (the unit of work members make), what they submit,
   the rhythm, the framing line, and the live moments that give
   the work its stakes. Members never see these controls.
   Restraint over chrome — one ink, grey, one accent, hairlines.
   ============================================================ */
const { useState: us, useEffect: ue, useRef: ur, useCallback: uc } = React;
const G = window.CGlyph, SF = window.CSF, C = window.COMMUNITY, HOST = window.CHOST, PPL = window.CPPL;
const UN = (id, w=900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

const CR = {
  chevR: 'M9 6l6 6-6 6',
  back: 'M15 5l-7 7 7 7',
  chevU: 'M6 15l6-6 6 6',
  chevD: 'M6 9l6 6 6-6',
  trash: 'M5 7h14 M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13 M10 11v6 M14 11v6',
  spark: 'M12 3.2l1.7 5.6 5.6 1.7-5.6 1.7L12 17.8l-1.7-5.6L4.7 10.5l5.6-1.7Z M18.5 14.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z',
  link: 'M9.5 13.5 14.5 8.5 M8 11 6 13a3 3 0 0 0 4.2 4.2l2-2 M16 13l2-2a3 3 0 0 0-4.2-4.2l-2 2',
  doc: 'M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M13.5 3v5h4.5',
  grid: 'M4 4h7v7H4Z M13 4h7v7h-7Z M4 13h7v7H4Z M13 13h7v7h-7Z',
  star: 'M12 3.6l2.5 5.4 5.9.6-4.4 4 1.2 5.8L12 16.9l-5.2 2.5 1.2-5.8-4.4-4 5.9-.6Z',
  lock: 'M7 10V8a5 5 0 0 1 10 0v2 M6 10h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z M12 14v3',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  video: 'M3 7.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z M15 11l6-3.6v9.2L15 13',
  poll: 'M6 20v-5 M12 20V8 M18 20v-9',
  smiley: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8.5 10.5h.01 M15.5 10.5h.01 M8.5 14.5s1.4 2 3.5 2 3.5-2 3.5-2',
  calendar: 'M7 4v3 M17 4v3 M4 9h16 M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
};

/* ---------- rotation date math + a 1s ticker (live countdowns) ---------- */
const DAY = 86400000;
const _iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY_ISO = _iso(new Date());
const START_ISO = _iso(new Date(Date.now() - 2 * DAY)); /* 2 days back so the first brief is live in the demo */
const intervalDays = (c) => ({ Weekly: 7, Biweekly: 14, Monthly: 30 }[c] || 7);
const cadenceCopy = (c) => ({ Weekly: 'A fresh activity every week.', Biweekly: 'A fresh activity every two weeks.', Monthly: 'A fresh activity every month.' }[c] || '');
function parseISO(iso) { const [y, m, d] = (iso || TODAY_ISO).split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
function winFor(rot, i) { const int = intervalDays(rot.cadence) * DAY; const s = parseISO(rot.start) + i * int; return { s, e: s + int }; }
function activeIndex(rot) {
  const n = rot.challenges.length; if (!n) return -1; const now = Date.now();
  for (let i = 0; i < n; i++) { const { s, e } = winFor(rot, i); if (now >= s && now < e) return i; }
  return now < winFor(rot, 0).s ? 0 : n - 1;
}
function fmtRange(s, e) {
  const o = { month: 'short', day: 'numeric' };
  return `${new Date(s).toLocaleDateString('en-US', o)} – ${new Date(e - DAY).toLocaleDateString('en-US', o)}`;
}
function countdown(to) {
  const ms = to - Date.now(); if (ms <= 0) return '—';
  const d = Math.floor(ms / DAY), h = Math.floor(ms % DAY / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}
function useTick(ms = 1000) { const [, f] = us(0); ue(() => { const id = setInterval(() => f(x => x + 1), ms); return () => clearInterval(id); }, [ms]); }

/* ---------- activity ring (checklist) ---------- */
function Ring({ pct, size = 92, stroke = 9, label, sub }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke}/>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${mid} ${mid})`} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.3,1,.3,1)' }}/>
      </svg>
      {label != null && <div className="ring-c"><b>{label}</b>{sub && <span>{sub}</span>}</div>}
    </div>
  );
}

/* ---------- atoms ---------- */
function Field({ label, hint, children }) {
  return <div className="field"><label>{label}</label>{children}{hint && <div className="hint">{hint}</div>}</div>;
}
function Seg({ value, options, onChange, wide }) {
  const wrapRef = ur();
  const [thumb, setThumb] = us({ left: 0, width: 0, ready: false });
  const measure = uc(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const idx = Math.max(0, options.indexOf(value));
    const btn = wrap.querySelectorAll('.seg-btn')[idx];
    if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth, ready: true });
  }, [value, options]);
  ue(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);
  return (
    <div ref={wrapRef} className={`seg-ctl${wide ? ' wide' : ''}`}>
      <span className="seg-thumb" style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width, opacity: thumb.ready ? 1 : 0 }}></span>
      {options.map(o => <button key={o} className={`seg-btn${value === o ? ' on' : ''}`} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}
function Toggle({ on, onClick }) { return <button className={`tog${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on}></button>; }

/* ---------- real image upload (file picker + drag/drop) ---------- */
function readImg(file, cb) { if (!file || !file.type.startsWith('image/')) return; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file); }
function useFilePick(onFile) {
  const ref = ur();
  const node = <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { readImg(e.target.files[0], onFile); e.target.value = ''; }}/>;
  return [() => ref.current && ref.current.click(), node];
}
/* parse the Y percentage out of an object-position string */
function posY(pos) { const m = /(\d+(?:\.\d+)?)%\s*$/.exec(pos || ''); return m ? parseFloat(m[1]) : 50; }
function CoverDrop({ src, onFile, pos, onPos }) {
  const ref = ur();
  const [openPick, input] = useFilePick(onFile);
  const [drag, setDrag] = us(false);
  const dd = ur(null);
  const canPos = src && onPos;
  const move = (e) => { const s = dd.current; if (!s) return; const dy = e.clientY - s.y; if (Math.abs(dy) > 3) s.moved = true; if (s.moved && canPos) { const pct = Math.max(0, Math.min(100, s.base - dy / s.h * 100)); onPos(`center ${pct}%`); } };
  const up = () => { const s = dd.current; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (s && !s.moved) openPick(); dd.current = null; };
  const down = (e) => { if (e.button) return; dd.current = { y: e.clientY, base: posY(pos), h: ref.current.offsetHeight || 200, moved: false }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  return (
    <div ref={ref} className={`cover-drop${drag ? ' drag' : ''}${canPos ? ' repos' : ''}`} onPointerDown={down}
      onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); readImg(e.dataTransfer.files[0], onFile); }}>
      {src ? <img src={src} alt="" style={{ objectPosition: pos || 'center' }} draggable={false}/> : <div className="cover-empty"><G d={SF.image} size={26} stroke={1.7}/><span style={{ fontSize: 13, fontWeight: 600 }}>Add a cover</span></div>}
      <div className="cover-over"><G d={SF.image} size={22} stroke={1.8}/><span className="cv-verb">{src ? 'Click to replace' : 'Drop an image or click to upload'}</span><span className="cv-sub">{canPos ? 'Drag the image to reposition' : 'JPG or PNG · wide crop'}</span></div>
      {input}
    </div>
  );
}
function HeroCover({ src, pos, onFile, onPos, children }) {
  const ref = ur();
  const [openPick, fileInput] = useFilePick(onFile);
  const d = ur(null);
  const move = (e) => { const s = d.current; if (!s) return; const dy = e.clientY - s.y; if (Math.abs(dy) > 3) s.moved = true; if (s.moved) { const pct = Math.max(0, Math.min(100, s.base - dy / s.h * 100)); onPos(`center ${pct}%`); } };
  const up = () => { const s = d.current; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (s && !s.moved) openPick(); d.current = null; };
  const down = (e) => { if (e.button) return; d.current = { y: e.clientY, base: posY(pos), h: ref.current.offsetHeight || 340, moved: false }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  return (
    <div className="mh-cover" ref={ref} onPointerDown={down}>
      <img src={src} alt="" style={{ objectPosition: pos || 'center 36%' }} draggable={false}/>
      <div className="mh-cover-hint"><G d={SF.image} size={14} stroke={1.9}/> Click to change <span className="sep">·</span> Drag to reposition</div>
      {fileInput}
      {children}
    </div>
  );
}

/* ============================================================ SUBMISSION FORMATS — what a member uploads */
const FORMATS = [
  { k: 'video', l: 'Video', sub: 'Members upload a clip they filmed.' },
  { k: 'photo', l: 'Photo', sub: 'Members add a single image.' },
  { k: 'photonote', l: 'Photo + note', sub: 'Members add an image with a short caption.' },
  { k: 'text', l: 'Text', sub: 'Members write a passage.' },
  { k: 'link', l: 'Link', sub: 'Members paste a link to their work.' },
];
const fmtOf = (k) => FORMATS.find(f => f.k === k) || FORMATS[0];
const fmtByLabel = (l) => FORMATS.find(f => f.l === l) || FORMATS[0];

/* ============================================================ THE BRIEF — the community's engine */
/* ---------- mock course episodes + a submission pool ---------- */
const EPISODES = [
  { n: 1, title: 'Grip & Setup', img: UN('1622279457486-62dcc4a431d6', 400) },
  { n: 2, title: 'The Serve', img: UN('1551773188-0801da12ddae', 400) },
  { n: 3, title: 'Forehand Fundamentals', img: UN('1531315630201-bb15abeb1653', 400) },
  { n: 4, title: 'The One-Handed Backhand', img: UN('1595435934249-5df7ed86e1c0', 400) },
  { n: 5, title: 'Footwork & Court Coverage', img: UN('1574680096145-d05b474e2155', 400) },
  { n: 6, title: 'Serve Mechanics', img: UN('1530915365347-e35b749a0381', 400) },
  { n: 7, title: 'Point Construction', img: UN('1554068865-24cecd4e34b8', 400) },
  { n: 8, title: 'The Mental Game', img: UN('1542144582-1ba00456b5e3', 400) },
];
const episodeOf = (n) => EPISODES.find(e => e.n === n) || null;
const SUBMISSION_POOL = [
  { who: 'sam',   img: UN('1551773188-0801da12ddae', 1100), text: 'Filmed my serve at 4–5 in the third set. Tried to slow the toss down like we talked about — felt more repeatable under pressure. Still rushing the trophy position a little. Eyes very welcome.', time: '2h' },
  { who: 'yuki',  img: UN('1531315630201-bb15abeb1653', 1100), text: 'Forehand wall drill, 50 in a row without a miss for the first time. Small win but I’ll take it.', time: '4h' },
  { who: 'amara', img: UN('1595435934249-5df7ed86e1c0', 1100), text: 'Two-hander down the line. I can feel the difference when I load the back leg properly — Ep 4 finally clicked.', time: '6h' },
  { who: 'diego', img: UN('1574680096145-d05b474e2155', 1100), text: 'Morning footwork ladder before work. Trying to make the split-step automatic so I stop thinking about it mid-point.', time: '8h' },
  { who: 'priya', img: UN('1622279457486-62dcc4a431d6', 1100), text: 'Slice approach into the net. Coach said my shoulder turn was late — does this look better?', time: '12h' },
  { who: 'tom',   img: UN('1530915365347-e35b749a0381', 1100), text: 'First tournament rally of the season. Lost the point but the rally itself felt clean. Progress.', time: '1d' },
  { who: 'lena',  img: UN('1542144582-1ba00456b5e3', 1100), text: 'Backhand cross-court, 30 reps. Posting the ugly ones too so it’s honest.', time: '1d' },
  { who: 'marco', img: UN('1517649763962-0c623066013b', 1100), text: 'Return of serve practice. Standing a step further back changed everything for me.', time: '2d' },
  { who: 'nadia', img: UN('1559586616-361e18714958', 1100), text: 'Volley at the net — hands felt soft today. Finally not flinching at pace.', time: '2d' },
  { who: 'ben',   img: UN('1530915365347-e35b749a0381', 1100), text: 'Quick one: 30 practice serves before the rain. Box on the left is second serves, right is first.', time: '3d' },
];
const COMMENT_POOL = [
  { who: 'carla', text: 'Great extension here — just watch the toss drifting a touch left on the second one.' },
  { who: 'sam',   text: 'This is so clean. The contact point is right out in front.' },
  { who: 'amara', text: 'Love this. Stealing the drill for tomorrow.' },
  { who: 'diego', text: 'The footwork looks way more settled than last week.' },
];
function mkComment(c, i, j) { return { id: 'k' + i + '_' + j + '_' + Math.random().toString(36).slice(2, 5), who: c.who, text: c.text, time: ['1h', '3h', '5h'][j] || 'now', likes: Math.floor(Math.random() * 6), liked: false, replies: [] }; }
function mockSubmissions() {
  const pool = [...SUBMISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 4 + Math.floor(Math.random() * 5)).map((s, i) => ({
    id: 's' + Date.now() + '_' + i,
    who: s.who, text: s.text, media: s.img, time: s.time,
    likes: 2 + Math.floor(Math.random() * 40),
    liked: false,
    comments: COMMENT_POOL.slice(0, Math.floor(Math.random() * 3)).map((c, j) => mkComment(c, i, j)),
  }));
}
const ACT_FALLBACK = UN('1622279457486-62dcc4a431d6', 1000);
const actCover = (a) => a.cover || (a.episode ? (episodeOf(a.episode) || {}).img : null) || ACT_FALLBACK;

/* episode picker (reuses the prov-* dropdown shell) */
function EpisodeSelect({ value, onChange }) {
  const [open, setOpen] = us(false);
  const cur = episodeOf(value);
  return (
    <div className="prov-wrap">
      <button type="button" className="prov-btn ep-btn" onClick={() => setOpen(o => !o)}>
        {cur
          ? <React.Fragment><span className="ep-thumb" style={{ backgroundImage: `url(${cur.img})` }}></span><span className="prov-name">Ep {cur.n} · {cur.title}</span></React.Fragment>
          : <React.Fragment><span className="ep-thumb none"><G d={CR.doc} size={14} stroke={1.8}/></span><span className="prov-name dim">Not linked to an episode</span></React.Fragment>}
        <span className="dt-chev"><G d={CR.chevD} size={15} stroke={2}/></span>
      </button>
      {open && (
        <React.Fragment>
          <div className="prov-scrim" onClick={() => setOpen(false)}></div>
          <div className="prov-menu ep-menu">
            <button type="button" className={`prov-opt${value == null ? ' on' : ''}`} onClick={() => { onChange(null); setOpen(false); }}>
              <span className="ep-thumb none"><G d={CR.doc} size={14} stroke={1.8}/></span><span className="prov-name">No episode</span>
            </button>
            {EPISODES.map(ep => (
              <button type="button" key={ep.n} className={`prov-opt${value === ep.n ? ' on' : ''}`} onClick={() => { onChange(ep.n); setOpen(false); }}>
                <span className="ep-thumb" style={{ backgroundImage: `url(${ep.img})` }}></span>
                <span className="prov-name">Ep {ep.n} · {ep.title}</span>
                {value === ep.n && <span className="prov-check"><G d={SF.check} size={15} stroke={2.6}/></span>}
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

function ActivityForm({ form, set, onCreate, onCancel }) {
  const f = fmtOf(form.format);
  const can = form.prompt.trim();
  return (
    <div className="card form-card">
      <div className="form-title">Create an activity</div>
      <Field label="Cover image">
        <CoverDrop src={form.cover} onFile={img => set({ cover: img })} pos={form.coverPos} onPos={p => set({ coverPos: p })}/>
      </Field>
      <Field label="What you’re asking members to do">
        <textarea className="textarea" style={{ minHeight: 90, fontSize: 16 }} value={form.prompt}
          placeholder="e.g. Post a clip of one rep you want eyes on — a serve, a rally, a drill."
          onChange={e => set({ prompt: e.target.value })}></textarea>
      </Field>
      <Field label="Submission format" hint={f.sub}>
        <Seg wide value={f.l} options={FORMATS.map(x => x.l)} onChange={l => set({ format: fmtByLabel(l).k })}/>
      </Field>
      <Field label="Link to an episode">
        <EpisodeSelect value={form.episode} onChange={v => set({ episode: v })}/>
      </Field>
      <div className="form-foot">
        <span className="sp"></span>
        {onCancel && <button className="btn btn-quiet btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary" disabled={!can} style={!can ? { opacity: .4 } : null} onClick={onCreate}>Publish activity</button>
      </div>
    </div>
  );
}

function ActivityCard({ act, onOpen }) {
  const f = fmtOf(act.format); const ep = act.episode ? episodeOf(act.episode) : null;
  const subs = act.submissions || [];
  return (
    <button className="ev-card" onClick={() => onOpen(act)}>
      <div className="ev-card-cover" style={{ backgroundImage: `url(${actCover(act)})`, backgroundPosition: act.coverPos || 'center' }}>
        <span className="ev-card-type">{f.l}</span>
        {ep && <span className="act-ep-tag">Ep {ep.n} · {ep.title}</span>}
      </div>
      <div className="ev-card-body">
        <div className="ev-card-title act-card-title">{act.prompt}</div>
        <div className="act-card-foot">
          {subs.length > 0 && <span className="ava-stack">{subs.slice(0, 3).map((s, i) => <img key={i} src={(PPL[s.who] || {}).avatar} alt=""/>)}</span>}
          <span className="act-subs"><b>{subs.length}</b> {subs.length === 1 ? 'submission' : 'submissions'}</span>
        </div>
      </div>
    </button>
  );
}

/* ---------- submission composer (real: text + photo upload) ---------- */
function SubComposer({ onPost }) {
  const [open, setOpen] = us(false);
  const [text, setText] = us('');
  const [media, setMedia] = us('');
  const taRef = ur();
  const [openPick, fileInput] = useFilePick((img) => { setMedia(img); setOpen(true); });
  const expand = () => { setOpen(true); setTimeout(() => taRef.current && taRef.current.focus(), 0); };
  const reset = () => { setText(''); setMedia(''); setOpen(false); };
  const submit = () => { if (!text.trim() && !media) return; onPost({ text: text.trim(), media }); reset(); };
  if (!open) {
    return (
      <div className="card composer">
        <div className="composer-row">
          <img src={window.CHOST.avatar} alt="You"/>
          <button className="composer-fake" onClick={expand}>Share your submission — a clip, a photo, or a note…</button>
          <button className="sub-photo-btn" onClick={openPick} aria-label="Add a photo"><G d={SF.image} size={19} stroke={1.8}/></button>
        </div>
        {fileInput}
      </div>
    );
  }
  return (
    <div className="card composer composer-open">
      <div className="composer-row" style={{ alignItems: 'flex-start' }}>
        <img src={window.CHOST.avatar} alt="You"/>
        <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} placeholder="Say something about it — what you worked on, what you want eyes on…"></textarea>
      </div>
      {media && (
        <div className="sub-comp-media">
          <img src={media} alt=""/>
          <button className="sub-comp-rm" onClick={() => setMedia('')} aria-label="Remove image"><G d={SF.close} size={15} stroke={2.2}/></button>
        </div>
      )}
      <div className="composer-foot">
        <button className="text-btn" onClick={openPick}><G d={SF.image} size={16} stroke={1.8}/> {media ? 'Replace photo' : 'Add photo'}</button>
        <span className="sp"></span>
        <button className="btn btn-quiet btn-sm" onClick={reset}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!text.trim() && !media} style={(!text.trim() && !media) ? { opacity: .4 } : null} onClick={submit}>Post</button>
      </div>
      {fileInput}
    </div>
  );
}

function ActivityPage({ act, onBack, showToast, events = [], author, viewer }) {
  const A = author || { who: 'carla', name: window.CHOST.name, avatar: window.CHOST.avatar };
  const f = fmtOf(act.format); const ep = act.episode ? episodeOf(act.episode) : null;
  const [posts, setPosts] = us(() => act.submissions || []);
  const newComment = (who, text) => ({ id: 'k' + Date.now() + Math.random().toString(36).slice(2, 5), who, time: 'now', text, likes: 0, liked: false, replies: [] });
  const onAction = (a) => {
    if (a.type === 'toast') { showToast(a.msg); return; }
    if (a.type === 'remove') { setPosts(prev => prev.filter(p => p.id !== a.postId)); return; }
    setPosts(prev => prev.map(p => {
      if (p.id !== a.postId) return p;
      if (a.type === 'likePost') return { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) };
      if (a.type === 'comment') return { ...p, comments: [...(p.comments || []), newComment(A.who, a.text)] };
      if (a.type === 'likeComment') return { ...p, comments: (p.comments || []).map(c => c.id === a.commentId ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : c) };
      if (a.type === 'reply') return { ...p, comments: (p.comments || []).map(c => c.id === a.commentId ? { ...c, replies: [...(c.replies || []), newComment(A.who, a.text)] } : c) };
      if (a.type === 'vote') return p.poll && p.poll.voted == null ? { ...p, poll: { ...p.poll, voted: a.optionId, options: p.poll.options.map(o => o.id === a.optionId ? { ...o, votes: o.votes + 1 } : o) } } : p;
      if (a.type === 'pin') return p;
      return p;
    }));
  };
  const addSubmission = (payload) => {
    setPosts(prev => [{ id: 'mine' + Date.now(), who: A.who, time: 'now', text: '', media: null, likes: 0, liked: false, comments: [], ...payload }, ...prev]);
    showToast('Posted to the activity');
  };
  const Post = window.CRFPost;
  return (
    <div className="act-page">
      <button className="act-back" onClick={onBack}><G d={CR.back} size={17} stroke={2.2}/> Activities</button>

      <div className="act-hero">
        <div className="act-hero-cover" style={{ backgroundImage: `url(${actCover(act)})`, backgroundPosition: act.coverPos || 'center' }}></div>
        <div className="act-hero-body">
          <div className="act-hero-tags">
            <span className="act-fmt-tag">{f.l}</span>
            {ep && <span className="act-ep-chip"><G d={CR.doc} size={13} stroke={1.8}/> Ep {ep.n} · {ep.title}</span>}
          </div>
          <h1 className="act-hero-title">{act.prompt}</h1>
          <div className="act-hero-meta">{posts.length} {posts.length === 1 ? 'submission' : 'submissions'} · Posted by you</div>
        </div>
      </div>

      <div className="act-feed">
        <window.RichComposer onPost={addSubmission} events={events} showToast={showToast} avatar={A.avatar} authorName={A.name} placeholder="Share your submission — a clip, a photo, or a note…" cta="Post"/>
        {posts.length === 0 ? (
          <div className="card act-feed-empty">
            <span className="ev-empty-ic"><G d={CR.grid} size={24} stroke={1.7}/></span>
            <h3>No submissions yet</h3>
            <p>Be the first to post — share a clip, a photo, or a note and your members will follow.</p>
          </div>
        ) : (
          <div className="crf-stack">
            {posts.map(p => <Post key={p.id} post={p} onAction={onAction} viewer={viewer}/>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivitiesTab({ activities, form, set, onCreate, showForm, setShowForm, showToast, events }) {
  const [openAct, setOpenAct] = us(null);
  if (openAct) {
    const live = activities.find(a => a.id === openAct.id) || openAct;
    return <ActivityPage act={live} onBack={() => setOpenAct(null)} showToast={showToast} events={events}/>;
  }
  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Activities</div>
          <div className="s">The thing you ask members to make and bring. Write one clear prompt — optionally tied to an episode — then publish it. Members respond, and their submissions collect on the card.</div>
        </div>
        {!showForm && activities.length > 0 && (
          <button className="ev-add-btn" onClick={() => setShowForm(true)} aria-label="New activity"><G d={SF.plus} size={20} stroke={2.2}/></button>
        )}
      </div>

      {showForm ? (
        <ActivityForm form={form} set={set} onCreate={onCreate} onCancel={activities.length > 0 ? () => setShowForm(false) : null}/>
      ) : activities.length === 0 ? (
        <div className="card ev-empty">
          <span className="ev-empty-ic"><G d={CR.grid} size={26} stroke={1.7}/></span>
          <h3>No activities yet</h3>
          <p>Ask members to do something — post a rep, a win, a question. Link it to an episode if you like. Publish, and submissions collect right here.</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Create an activity</button>
        </div>
      ) : (
        <div className="ev-grid">
          {activities.map(a => <ActivityCard key={a.id} act={a} onOpen={setOpenAct}/>)}
        </div>
      )}
    </React.Fragment>
  );
}

/* ============================================================ EVENTS TAB — the live moments */
const EVENT_TYPES = ['Workshop', 'Q&A', 'Watch Party'];

/* meeting providers — brand-colored marks for the link picker */
const MEET_PROVIDERS = [
  { k: 'zoom',  name: 'Zoom',            logo: 'assets/providers/zoom.svg',  host: 'zoom.us/j/' },
  { k: 'meet',  name: 'Google Meet',     logo: 'assets/providers/meet.svg',  host: 'meet.google.com/' },
  { k: 'teams', name: 'Microsoft Teams', logo: 'assets/providers/teams.svg', host: 'teams.microsoft.com/l/' },
  { k: 'webex', name: 'Webex',           logo: 'assets/providers/webex.svg', host: 'meet.webex.com/' },
  { k: 'other', name: 'Other link',      logo: null, color: '#86868b',       host: '' },
];
const providerOf = (k) => MEET_PROVIDERS.find(x => x.k === k) || MEET_PROVIDERS[0];
const providerPlaceholder = (k) => { const p = providerOf(k); return p.host ? `https://${p.host}…` : 'https://…'; };
function ProviderLogo({ k, size = 22 }) {
  const p = providerOf(k);
  if (p.logo) return <span className="prov-logo img" style={{ width: size, height: size }}><img src={p.logo} alt={p.name}/></span>;
  return (
    <span className="prov-logo" style={{ width: size, height: size, background: p.color }}>
      <G d={CR.link} size={Math.round(size * 0.6)} stroke={1.9}/>
    </span>
  );
}
function ProviderSelect({ value, onChange }) {
  const [open, setOpen] = us(false);
  const cur = providerOf(value);
  return (
    <div className="prov-wrap">
      <button type="button" className="prov-btn" onClick={() => setOpen(o => !o)}>
        <ProviderLogo k={cur.k}/>
        <span className="prov-name">{cur.name}</span>
        <G d={CR.chevD} size={16} stroke={2}/>
      </button>
      {open && (
        <React.Fragment>
          <div className="prov-scrim" onClick={() => setOpen(false)}></div>
          <div className="prov-menu">
            {MEET_PROVIDERS.map(p => (
              <button type="button" key={p.k} className={`prov-opt${p.k === value ? ' on' : ''}`} onClick={() => { onChange(p.k); setOpen(false); }}>
                <ProviderLogo k={p.k}/>
                <span className="prov-name">{p.name}</span>
                {p.k === value && <span className="prov-check"><G d={SF.check} size={15} stroke={2.6}/></span>}
              </button>
            ))}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
/* ---------- date & time pickers (custom, Apple-style) ---------- */
const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_WD = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
function fmtDateLabel(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtTimeLabel(t) {
  if (!t) return '';
  let [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return `${hh}:${pad2(m)} ${ap}`;
}
const TIME_OPTS = (() => { const a = []; for (let h = 0; h < 24; h++) { a.push(`${pad2(h)}:00`, `${pad2(h)}:30`); } return a; })();
function DatePicker({ value, onChange }) {
  const [open, setOpen] = us(false);
  const today = new Date();
  const base = value ? value.split('-').map(Number) : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const [vm, setVm] = us({ y: base[0], m: base[1] - 1 });
  const startDow = new Date(vm.y, vm.m, 1).getDay();
  const daysIn = new Date(vm.y, vm.m + 1, 0).getDate();
  const todayISO = isoOf(today.getFullYear(), today.getMonth(), today.getDate());
  const days = [];
  for (let d = 1; d <= daysIn; d++) days.push(d);
  const prev = () => setVm(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const next = () => setVm(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });
  const goToday = () => { setVm({ y: today.getFullYear(), m: today.getMonth() }); onChange(todayISO); setOpen(false); };
  return (
    <div className="dt-wrap">
      <button type="button" className={`dt-btn${value ? ' has' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="dt-ic"><G d={SF.calendar} size={16} stroke={1.9}/></span>
        <span className="dt-lbl">{value ? fmtDateLabel(value) : 'Select date'}</span>
        <span className="dt-chev"><G d={CR.chevD} size={15} stroke={2}/></span>
      </button>
      {open && (
        <React.Fragment>
          <div className="dt-scrim" onClick={() => setOpen(false)}></div>
          <div className="dt-pop cal">
            <div className="cal-head">
              <button type="button" className="cal-nav" onClick={prev} aria-label="Previous month"><G d={CR.back} size={16} stroke={2.2}/></button>
              <span className="cal-title">{CAL_MONTHS[vm.m]} {vm.y}</span>
              <button type="button" className="cal-nav" onClick={next} aria-label="Next month"><G d={CR.chevR} size={16} stroke={2.2}/></button>
            </div>
            <div className="cal-grid cal-wd">{CAL_WD.map(w => <span key={w} className="cal-wdc">{w}</span>)}</div>
            <div className="cal-grid">
              {days.map((d, i) => {
                const iso = isoOf(vm.y, vm.m, d);
                const style = i === 0 ? { gridColumnStart: startDow + 1 } : undefined;
                return <button type="button" key={iso} style={style} className={`cal-cell${iso === value ? ' sel' : ''}${iso === todayISO ? ' today' : ''}`} onClick={() => { onChange(iso); setOpen(false); }}>{d}</button>;
              })}
            </div>
            <button type="button" className="cal-today" onClick={goToday}><span className="cal-today-dot"></span>Today · {fmtDateLabel(todayISO)}</button>
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
function TimePicker({ value, onChange }) {
  const [open, setOpen] = us(false);
  const ref = ur();
  ue(() => {
    if (!open || !ref.current) return;
    const el = ref.current.querySelector('.tm-opt.on');
    if (el) ref.current.scrollTop = el.offsetTop - ref.current.clientHeight / 2 + el.clientHeight / 2;
  }, [open]);
  return (
    <div className="dt-wrap">
      <button type="button" className={`dt-btn${value ? ' has' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="dt-ic"><G d={SF.clock} size={16} stroke={1.9}/></span>
        <span className="dt-lbl">{value ? fmtTimeLabel(value) : 'Select time'}</span>
        <span className="dt-chev"><G d={CR.chevD} size={15} stroke={2}/></span>
      </button>
      {open && (
        <React.Fragment>
          <div className="dt-scrim" onClick={() => setOpen(false)}></div>
          <div className="dt-pop tm" ref={ref}>
            {TIME_OPTS.map(t => <button type="button" key={t} className={`tm-opt${t === value ? ' on' : ''}`} onClick={() => { onChange(t); setOpen(false); }}>{fmtTimeLabel(t)}</button>)}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
function EventForm({ form, set, onCreate, onCancel }) {
  const can = form.title.trim() && form.date;
  return (
    <div className="card form-card">
      <div className="form-title">Schedule a live moment</div>
      <Field label="Cover image">
        <CoverDrop src={form.cover} onFile={img => set({ cover: img })} pos={form.coverPos} onPos={p => set({ coverPos: p })}/>
      </Field>
      <Field label="Type">
        <Seg value={form.type} options={EVENT_TYPES} onChange={v => set({ type: v })}/>
      </Field>
      <Field label="Title"><input className="input" value={form.title} placeholder="e.g. Live Welcome Q&A" onChange={e => set({ title: e.target.value })}/></Field>
      <div className="field-row">
        <Field label="Date"><DatePicker value={form.date} onChange={v => set({ date: v })}/></Field>
        <Field label="Time"><TimePicker value={form.time} onChange={v => set({ time: v })}/></Field>
      </div>
      <Field label="Duration">
        <select className="input" value={form.dur} onChange={e => set({ dur: e.target.value })}>
          <option>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option>
        </select>
      </Field>
      <Field label="Meeting link">
        <div className="meet-row">
          <ProviderSelect value={form.provider} onChange={v => set({ provider: v })}/>
          <input className="input" value={form.link} placeholder={providerPlaceholder(form.provider)} onChange={e => set({ link: e.target.value })}/>
        </div>
      </Field>
      <Field label="Description">
        <textarea className="textarea" value={form.desc} placeholder="What happens in this session?" onChange={e => set({ desc: e.target.value })}></textarea>
      </Field>
      <div className="form-foot">
        <span className="sp"></span>
        {onCancel && <button className="btn btn-quiet btn-sm" onClick={onCancel}>Cancel</button>}
        <button className="btn btn-primary" disabled={!can} style={!can ? { opacity: .4 } : null} onClick={onCreate}>Schedule</button>
      </div>
    </div>
  );
}

/* ---------- published event card + detail sheet ---------- */
const EVENT_FALLBACK = {
  'Workshop': UN('1554068865-24cecd4e34b8', 1000),
  'Q&A': UN('1542144582-1ba00456b5e3', 1000),
  'Watch Party': UN('1551773188-0801da12ddae', 1000),
};
const coverFor = (ev) => ev.cover || EVENT_FALLBACK[ev.type] || EVENT_FALLBACK.Workshop;
function EventCard({ ev, onOpen, past }) {
  return (
    <button className={`ev-card${past ? ' is-past' : ''}`} onClick={() => onOpen(ev)}>
      <div className="ev-card-cover" style={{ backgroundImage: `url(${coverFor(ev)})`, backgroundPosition: ev.coverPos || 'center' }}>
        <span className="ev-card-type">{ev.type}</span>
        <span className="ev-card-prov"><ProviderLogo k={ev.provider} size={26}/></span>
        {past && <span className="ev-card-past">Ended</span>}
      </div>
      <div className="ev-card-body">
        <div className="ev-card-when"><G d={SF.calendar} size={14} stroke={1.9}/> {ev.date ? fmtDateLabel(ev.date) : 'Date TBD'}{ev.time ? ` · ${fmtTimeLabel(ev.time)}` : ''}</div>
        <div className="ev-card-title">{ev.title || 'Untitled event'}</div>
        <div className="ev-card-join">{past ? <React.Fragment>View recap <G d={CR.chevR} size={15} stroke={2}/></React.Fragment> : <React.Fragment>Join with {providerOf(ev.provider).name} <G d={CR.chevR} size={15} stroke={2}/></React.Fragment>}</div>
      </div>
    </button>
  );
}
function EventSheet({ ev, onClose, showToast }) {
  ue(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prevOv; };
  }, []);
  const prov = providerOf(ev.provider);
  let fullDate = 'Date to be announced';
  if (ev.date) { const [y, m, d] = ev.date.split('-').map(Number); fullDate = new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }
  return (
    <div className="ev-overlay" onClick={onClose}>
      <div className="ev-sheet" onClick={e => e.stopPropagation()}>
        <div className="ev-sheet-cover" style={{ backgroundImage: `url(${coverFor(ev)})`, backgroundPosition: ev.coverPos || 'center' }}>
          <button className="ev-sheet-x" onClick={onClose} aria-label="Close"><G d={SF.close} size={18} stroke={2.2}/></button>
          <span className="ev-sheet-type">{ev.type}</span>
        </div>
        <div className="ev-sheet-body">
          <div className="ev-sheet-when"><G d={SF.calendar} size={15} stroke={1.9}/> {fullDate}{ev.time ? ` · ${fmtTimeLabel(ev.time)}` : ''}</div>
          <h3 className="ev-sheet-title">{ev.title || 'Untitled event'}</h3>
          <div className="ev-sheet-prov"><ProviderLogo k={ev.provider} size={22}/> Hosted on {prov.name} · {ev.dur}</div>
          {ev.desc && <p className="ev-sheet-desc">{ev.desc}</p>}
          <button className="ev-sheet-join" onClick={() => showToast(`Opening ${prov.name}…`)}>
            <ProviderLogo k={ev.provider} size={24}/> Join with {prov.name}
            <G d={CR.chevR} size={16} stroke={2.2}/>
          </button>
          <div className="ev-sheet-url">{ev.link || providerPlaceholder(ev.provider)}</div>
        </div>
      </div>
    </div>
  );
}
function EventsTab({ events, form, set, onCreate, showForm, setShowForm, showToast }) {
  const [openEv, setOpenEv] = us(null);
  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Events</div>
          <div className="s">Live moments that bring the room together — a workshop, a Q&A, or a watch party. Schedule one and it publishes a card members can join in a tap.</div>
        </div>
        {!showForm && events.length > 0 && (
          <button className="ev-add-btn" onClick={() => setShowForm(true)} aria-label="New event"><G d={SF.plus} size={20} stroke={2.2}/></button>
        )}
      </div>

      {showForm ? (
        <EventForm form={form} set={set} onCreate={onCreate} onCancel={events.length > 0 ? () => setShowForm(false) : null}/>
      ) : events.length === 0 ? (
        <div className="card ev-empty">
          <span className="ev-empty-ic"><G d={SF.calendar} size={26} stroke={1.7}/></span>
          <h3>No live moments yet</h3>
          <p>Schedule a workshop, Q&A, or watch party. It publishes a card members can join with one tap when it goes live.</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>Schedule an event</button>
        </div>
      ) : (
        (() => {
          const todayKey = isoOf(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
          const isPast = (ev) => ev.date && ev.date < todayKey;
          const upcoming = events.filter(ev => !isPast(ev)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
          const past = events.filter(isPast).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
          return (
            <React.Fragment>
              {upcoming.length > 0 && (
                <React.Fragment>
                  <div className="ev-sec-label">Upcoming · {upcoming.length}</div>
                  <div className="ev-grid">
                    {upcoming.map(ev => <EventCard key={ev.id} ev={ev} onOpen={setOpenEv}/>)}
                  </div>
                </React.Fragment>
              )}
              {past.length > 0 && (
                <React.Fragment>
                  <div className="ev-sec-label past">Past · {past.length}</div>
                  <div className="ev-grid ev-grid-past">
                    {past.map(ev => <EventCard key={ev.id} ev={ev} onOpen={setOpenEv} past/>)}
                  </div>
                </React.Fragment>
              )}
            </React.Fragment>
          );
        })()
      )}

      {openEv && <EventSheet ev={openEv} onClose={() => setOpenEv(null)} showToast={showToast}/>}
    </React.Fragment>
  );
}

/* ============================================================ SETTINGS TAB — everything that shapes the community */
function SettingsTab({ st, set, onSaveFraming, framingSaved, showToast }) {
  const lessons = EPISODES.length;
  return (
    <React.Fragment>
      <div className="cr-head"><div><div className="h">Settings</div><div className="s">Everything that shapes how your community looks, who gets in, and how it runs day to day. Members never see these controls — they just experience the room they create.</div></div></div>

      {/* ---------- Identity ---------- */}
      <div className="glist-label">Identity</div>
      <div className="card form-card" style={{ marginBottom: 14 }}>
        <Field label="Cover image" hint="Shown across the top of your community. Click to replace, drag the image to reposition.">
          <CoverDrop src={st.cover} onFile={img => { set({ cover: img }); showToast('Cover updated'); }} pos={st.coverPos} onPos={p => set({ coverPos: p })}/>
        </Field>
      </div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow"><div className="grow-main"><div className="gl">Name</div><div className="gs">The title across the top of the room</div></div><div className="grow-ctl"><input className="input" value={st.name} onChange={e => set({ name: e.target.value })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Tagline</div><div className="gs">One line under the name</div></div><div className="grow-ctl"><input className="input" value={st.tagline} onChange={e => set({ tagline: e.target.value })}/></div></div>
      </div>

      {/* ---------- The masterclass ---------- */}
      <div className="glist-label">The masterclass</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow">
          <div className="set-course">
            <span className="set-course-ic" style={{ backgroundImage: `url(${C.cover})` }}></span>
            <div className="grow-main"><div className="gl">{C.course}</div><div className="gs">{C.brand} · {lessons} lessons · the course this community belongs to</div></div>
          </div>
          <div className="grow-ctl"><button className="btn btn-quiet btn-sm" onClick={() => showToast('Opening course editor…')}>View course</button></div>
        </div>
      </div>

      {/* ---------- Posting & moderation ---------- */}
      <div className="glist-label">Posting &amp; moderation</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow"><div className="grow-main"><div className="gl">Who can post</div><div className="gs">Who can start a submission or thread</div></div><div className="grow-ctl"><Seg value={st.whoCanPost} options={['Everyone', 'Approved']} onChange={v => set({ whoCanPost: v })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Review first post from new members</div><div className="gs">Catch spam before it reaches the feed</div></div><div className="grow-ctl"><Toggle on={st.moderation} onClick={() => set({ moderation: !st.moderation })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Members can comment on work</div><div className="gs">Critique stays attached to each submission</div></div><div className="grow-ctl"><Toggle on={st.comments} onClick={() => set({ comments: !st.comments })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Reactions on posts</div><div className="gs">Let members like and react to each other’s work</div></div><div className="grow-ctl"><Toggle on={st.reactions} onClick={() => set({ reactions: !st.reactions })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Profanity filter</div><div className="gs">Automatically hide flagged language</div></div><div className="grow-ctl"><Toggle on={st.profanity} onClick={() => set({ profanity: !st.profanity })}/></div></div>
      </div>

      {/* ---------- Events ---------- */}
      <div className="glist-label">Events</div>
      <div className="card glist" style={{ marginBottom: 26, overflow: 'visible', position: 'relative', zIndex: 5 }}>
        <div className="grow"><div className="grow-main"><div className="gl">Default meeting provider</div><div className="gs">Pre-selected when you schedule a live moment</div></div><div className="grow-ctl"><ProviderSelect value={st.defaultProvider} onChange={v => set({ defaultProvider: v })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Members can RSVP</div><div className="gs">Show who’s coming and send reminders</div></div><div className="grow-ctl"><Toggle on={st.memberRsvp} onClick={() => set({ memberRsvp: !st.memberRsvp })}/></div></div>
      </div>

      {/* ---------- Notifications ---------- */}
      <div className="glist-label">Notifications</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow"><div className="grow-main"><div className="gl">Email me new submissions</div><div className="gs">A note whenever a member posts work</div></div><div className="grow-ctl"><Toggle on={st.notifySubs} onClick={() => set({ notifySubs: !st.notifySubs })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Email me new comments</div><div className="gs">Stay on top of the conversation</div></div><div className="grow-ctl"><Toggle on={st.notifyComments} onClick={() => set({ notifyComments: !st.notifyComments })}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Weekly digest to members</div><div className="gs">A Monday recap of the best work and what’s coming</div></div><div className="grow-ctl"><Toggle on={st.weeklyDigest} onClick={() => set({ weeklyDigest: !st.weeklyDigest })}/></div></div>
      </div>

      {/* ---------- Danger zone ---------- */}
      <div className="glist-label danger">Danger zone</div>
      <div className="card glist danger-zone">
        <div className="grow"><div className="grow-main"><div className="gl">Archive community</div><div className="gs">Hide it from members and pause all activity — you can restore it later</div></div><div className="grow-ctl"><button className="btn btn-quiet btn-sm" onClick={() => showToast('Community archived')}>Archive</button></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Delete community</div><div className="gs">Permanently remove the room and everything in it. This can’t be undone.</div></div><div className="grow-ctl"><button className="btn btn-danger btn-sm" onClick={() => showToast('Type the name to confirm deletion')}>Delete</button></div></div>
      </div>
    </React.Fragment>
  );
}

/* ============================================================ START TAB — the only home for setup */
function StartTab({ tasks, doneCount, allDone, goTab, invite, publish }) {
  return (
    <React.Fragment>
      {allDone ? (
        <div className="card ready" style={{ marginBottom: 30 }}>
          <span className="ready-ic"><G d={SF.check} size={24} stroke={2.6}/></span>
          <div className="ready-main"><h2>You’re ready to open the doors</h2><p>Everything’s set. Invite your members and the gallery starts filling up.</p></div>
          <div className="ready-cta"><button className="btn btn-primary" onClick={invite}><G d={CR.link} size={16} stroke={1.9}/> Copy invite link</button></div>
        </div>
      ) : (
        <div className="card setup" style={{ marginBottom: 30 }}>
          <div className="setup-ring"><Ring pct={doneCount / tasks.length * 100} size={96} stroke={9} label={`${doneCount}/${tasks.length}`} sub="done"/></div>
          <div className="setup-head">
            <div className="eyebrow">Welcome, Carla</div>
            <h2>Decide what your room asks for</h2>
            <p>A handful of choices — what the work is, what gets submitted, and how it gets stakes. Members never see these controls; they just experience the room they create.</p>
          </div>
          <div className="setup-tasks">
            {tasks.map(t => (
              <button key={t.k} className={`task${t.done ? ' done' : ''}`} onClick={() => t.to ? goTab(t.to) : publish()}>
                <span className="task-check"><G d={SF.check} size={15} stroke={2.6}/></span>
                <span className="task-main"><span className="task-tt">{t.tt}</span><span className="task-ts">{t.ts}</span></span>
                <span className="task-cta">{t.done ? 'Done' : <React.Fragment>{t.k === 'publish' ? 'Publish' : 'Open'} <G d={CR.chevR} size={15} stroke={2}/></React.Fragment>}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="glist-label">At a glance</div>
      <div className="card glist">
        <button className="grow" style={{ width: '100%', textAlign: 'left' }} onClick={() => goTab('feed')}>
          <div className="grow-main"><div className="gl">Feed</div><div className="gs">Announcements and the running conversation with your members</div></div>
          <div className="grow-ctl"><span className="task-cta">Open <G d={CR.chevR} size={15} stroke={2}/></span></div>
        </button>
        <button className="grow" style={{ width: '100%', textAlign: 'left' }} onClick={() => goTab('brief')}>
          <div className="grow-main"><div className="gl">Activities</div><div className="gs">The unit of work your room revolves around</div></div>
          <div className="grow-ctl"><span className="task-cta">Open <G d={CR.chevR} size={15} stroke={2}/></span></div>
        </button>
        <button className="grow" style={{ width: '100%', textAlign: 'left' }} onClick={() => goTab('events')}>
          <div className="grow-main"><div className="gl">Events</div><div className="gs">Live moments that give the work its stakes</div></div>
          <div className="grow-ctl"><span className="task-cta">Open <G d={CR.chevR} size={15} stroke={2}/></span></div>
        </button>
        <button className="grow" style={{ width: '100%', textAlign: 'left' }} onClick={() => goTab('frame')}>
          <div className="grow-main"><div className="gl">Settings</div><div className="gs">Identity, access, moderation, events, and notifications</div></div>
          <div className="grow-ctl"><span className="task-cta">Open <G d={CR.chevR} size={15} stroke={2}/></span></div>
        </button>
      </div>
    </React.Fragment>
  );
}

/* ============================================================ AI ASSISTANT */
const AI_DRAFTS = {
  prompt: { prompt: "Post a clip of one rep you want eyes on — a serve, a rally, a drill. Ugly footage welcome; this is where we get better, not where we look good.", format: 'video', mode: 'standing' },
  framing: "This is where you post your work and get real feedback. Show up, share, get better. The basics are the ceiling, not the floor.",
  event: { title: 'Serve Clinic — I review your clips live', type: 'Workshop', date: '2026-06-20', time: '18:00', dur: '45 min',
    desc: "Post a serve to the feed this week and I’ll pull clips live, frame by frame. We fix toss, timing, and the thing you can’t see from inside your own motion." },
};
function AIModal({ ctx, onClose, onUse }) {
  const [mode, setMode] = us(ctx ? 'thinking' : 'menu');
  const [kind, setKind] = us(ctx || null);
  ue(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, []);
  ue(() => { if (mode !== 'thinking') return; const id = setTimeout(() => setMode('result'), 1100); return () => clearTimeout(id); }, [mode, kind]);

  const run = (k) => { setKind(k); setMode('thinking'); };
  const draft = AI_DRAFTS[kind];
  const ACTIONS = [
    { k: 'prompt', ic: CR.doc, l: 'Draft my activity', s: 'An activity + format for a craft like yours' },
    { k: 'event', ic: SF.calendar, l: 'Plan a live critique', s: 'A session that reviews the gallery live' },
    { k: 'framing', ic: CR.doc, l: 'Write my framing line', s: 'The sign on the door for new members' },
  ];
  const renderDraft = () => {
    if (kind === 'framing') return <div className="ai-result-text">{draft}</div>;
    if (kind === 'prompt') return <div className="ai-result-text"><b>Activity</b>{'\n'}{draft.prompt}{'\n\n'}<b>Format</b> · {fmtOf(draft.format).l}{'   '}<b>Runs as</b> · {draft.mode === 'rotating' ? 'Rotating' : 'Standing'}</div>;
    return <div className="ai-result-text"><b>{draft.title}</b>{'\n'}{draft.type} · {draft.date} {draft.time} · {draft.dur}{'\n\n'}{draft.desc}</div>;
  };
  return (
    <div className="ai-ov" onClick={onClose}>
      <div className="ai-panel" onClick={e => e.stopPropagation()}>
        <div className="ai-head">
          <span className="ai-mark"><G d={CR.spark} size={20} fill="currentColor"/></span>
          <div><div className="ai-t">Spaire AI</div><div className="ai-s">Community assistant</div></div>
          <button className="ai-x" onClick={onClose} aria-label="Close"><G d={SF.close} size={18} stroke={2}/></button>
        </div>
        <div className="ai-body">
          {mode === 'menu' && (
            <React.Fragment>
              <p className="ai-intro">Tell me what you want your room to ask for, and I’ll draft it. You can edit everything after.</p>
              <div className="ai-actions">
                {ACTIONS.map(a => (
                  <button key={a.k} className="ai-action" onClick={() => run(a.k)}>
                    <span className="ico"><G d={a.ic} size={20} stroke={1.9}/></span>
                    <div className="ai-action-main"><div className="al">{a.l}</div><div className="as">{a.s}</div></div>
                    <span className="chev"><G d={CR.chevR} size={17} stroke={2}/></span>
                  </button>
                ))}
              </div>
            </React.Fragment>
          )}
          {mode === 'thinking' && <div className="ai-draft"><div className="ai-thinking">Drafting<span className="ai-dots"><i></i><i></i><i></i></span></div></div>}
          {mode === 'result' && (
            <div className="ai-draft">
              <div className="ai-result-label"><G d={CR.spark} size={13} fill="currentColor"/> Draft</div>
              {renderDraft()}
              <div className="ai-result-foot">
                <button className="btn btn-primary btn-sm" onClick={() => { onUse(kind, draft); onClose(); }}>Use this</button>
                <button className="btn btn-quiet btn-sm" onClick={() => setMode('thinking')}>Regenerate</button>
                {!ctx && <button className="ai-back" onClick={() => setMode('menu')}>Back</button>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ RICH COMPOSER + POST EXTRAS (photo · video · gif · poll · emoji · event) */
function readFileData(file, cb, prefix) { if (!file) return; if (prefix && !file.type.startsWith(prefix)) return; const r = new FileReader(); r.onload = () => cb(r.result); r.readAsDataURL(file); }
function useUpload(accept, onData) {
  const ref = ur();
  const prefix = accept.split('/')[0] + '/';
  const node = <input ref={ref} type="file" accept={accept} style={{ display: 'none' }} onChange={e => { readFileData(e.target.files[0], onData, prefix); e.target.value = ''; }}/>;
  return [() => ref.current && ref.current.click(), node];
}
const EMOJI = ['😀','😄','😍','😎','🥳','🤩','😅','😂','🥹','🤔','😴','😮','🙌','👏','💪','🙏','👍','👀','🔥','✨','💯','❤️','🎾','🏆','⚡','🎉','📣','✅','🙂','😉','🤝','💥'];
const GIFS = ['111ebonMs90YLu','7rj2ZgttvgomY','g9582DNuQppxC','3o7TKr3nzbh5WgCFxe','26FLgGTPUDH6UGAbm','l0MYt5jPR6QX5pnqM','10JhviFuU2gWD6','3oEjI6SIIHBdRxXI40','xT0xeJpnrWC4XWblEk','l46Cy1rHbQ92uuLXa','3o6Zt481isNVuQI1l6','13CoXDiaCcCoyk'].map(id => `https://media.giphy.com/media/${id}/giphy.gif`);

/* compact event card — shared by composer preview and published posts */
function EventAttach({ ev, onOpen, onRemove }) {
  return (
    <div className={`ev-attach${onOpen ? ' tap' : ''}`} onClick={onOpen ? () => onOpen(ev) : undefined}>
      <div className="ev-attach-cover" style={{ backgroundImage: `url(${coverFor(ev)})`, backgroundPosition: ev.coverPos || 'center' }}>
        <span className="ev-attach-prov"><ProviderLogo k={ev.provider} size={22}/></span>
      </div>
      <div className="ev-attach-body">
        <div className="ev-attach-type">{ev.type}</div>
        <div className="ev-attach-title">{ev.title || 'Untitled event'}</div>
        <div className="ev-attach-when"><G d={CR.calendar} size={13} stroke={1.9}/> {ev.date ? fmtDateLabel(ev.date) : 'Date TBD'}{ev.time ? ` · ${fmtTimeLabel(ev.time)}` : ''}</div>
      </div>
      {onRemove && <button className="ev-attach-rm" onClick={e => { e.stopPropagation(); onRemove(); }} aria-label="Remove"><G d={SF.close} size={15} stroke={2.2}/></button>}
    </div>
  );
}

/* renders a post's rich attachments (video, gif, poll, event) + opens event sheet */
function PostExtras({ post, onAction }) {
  const [sheetEv, setSheetEv] = us(null);
  const poll = post.poll;
  const total = poll ? poll.options.reduce((a, o) => a + o.votes, 0) : 0;
  return (
    <React.Fragment>
      {post.video && <div className="crf-media crf-video"><video src={post.video} controls playsInline></video></div>}
      {post.gif && <div className="crf-media crf-gif"><img src={post.gif} alt="GIF"/><span className="gif-badge">GIF</span></div>}
      {poll && (
        <div className="poll">
          {poll.options.map((o, i) => {
            const pct = total ? Math.round(o.votes / total * 100) : 0;
            const mine = poll.voted === o.id;
            return (
              <button key={o.id} className={`poll-opt${poll.voted != null ? ' voted' : ''}${mine ? ' mine' : ''}`}
                disabled={poll.voted != null} onClick={() => onAction({ type: 'vote', postId: post.id, optionId: o.id })}>
                <span className="poll-fill" style={{ width: poll.voted != null ? `${pct}%` : '0%' }}></span>
                <span className="poll-label">{o.text}{mine && <span className="poll-check"><G d={SF.check} size={13} stroke={2.6}/></span>}</span>
                {poll.voted != null && <span className="poll-pct">{pct}%</span>}
              </button>
            );
          })}
          <div className="poll-meta">{total} {total === 1 ? 'vote' : 'votes'}{poll.voted == null && ' · tap to vote'}</div>
        </div>
      )}
      {post.event && <EventAttach ev={post.event} onOpen={setSheetEv}/>}
      {sheetEv && <EventSheet ev={sheetEv} onClose={() => setSheetEv(null)} showToast={() => {}}/>}
    </React.Fragment>
  );
}

function Popover({ onClose, className, children }) {
  return (
    <React.Fragment>
      <div className="pop-scrim" onClick={onClose}></div>
      <div className={`pop ${className || ''}`}>{children}</div>
    </React.Fragment>
  );
}

function RichComposer({ onPost, events = [], showToast, placeholder = 'Share something with your community…', avatar, authorName, cta = 'Post' }) {
  const av = avatar || window.CHOST.avatar;
  const aName = authorName || window.CHOST.name;
  const [open, setOpen] = us(false);
  const [text, setText] = us('');
  const [media, setMedia] = us(null);
  const [video, setVideo] = us(null);
  const [gif, setGif] = us(null);
  const [poll, setPoll] = us(null);
  const [event, setEvent] = us(null);
  const [pop, setPop] = us(null);
  const taRef = ur();
  const [openImg, imgInput] = useUpload('image/*', d => { setMedia(d); setVideo(null); setGif(null); });
  const [openVid, vidInput] = useUpload('video/*', d => { setVideo(d); setMedia(null); setGif(null); });

  const expand = () => { setOpen(true); setTimeout(() => taRef.current && taRef.current.focus(), 0); };
  const reset = () => { setText(''); setMedia(null); setVideo(null); setGif(null); setPoll(null); setEvent(null); setPop(null); setOpen(false); };
  const validPoll = poll && poll.options.filter(o => o.text.trim()).length >= 2;
  const hasContent = text.trim() || media || video || gif || validPoll || event;
  const submit = () => {
    if (!hasContent) return;
    onPost({
      text: text.trim(), media, video, gif, event,
      poll: validPoll ? { options: poll.options.filter(o => o.text.trim()).map((o, i) => ({ id: 'o' + i, text: o.text.trim(), votes: 0 })), voted: null } : null,
    });
    reset();
  };
  const insertEmoji = (e) => { setText(t => t + e); setPop(null); setTimeout(() => taRef.current && taRef.current.focus(), 0); };
  const startPoll = () => { setPoll(p => p || { options: [{ text: '' }, { text: '' }] }); setPop(null); };
  const setOpt = (i, v) => setPoll(p => ({ options: p.options.map((o, j) => j === i ? { text: v } : o) }));
  const addOpt = () => setPoll(p => p.options.length >= 4 ? p : ({ options: [...p.options, { text: '' }] }));
  const rmOpt = (i) => setPoll(p => p.options.length <= 2 ? p : ({ options: p.options.filter((_, j) => j !== i) }));

  if (!open) {
    return (
      <div className="card crf-composer">
        <div className="crf-comp-row">
          <img src={av} alt=""/>
          <button className="crf-comp-fake" onClick={expand}>{placeholder}</button>
        </div>
        <div className="crf-comp-quick">
          <button onClick={expand}><G d={SF.image} size={18} stroke={1.8}/> Photo</button>
          <button onClick={expand}><G d={CR.video} size={18} stroke={1.8}/> Video</button>
          <button onClick={expand}><G d={CR.poll} size={18} stroke={1.9}/> Poll</button>
          <button onClick={expand}><G d={CR.calendar} size={18} stroke={1.8}/> Event</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card crf-composer open">
      <div className="crf-comp-head">
        <img src={av} alt=""/>
        <div className="crf-comp-who"><div className="n">{aName}</div></div>
        <button className="crf-more" onClick={reset} aria-label="Close"><G d={SF.close} size={18} stroke={2}/></button>
      </div>

      <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} placeholder={placeholder}></textarea>

      {/* attachment previews */}
      {media && <div className="comp-att"><img src={media} alt=""/><button className="comp-att-rm" onClick={() => setMedia(null)} aria-label="Remove"><G d={SF.close} size={15} stroke={2.2}/></button></div>}
      {video && <div className="comp-att"><video src={video} controls playsInline></video><button className="comp-att-rm" onClick={() => setVideo(null)} aria-label="Remove"><G d={SF.close} size={15} stroke={2.2}/></button></div>}
      {gif && <div className="comp-att"><img src={gif} alt="GIF"/><span className="gif-badge">GIF</span><button className="comp-att-rm" onClick={() => setGif(null)} aria-label="Remove"><G d={SF.close} size={15} stroke={2.2}/></button></div>}
      {poll && (
        <div className="poll-build">
          <div className="poll-build-head"><span>Poll</span><button onClick={() => setPoll(null)}>Remove</button></div>
          {poll.options.map((o, i) => (
            <div key={i} className="poll-build-row">
              <input className="input" value={o.text} placeholder={`Option ${i + 1}`} maxLength={40} onChange={e => setOpt(i, e.target.value)}/>
              {poll.options.length > 2 && <button className="poll-build-rm" onClick={() => rmOpt(i)} aria-label="Remove option"><G d={SF.close} size={14} stroke={2.2}/></button>}
            </div>
          ))}
          {poll.options.length < 4 && <button className="poll-build-add" onClick={addOpt}><G d={SF.plus} size={15} stroke={2}/> Add option</button>}
        </div>
      )}
      {event && <EventAttach ev={event} onRemove={() => setEvent(null)}/>}

      <div className="crf-comp-foot">
        <div className="crf-comp-tools">
          <button title="Photo" onClick={openImg}><G d={SF.image} size={20} stroke={1.8}/></button>
          <button title="Video" onClick={openVid}><G d={CR.video} size={20} stroke={1.8}/></button>
          <div className="tool-wrap">
            <button title="GIF" className={`tool-gif${pop === 'gif' ? ' on' : ''}`} onClick={() => setPop(pop === 'gif' ? null : 'gif')}>GIF</button>
            {pop === 'gif' && (
              <Popover className="pop-gif" onClose={() => setPop(null)}>
                <div className="pop-grid gif-grid">
                  {GIFS.map((u, i) => <button key={i} className="gif-cell" onClick={() => { setGif(u); setMedia(null); setVideo(null); setPop(null); }}><img src={u} alt="" loading="lazy"/></button>)}
                </div>
              </Popover>
            )}
          </div>
          <div className="tool-wrap">
            <button title="Emoji" className={pop === 'emoji' ? 'on' : ''} onClick={() => setPop(pop === 'emoji' ? null : 'emoji')}><G d={CR.smiley} size={20} stroke={1.8}/></button>
            {pop === 'emoji' && (
              <Popover className="pop-emoji" onClose={() => setPop(null)}>
                <div className="emoji-grid">{EMOJI.map((e, i) => <button key={i} onClick={() => insertEmoji(e)}>{e}</button>)}</div>
              </Popover>
            )}
          </div>
          <button title="Poll" className={poll ? 'on' : ''} onClick={startPoll}><G d={CR.poll} size={20} stroke={1.9}/></button>
          <div className="tool-wrap">
            <button title="Event" className={`${event || pop === 'event' ? 'on' : ''}`} onClick={() => setPop(pop === 'event' ? null : 'event')}><G d={CR.calendar} size={20} stroke={1.8}/></button>
            {pop === 'event' && (
              <Popover className="pop-event" onClose={() => setPop(null)}>
                <div className="pop-title">Link an event</div>
                {events.length === 0 ? (
                  <div className="pop-empty">No events yet — schedule one in the Events tab.</div>
                ) : (
                  <div className="event-pick">
                    {events.map(ev => (
                      <button key={ev.id} className="event-pick-row" onClick={() => { setEvent(ev); setPop(null); }}>
                        <span className="event-pick-cover" style={{ backgroundImage: `url(${coverFor(ev)})`, backgroundPosition: ev.coverPos || 'center' }}></span>
                        <span className="event-pick-main"><b>{ev.title || 'Untitled event'}</b><span>{ev.type} · {ev.date ? fmtDateLabel(ev.date) : 'TBD'}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
            )}
          </div>
        </div>
        <span className="sp"></span>
        <button className="btn btn-primary btn-sm" disabled={!hasContent} style={!hasContent ? { opacity: .4 } : null} onClick={submit}>{cta}</button>
      </div>
      {imgInput}{vidInput}
    </div>
  );
}
window.RichComposer = RichComposer;
window.PostExtras = PostExtras;

/* ============================================================ APP */
function App() {
  const [dark, setDark] = us(() => localStorage.getItem('spaire_theme') === 'dark');
  ue(() => { document.body.classList.toggle('dark', dark); localStorage.setItem('spaire_theme', dark ? 'dark' : 'light'); }, [dark]);

  const [tab, setTab] = us('start');
  const [events, setEvents] = us([]);
  const [invited, setInvited] = us(false);
  const [promptSaved, setPromptSaved] = us(false);
  const [framingSaved, setFramingSaved] = us(false);
  const [published, setPublished] = us(false);
  const [welcomePosted, setWelcomePosted] = us(false);
  const [showEventForm, setShowEventForm] = us(false);
  const [toast, setToast] = us(null);
  const [ai, setAi] = us(null);
  const tRef = ur();

  const [st, setSt] = us({
    prompt: 'Post a clip of one rep you want eyes on — a serve, a rally, a drill. Ugly footage welcome.',
    format: 'video',
    mode: 'rotating',
    rotating: {
      cadence: 'Weekly',
      start: START_ISO,
      challenges: [
        { id: 'c1', title: 'Your second serve', note: 'Toss, timing, and the kick. Post one rep you want eyes on.' },
        { id: 'c2', title: 'Return under pressure', note: 'Break point down — show me the return you’d hit.' },
        { id: 'c3', title: 'The approach & put-away', note: 'Coming forward: the shot that should end the point.' },
      ],
    },
    framing: 'This is where you post your work and get real feedback. Show up, share, get better.',
    name: 'The Baseline', tagline: 'Carla Marín’s private community', cover: C.cover, coverPos: 'center 36%',
    privacy: 'Public', joinMode: 'Course students', requireEnroll: true, showProgress: true,
    whoCanPost: 'Everyone', moderation: true, comments: true, reactions: true, profanity: true,
    defaultProvider: 'zoom', memberRsvp: true,
    notifySubs: true, notifyComments: false, weeklyDigest: true,
  });
  const set = (p) => setSt(s => ({ ...s, ...p }));

  const [eventForm, setEventForm] = us({ title: '', type: 'Workshop', date: '', time: '18:00', dur: '45 min', provider: 'zoom', link: '', desc: '', cover: '', coverPos: 'center 50%' });
  const setEv = (p) => setEventForm(f => ({ ...f, ...p }));

  const [activities, setActivities] = us([]);
  const [activityForm, setActivityForm] = us({ prompt: '', format: 'video', episode: null, cover: '', coverPos: 'center 50%' });
  const setAct = (p) => setActivityForm(f => ({ ...f, ...p }));
  const [showActForm, setShowActForm] = us(false);

  const showToast = uc((m) => { setToast(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToast(null), 2400); }, []);
  const goTab = (t) => { setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const tasks = [
    { k: 'welcome', done: welcomePosted, tt: 'Post a welcome', ts: 'Greet your members in the feed so the room feels alive on day one', to: 'feed' },
    { k: 'prompt',  done: activities.length > 0, tt: 'Create an activity', ts: 'What you ask members to make — collects their submissions', to: 'brief' },
    { k: 'event',   done: events.length > 0, tt: 'Schedule a live moment', ts: 'Give the work its stakes — a critique or Q&A', to: 'events' },
    { k: 'publish', done: published, tt: 'Publish your community', ts: 'Open the doors and make it live for your students', to: null },
  ];
  const doneCount = tasks.filter(t => t.done).length;
  const allDone = doneCount === tasks.length;

  const onUse = (kind, draft) => {
    if (kind === 'prompt') { set({ prompt: draft.prompt, format: draft.format, mode: draft.mode }); setTab('brief'); showToast('Activity drafted — review and set it'); }
    else if (kind === 'framing') { set({ framing: draft }); setTab('frame'); showToast('Framing drafted — review and save'); }
    else if (kind === 'event') { setEventForm(f => ({ ...f, ...draft })); setTab('events'); setShowEventForm(true); showToast('Event drafted — review and schedule'); }
  };

  const savePrompt = () => { setPromptSaved(true); showToast('Activities set'); };
  const saveFraming = () => { setFramingSaved(true); showToast('Framing saved'); };
  const createEvent = () => {
    setEvents(e => [{ ...eventForm, id: Date.now() }, ...e]);
    setEventForm({ title: '', type: 'Workshop', date: '', time: '18:00', dur: '45 min', provider: 'zoom', link: '', desc: '', cover: '', coverPos: 'center 50%' });
    setShowEventForm(false); showToast('Event scheduled');
  };
  const createActivity = () => {
    setActivities(a => [{ ...activityForm, id: Date.now(), submissions: mockSubmissions() }, ...a]);
    setActivityForm({ prompt: '', format: 'video', episode: null, cover: '', coverPos: 'center 50%' });
    setShowActForm(false); showToast('Activity published');
  };
  const invite = () => { setInvited(true); showToast('Invite link copied'); };
  const publish = () => { setPublished(true); showToast('Your community is live'); };

  const TABS = [{ k: 'start', label: 'Start' }, { k: 'feed', label: 'Feed' }, { k: 'brief', label: 'Activities' }, { k: 'events', label: 'Events' }, { k: 'frame', label: 'Settings' }];

  return (
    <React.Fragment>
      <header className="cr-top">
        <div className="wrap cr-top-in">
          <button className="cr-back" onClick={() => showToast('Back to community')}>
            <G d={CR.back} size={16} stroke={2.4}/> Community
          </button>
          <div className="cr-crumb">{C.course}</div>
          <span className={`cr-state${published ? ' live' : ''}`}><span className="sdot"></span>{published ? 'Published' : 'Draft'}</span>
          <button className="cr-tt" aria-label="Toggle appearance" onClick={() => setDark(d => !d)}>
            <span className="ic-moon"><G d={SF.moon} size={17} stroke={1.9}/></span>
            <span className="ic-sun"><G d={SF.sun} size={17} stroke={1.9}/></span>
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => published ? showToast('Your community is live') : publish()}>{published ? 'Published' : 'Publish'}</button>
        </div>
      </header>

      <HeroCover src={st.cover} pos={st.coverPos} onFile={img => { set({ cover: img }); showToast('Cover updated'); }} onPos={p => set({ coverPos: p })}>
        <div className="wrap mh-brand">{C.brand}</div>
        <div className="wrap mh-head">
          <h1 className="mh-title">{st.name}</h1>
          <div className="mh-by">Hosted by Carla Marín</div>
        </div>
      </HeroCover>
      <div className="mh-bar">
        <div className="wrap mh-bar-in">
          <div className="mh-meta">
            <b>0</b> members<span style={{ margin: '0 10px', opacity: .5 }}>·</span>
            <span className="mh-draft">{published ? 'Live · accepting members' : 'Not published yet'}</span>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-quiet btn-sm" onClick={() => {}}><G d={CR.eye} size={15} stroke={1.9}/> View as student</button>
        </div>
      </div>

      <div className="tabs cr-tabs">
        <div className="wrap tabs-in">
          {TABS.map(t => <button key={t.k} className={`tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
      </div>

      <div className="wrap content">
        {tab === 'start'   && <StartTab tasks={tasks} doneCount={doneCount} allDone={allDone} goTab={goTab} invite={invite} publish={publish}/>}
        {tab === 'brief'   && <ActivitiesTab activities={activities} form={activityForm} set={setAct} onCreate={createActivity} showForm={showActForm} setShowForm={setShowActForm} showToast={showToast} events={events}/>}
        {tab === 'feed'    && <window.CRFeedTab showToast={showToast} onPosted={() => setWelcomePosted(true)} events={events}/>}
        {tab === 'events'  && <EventsTab events={events} form={eventForm} set={setEv} onCreate={createEvent} showForm={showEventForm} setShowForm={setShowEventForm} showToast={showToast}/>}
        {tab === 'frame'   && <SettingsTab st={st} set={set} onSaveFraming={saveFraming} framingSaved={framingSaved} showToast={showToast}/>}
      </div>

      {ai && <AIModal ctx={ai.ctx} onClose={() => setAi(null)} onUse={onUse}/>}
      {toast && <div className="toast">{toast}</div>}
    </React.Fragment>
  );
}

window.CUI = {
  Field, Seg, Toggle, CoverDrop, HeroCover, Ring,
  RichComposer, PostExtras, EventAttach, EventCard, EventSheet, ActivityCard, ActivityPage,
  ProviderLogo, providerOf,
  fmtDateLabel, fmtTimeLabel, coverFor, actCover, fmtOf, FORMATS,
  EPISODES, episodeOf, mockSubmissions, useUpload, readFileData, CR,
};

if (!window.__NO_AUTOMOUNT) {
  ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
}
