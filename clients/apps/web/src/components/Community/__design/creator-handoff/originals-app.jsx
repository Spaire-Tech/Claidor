/* ============================================================
   SPAIRE ORIGINALS — tvOS sidebar app (focus-driven, reactive)
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

const SF = {
  play: 'M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5Z',
  check: 'm5 12.5 4.5 4.5L19 6.5',
  chevron: 'm9 6 6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  bookmark: 'M6.5 4h11a1 1 0 0 1 1 1v15.4a.5.5 0 0 1-.78.42L12 17.2l-5.72 3.62A.5.5 0 0 1 5.5 20.4V5a1 1 0 0 1 1-1Z',
  download: 'M12 3.5v11 M8 11l4 3.8 4-3.8 M5 19.5h14',
  bubble: 'M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.35-4.5A8 8 0 1 1 21 11.5Z',
  infoCircle: 'M12 21.2a9.2 9.2 0 1 0 0-18.4 9.2 9.2 0 0 0 0 18.4 M12 11v5.2 M12 7.9h.012',
  heart: 'M12 20.2s-7.2-4.4-9.4-9.2C1.2 7.8 3 4.4 6.6 4.4c2 0 3.3 1.2 3.6 1.9.3-.7 1.6-1.9 3.6-1.9 3.6 0 5.4 3.4 4 6.6C19.2 15.8 12 20.2 12 20.2Z',
  send: 'M21 3 3 11l7 2.6L13 21l8-18Z',
  workbook: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z M5 4.5V19.5 M9 8h6M9 11h4',
  community: 'M9 8a3 3 0 1 0 0-.01 M3 20c0-3 2.7-5 6-5s6 2 6 5 M16 4a3 3 0 0 1 0 6 M18 15c2 .5 3.2 2 3.2 4.2',
  doc: 'M7 3h7l5 5v13a0 0 0 0 1 0 0H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5 M9.5 13h6 M9.5 16.5h6',
  pause: 'M8.5 5h3v14h-3z M13.5 5h3v14h-3z',
  back: 'M15 5l-7 7 7 7',
  fullscreen: 'M4 9V5a1 1 0 0 1 1-1h4 M20 9V5a1 1 0 0 0-1-1h-4 M4 15v4a1 1 0 0 0 1 1h4 M20 15v4a1 1 0 0 1-1 1h-4',
  captions: 'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M7.5 11a2 2 0 1 0 0 2 M14 11a2 2 0 1 0 0 2',
  list: 'M8.5 6.5h12 M8.5 12h12 M8.5 17.5h12 M4 6.5h.01 M4 12h.01 M4 17.5h.01',
  link: 'M9.5 14.5 14.5 9.5 M8 11 6.2 12.8a3.4 3.4 0 0 0 4.8 4.8L13 15.8 M16 13l1.8-1.8a3.4 3.4 0 0 0-4.8-4.8L11 8.2',
  audio: 'M11 5 6 9H3v6h3l5 4z M15.5 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  videoclip: 'M4 6.5h11a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z M16 10l5-3v10l-5-3',
  pdf: 'M7 3h7l5 5v13a0 0 0 0 1 0 0H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M14 3v5h5',
  lock: 'M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3 M6 10.5h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
  locksm: 'M8 10V7.5a4 4 0 0 1 8 0V10 M6.5 10h11a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z',
  play2: 'M8 6.5v11a1 1 0 0 0 1.5.87l9-5.5a1 1 0 0 0 0-1.74l-9-5.5A1 1 0 0 0 8 6.5Z',
  infinity: 'M6.5 9a3 3 0 1 0 0 6c2 0 3-1.6 5.5-3s3.5-3 5.5-3a3 3 0 1 1 0 6c-2 0-3-1.6-5.5-3S8.5 9 6.5 9Z',
  sparkle: 'M12 3l1.7 4.8L18.5 9.5l-4.8 1.7L12 16l-1.7-4.8L5.5 9.5l4.8-1.7z',
  checkFill: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M7.5 12l3 3 6-6',
};
function Glyph({ d, size=24, stroke=2, fill='none' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill==='none'?'currentColor':'none'}
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{d.split(' M').map((seg,i)=><path key={i} d={(i?'M':'')+seg}/>)}</svg>;
}

function Stage({ children }) {
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth/1920, window.innerHeight/1080);
      const el = document.getElementById('stage');
      if (el) el.style.transform = `translate(-50%,-50%) scale(${s})`;
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return <div id="viewport"><div id="stage">{children}</div></div>;
}

function EpisodeRow({ ep, status, bookmarked, locked, focused, onFocus, onPlay, refEl }) {
  return (
    <button ref={refEl} className={`ep-row ${focused?'focused':''} ${status==='watched'?'is-watched':''} ${locked?'is-locked-row':''}`}
      onMouseEnter={onFocus} onClick={onPlay}>
      <div className="thumb" style={{ backgroundImage:`url(${ep.thumb||ep.img})` }}>
        <div className="epnum">{ep.n}</div>
        {status==='progress' && !locked && <div className="ep-prog"><i style={{ width:`${(ep.progress||0)*100}%` }}/></div>}
        {status==='watched' && <div className="watched-badge"><Glyph d={SF.check} size={12} stroke={2.6}/></div>}
        {locked && <div className="lock-veil"><Glyph d={SF.locksm} size={20} stroke={1.9}/></div>}
      </div>
      <div className="meta">
        <div className="ttl">{ep.title}</div>
        <div className="sub">{locked ? 'Locked · '+ep.dur : status==='watched' ? 'Watched · '+ep.dur : status==='progress' ? 'Continue · '+ep.dur : ep.sub}</div>
      </div>
      <div className="trail">
        {bookmarked && <span className="trail-bm"><Glyph d={SF.bookmark} size={15} fill="currentColor"/></span>}
        {locked
          ? <span className="trail-lock"><Glyph d={SF.locksm} size={17} stroke={2}/></span>
          : status==='progress'
            ? <div className="nowbars"><i/><i/><i/></div>
            : status==='watched'
              ? <span className="trail-check"><Glyph d={SF.check} size={13} stroke={2.4}/></span>
              : <Glyph d={SF.chevron} size={20} stroke={2.2}/>}
      </div>
    </button>
  );
}

/* ---------- class info sheet (ⓘ) ---------- */
function InfoSheet({ onClose, lessonsDone, total }) {
  useEffect(() => {
    const h = (e) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const bullets = [
    'Build a reliable forehand, backhand, and serve from the ground up',
    'Develop the footwork to reach any ball and recover in balance',
    'Construct points with the patterns the pros actually use',
    'Train the mental routines that win the points that matter',
  ];
  return (
    <div className="sheet-overlay" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="sheet">
        <button className="sheet-x" onClick={onClose}><Glyph d={SF.close} size={20} stroke={2.2}/></button>
        <div className="sheet-hero">
          <img src={window.SHOW.portrait} alt={window.SHOW.instructor}/>
          <div className="sheet-hero-txt">
            <div className="se">{window.SHOW.brand}</div>
            <div className="sn">{window.SHOW.instructor}</div>
            <div className="sc">{window.SHOW.teaches}</div>
          </div>
        </div>
        <div className="sheet-body">
          <p className="sheet-bio">{window.SHOW.bio} In this class, Carla shares the exact technique, footwork, and mindset that took her to the top of the game — broken into {total} lessons you can practice at your own pace.</p>
          <div className="sheet-progress">
            <div className="spt"><span>Your progress</span><span>{lessonsDone} of {total} lessons</span></div>
            <div className="spbar"><i style={{ width:`${Math.round(lessonsDone/total*100)}%` }}/></div>
          </div>
          <div className="sheet-h">What you’ll learn</div>
          <ul className="sheet-list">
            {bullets.map((b,i)=>(<li key={i}><span className="ck"><Glyph d={SF.check} size={12} stroke={2.4}/></span>{b}</li>))}
          </ul>
          <div className="sheet-meta">
            <div className="smi"><Glyph d={SF.workbook} size={20}/><span>Class workbook (PDF)</span></div>
            <div className="smi"><Glyph d={SF.community} size={20}/><span>Community discussion</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- discussion panel (glass, right-docked) ---------- */
function CommentRow({ c, onLike }) {
  return (
    <div className="cmt">
      <img className="cmt-av" src={c.avatar} alt={c.name}/>
      <div className="cmt-main">
        <div className="cmt-top"><span className="cmt-name">{c.name}</span><span className="cmt-dot"/><span className="cmt-time">{c.time}</span></div>
        <div className="cmt-text">{c.text}</div>
        <div className="cmt-actions">
          <button className={`cmt-like ${c.liked?'on':''}`} onClick={()=>onLike(c.id)}>
            <Glyph d={SF.heart} size={16} fill={c.liked?'currentColor':'none'} stroke={c.liked?0:1.9}/>
            {c.likes>0 && <span>{c.likes}</span>}
          </button>
          <button className="cmt-reply">Reply</button>
        </div>
      </div>
    </div>
  );
}
function CommentsPanel({ lesson, comments, onClose, onLike, onPost }) {
  const [text, setText] = useState('');
  const listRef = useRef();
  useEffect(() => {
    const h = (e) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [comments.length]);
  const post = () => { if (!text.trim()) return; onPost(text.trim()); setText(''); };
  return (
    <div className="cmt-overlay" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <aside className="cmt-panel">
        <div className="cmt-head">
          <div>
            <div className="cmt-h-title">Discussion</div>
            <div className="cmt-h-sub">Lesson {lesson.n} · {lesson.title}</div>
          </div>
          <button className="sheet-x" onClick={onClose}><Glyph d={SF.close} size={20} stroke={2.2}/></button>
        </div>
        <div className="cmt-count">{comments.length} {comments.length===1?'comment':'comments'}</div>
        <div className="cmt-list" ref={listRef}>
          {comments.length===0
            ? <div className="cmt-empty"><div className="ce-ico"><Glyph d={SF.bubble} size={30} stroke={1.6}/></div>Be the first to comment on this lesson.</div>
            : comments.map(c => <CommentRow key={c.id} c={c} onLike={onLike}/>)}
        </div>
        <div className="cmt-compose">
          <img className="cmt-av sm" src={window.VIEWER.avatar} alt="You"/>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') post(); }} placeholder="Add to the discussion…"/>
          <button className="cmt-send" disabled={!text.trim()} onClick={post}><Glyph d={SF.send} size={20} fill="currentColor"/></button>
        </div>
      </aside>
    </div>
  );
}

/* ---------- skip ±10s icon (gobackward.10 style) ---------- */
function SkipIcon({ dir=-1, n=10, size=30 }) {
  const flip = dir>0;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <g transform={flip?'translate(24,0) scale(-1,1)':undefined}>
        <path d="M4.6 9A8 8 0 1 1 4 13.4"/>
        <path d="M4.6 9 4 4.6 M4.6 9 9 8.5"/>
      </g>
      <text x="12" y="15.2" fontSize="7.6" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">{n}</text>
    </svg>
  );
}

const RES_ICON = { pdf:'pdf', audio:'audio', video:'videoclip', link:'link' };

/* ---------- lesson overview sheet ---------- */
function OverviewSheet({ lesson, bookmarked, locked, onClose, onPlay, onChapter, onBookmark, onDownload }) {
  const o = window.getOverview(lesson);
  useEffect(() => {
    const h = (e) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="sheet-overlay" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="ov-sheet">
        <button className="sheet-x ov-x" onClick={onClose}><Glyph d={SF.close} size={20} stroke={2.2}/></button>
        <div className="ov-scroll">
          <div className="ov-hero" style={{ backgroundImage:`url(${lesson.img})` }}>
            <button className="ov-play" onClick={onPlay}><Glyph d={locked?SF.lock:SF.play} size={locked?30:30} stroke={locked?2:0} fill={locked?'none':'#fff'}/></button>
            <div className="ov-hero-meta">
              <div className="ov-eyebrow">{window.SHOW.brand} · Lesson {lesson.n}{locked?' · Locked':''}</div>
              <div className="ov-title">{lesson.title}</div>
              <div className="ov-sub">{lesson.dur} · {window.SHOW.instructor}</div>
            </div>
          </div>
          <div className="ov-body">
            <div className="ov-chips">
              {locked ? (
                <button className="btn-tv primary sm" onClick={onPlay}><Glyph d={SF.lock} size={20} stroke={2.1}/> Unlock — {window.PRICING.price}</button>
              ) : (
                <button className="btn-tv primary sm" onClick={onPlay}><Glyph d={SF.play} size={22} fill="currentColor"/> Play lesson</button>
              )}
              <button className={`btn-tv icon-only sm ${bookmarked?'on':''}`} onClick={onBookmark} aria-label="Bookmark"><Glyph d={SF.bookmark} size={21} fill={bookmarked?'currentColor':'none'} stroke={bookmarked?0:2}/></button>
              <button className="btn-tv icon-only sm" onClick={onDownload} aria-label="Download"><Glyph d={SF.download} size={22} stroke={2}/></button>
            </div>

            <div className="ov-h">Lesson overview</div>
            {o.body.map((p,i)=><p className="ov-p" key={i}>{p}</p>)}

            <div className="ov-h">In this lesson</div>
            <ul className="ov-learn">
              {o.learn.map((b,i)=><li key={i}><span className="ck"><Glyph d={SF.check} size={12} stroke={2.4}/></span>{b}</li>)}
            </ul>

            <div className="ov-h">Chapters</div>
            <div className="ov-chapters">
              {o.chapters.map((c,i)=>(
                <button className="ov-chap" key={i} onClick={()=>onChapter(c.t)}>
                  <span className="ov-chap-t">{window.fmtTime(c.t)}</span>
                  <span className="ov-chap-l">{c.label}</span>
                  <span className="ov-chap-play"><Glyph d={SF.play} size={15} fill="currentColor"/></span>
                </button>
              ))}
            </div>

            <div className="ov-h">Resources</div>
            <div className="ov-res">
              {o.resources.map((r,i)=>(
                <button className="ov-res-row" key={i} onClick={onDownload}>
                  <span className="ov-res-ico"><Glyph d={SF[RES_ICON[r.type]||'pdf']} size={22} stroke={1.9}/></span>
                  <span className="ov-res-main"><span className="rn">{r.name}</span><span className="rm">{r.meta}</span></span>
                  <span className="ov-res-dl"><Glyph d={r.type==='link'?SF.link:SF.download} size={20} stroke={2}/></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- chapters side panel (in player) ---------- */
function ChaptersPanel({ chapters, current, onSeek, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="cmt-overlay" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <aside className="cmt-panel">
        <div className="cmt-head">
          <div><div className="cmt-h-title">Chapters</div><div className="cmt-h-sub">{chapters.length} sections</div></div>
          <button className="sheet-x" onClick={onClose}><Glyph d={SF.close} size={20} stroke={2.2}/></button>
        </div>
        <div className="cmt-list" style={{ paddingTop:8 }}>
          {chapters.map((c,i)=>(
            <button className={`chap-row ${current===i?'on':''}`} key={i} onClick={()=>onSeek(c.t)}>
              <span className="chap-time">{window.fmtTime(c.t)}</span>
              <span className="chap-label">{c.label}</span>
              {current===i ? <span className="chap-now"><div className="nowbars"><i/><i/><i/></div></span> : <span className="chap-go"><Glyph d={SF.play} size={14} fill="currentColor"/></span>}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

/* ---------- video player ---------- */
function VideoPlayer({ lesson, startSec, comments, onClose, onLike, onPost, onProgress, onComplete }) {
  const dur = lesson.durSec;
  const [t, setT] = useState(Math.min(dur, Math.max(0, Math.round(startSec||0))));
  const [paused, setPaused] = useState(false);
  const [side, setSide] = useState(null);     // 'discussion' | 'chapters'
  const [cc, setCc] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);
  const o = window.getOverview(lesson);
  const barRef = useRef();
  const dragging = useRef(false);
  const tRef = useRef(t); tRef.current = t;
  const done = useRef(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setT(x => x>=dur ? dur : x+1), 1000);
    return () => clearInterval(id);
  }, [paused, dur]);
  useEffect(() => {
    if (t>=dur && !done.current) { done.current = true; setPaused(true); onComplete && onComplete(); }
  }, [t, dur]);

  const exit = () => { onProgress && onProgress(tRef.current/dur); onClose(); };
  useEffect(() => {
    const h = (e) => {
      if (e.key==='Escape') { if (side) setSide(null); else exit(); }
      else if (e.key===' ') { e.preventDefault(); setPaused(p=>!p); }
      else if (e.key==='ArrowRight') setT(x=>Math.min(dur,x+10));
      else if (e.key==='ArrowLeft') setT(x=>Math.max(0,x-10));
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [side, dur]);

  const seekAt = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - r.left)/r.width));
    setT(Math.round(dur*ratio));
  };
  useEffect(() => {
    const mv = (e) => { if (dragging.current) seekAt(e.clientX); };
    const up = () => { dragging.current = false; };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [dur]);

  const frac = dur ? t/dur : 0;
  const curIdx = (() => { let idx=0; o.chapters.forEach((c,i)=>{ if(c.t<=t) idx=i; }); return idx; })();
  const curChap = o.chapters[curIdx];

  return (
    <div className={`player ${uiHidden && !paused ? 'ui-hidden':''}`} onMouseMove={()=>setUiHidden(false)}>
      <div className="player-video" style={{ backgroundImage:`url(${lesson.img})` }}/>
      <div className="player-vignette"/>

      {paused && <button className="player-bigplay" onClick={()=>setPaused(false)} aria-label="Play"><Glyph d={SF.play} size={48} fill="#fff"/></button>}
      {cc && <div className="player-cc">{curChap ? curChap.label : lesson.title}</div>}

      {/* top bar */}
      <div className="player-top">
        <button className="pbtn" onClick={exit} aria-label="Back"><Glyph d={SF.back} size={26} stroke={2}/></button>
        <div className="player-title">
          <div className="pt-k">{window.SHOW.instructor} · {window.SHOW.courseTitle}</div>
          <div className="pt-t">Lesson {lesson.n} · {lesson.title}</div>
        </div>
        <div className="player-top-right"><span className="pchip">4K</span><span className="pchip">Dolby</span></div>
      </div>

      {/* bottom controls */}
      <div className="player-controls">
        <div className="scrub-row">
          <span className="ptime">{window.fmtTime(t)}</span>
          <div className="scrub" ref={barRef} onMouseDown={(e)=>{ dragging.current=true; seekAt(e.clientX); }}>
            <div className="scrub-track">
              <div className="scrub-buf" style={{ width:`${Math.min(100,frac*100+8)}%` }}/>
              <div className="scrub-fill" style={{ width:`${frac*100}%` }}/>
              {o.chapters.slice(1).map((c,i)=><span key={i} className="scrub-tick" style={{ left:`${c.t/dur*100}%` }}/>)}
              <div className="scrub-knob" style={{ left:`${frac*100}%` }}/>
            </div>
          </div>
          <span className="ptime">-{window.fmtTime(Math.max(0,dur-t))}</span>
        </div>

        <div className="transport">
          <div className="tp-left">
            <span className="tp-chaplabel">{curChap ? `${window.fmtTime(curChap.t)} · ${curChap.label}` : lesson.title}</span>
          </div>
          <div className="tp-center">
            <button className="pbtn" onClick={()=>setT(x=>Math.max(0,x-10))} aria-label="Back 10 seconds"><SkipIcon dir={-1} n={10} size={34}/></button>
            <button className="pbtn big" onClick={()=>setPaused(p=>!p)} aria-label={paused?'Play':'Pause'}><Glyph d={paused?SF.play:SF.pause} size={34} fill="currentColor"/></button>
            <button className="pbtn" onClick={()=>setT(x=>Math.min(dur,x+10))} aria-label="Forward 10 seconds"><SkipIcon dir={1} n={10} size={34}/></button>
          </div>
          <div className="tp-right">
            <button className={`pbtn sm ${side==='chapters'?'on':''}`} onClick={()=>setSide(s=>s==='chapters'?null:'chapters')} aria-label="Chapters"><Glyph d={SF.list} size={23} stroke={2}/></button>
            <button className={`pbtn sm ${cc?'on':''}`} onClick={()=>setCc(c=>!c)} aria-label="Captions"><Glyph d={SF.captions} size={23} stroke={1.9}/></button>
            <button className={`pbtn sm ${side==='discussion'?'on':''}`} onClick={()=>setSide(s=>s==='discussion'?null:'discussion')} aria-label="Discussion">
              <Glyph d={SF.bubble} size={23} stroke={2}/>{comments.length>0 && <span className="pbtn-badge">{comments.length}</span>}
            </button>
            <button className="pbtn sm" onClick={exit} aria-label="Fullscreen"><Glyph d={SF.fullscreen} size={23} stroke={2}/></button>
          </div>
        </div>
      </div>

      {side==='discussion' && <CommentsPanel lesson={lesson} comments={comments} onClose={()=>setSide(null)} onLike={onLike} onPost={onPost}/>}
      {side==='chapters' && <ChaptersPanel chapters={o.chapters} current={curIdx} onSeek={(tt)=>setT(tt)} onClose={()=>setSide(null)}/>}
    </div>
  );
}

/* ---------- subscribe / paywall sheet (Apple-style, single creator plan) ---------- */
function SubscribeSheet({ onClose, onSubscribe }) {
  const P = window.PRICING;
  useEffect(() => {
    const h = (e) => { if (e.key==='Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  return (
    <div className="sub-overlay" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="sub-sheet">
        <button className="sub-x" onClick={onClose}><Glyph d={SF.close} size={19} stroke={2.2}/></button>

        {/* hero = the creator's course cover */}
        <div className="sub-hero" style={{ backgroundImage:`url(${window.SHOW.cover})` }}>
          <div className="sub-hero-scrim"/>
          <div className="sub-hero-txt">
            <div className="sub-eyebrow">with {window.SHOW.instructor}</div>
            <div className="sub-title">{window.SHOW.courseTitle}</div>
          </div>
        </div>

        <div className="sub-body">
          <div className="plan sel">
            <div className="plan-head">
              <div>
                <div className="plan-name">{P.planName}</div>
                <div className="plan-tag">{P.tag}</div>
              </div>
              <div className="plan-price"><b>{P.price}</b></div>
            </div>
            <div className="plan-div"/>
            <div className="plan-features">
              {P.features.map((f,i)=>(
                <div className="plan-feat" key={i}><span className="pf-ico"><Glyph d={SF[f.icon]||SF.play2} size={17} stroke={1.9} fill={f.icon==='play2'?'currentColor':'none'}/></span>{f.text}</div>
              ))}
            </div>
          </div>

          <button className="sub-cta" onClick={()=>onSubscribe(P)}>{P.cta}</button>
          <div className="sub-note">{P.note}</div>
          <button className="sub-alt" onClick={onClose}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const eps = window.EPISODES;
  const [focus, setFocus] = useState(0);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [info, setInfo] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [playerStart, setPlayerStart] = useState(0);
  const [subscribed, setSubscribed] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [bookmarks, setBookmarks] = useState(() => new Set());
  const [watched, setWatched] = useState(() => new Set(eps.filter(e=>e.state==='watched').map(e=>e.id)));
  const [progress, setProgress] = useState(() => {
    const m = {}; eps.forEach(e=>{ if(e.progress!=null && e.state!=='watched') m[e.id]=e.progress; }); return m;
  });
  const [comments, setComments] = useState(() => {
    const m = {}; eps.forEach(e => { m[e.id] = (window.COMMENTS[e.id]||[]).map(c=>({...c})); }); return m;
  });
  const rowRefs = useRef([]);
  const listRef = useRef();
  const toastT = useRef();

  const ep = eps[focus];
  const isLocked = (e) => !subscribed && e.n > window.SHOW.freePreview;
  const epLocked = isLocked(ep);
  const statusOf = (e) => watched.has(e.id) ? 'watched' : (progress[e.id]!=null ? 'progress' : 'unwatched');
  const status = statusOf(ep);
  const lessonsDone = watched.size;
  const isBookmarked = bookmarks.has(ep.id);
  const epComments = comments[ep.id] || [];

  const showToast = useCallback((msg, icon='check') => {
    setToast({ msg, icon });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(()=>setToast(null), 2400);
  }, []);

  useEffect(() => { setActive(focus); }, [focus]);
  useEffect(() => {
    const el = rowRefs.current[focus], list = listRef.current;
    if (el && list) {
      const top = el.offsetTop, bottom = top + el.offsetHeight;
      if (top < list.scrollTop + 6) list.scrollTo({ top: top - 6, behavior:'smooth' });
      else if (bottom > list.scrollTop + list.clientHeight - 6) list.scrollTo({ top: bottom - list.clientHeight + 6, behavior:'smooth' });
    }
  }, [focus]);

  const playLesson = useCallback((i, startSec=null) => {
    const e = eps[i];
    if (!subscribed && e.n > window.SHOW.freePreview) { setFocus(i); setOverviewOpen(false); setSubOpen(true); return; }
    const start = startSec!=null ? startSec : (progress[e.id]!=null ? progress[e.id]*e.durSec : 0);
    setFocus(i); setPlayerStart(start); setOverviewOpen(false); setPlaying(true);
  }, [eps, progress, subscribed]);

  const markComplete = useCallback((id) => {
    setWatched(w => { const n = new Set(w); n.add(id); return n; });
    setProgress(p => { const n = {...p}; delete n[id]; return n; });
  }, []);
  const markProgress = useCallback((id, frac) => {
    if (frac >= 0.97) { markComplete(id); return; }
    if (frac > 0.03) setProgress(p => ({ ...p, [id]: frac }));
  }, [markComplete]);

  const toggleBookmark = useCallback(() => {
    setBookmarks(b => {
      const n = new Set(b);
      if (n.has(ep.id)) { n.delete(ep.id); showToast('Bookmark removed','bookmark'); }
      else { n.add(ep.id); showToast('Lesson bookmarked','bookmark'); }
      return n;
    });
  }, [ep, showToast]);

  const onSubscribe = useCallback((plan) => {
    setSubscribed(true); setSubOpen(false);
    showToast('You’re in — full course unlocked','check');
  }, [showToast]);

  const downloadWorkbook = useCallback(() => {
    const body = [
      `CHAMPIONSHIP TENNIS — ${window.SHOW.instructor}`,
      `Lesson ${ep.n}: ${ep.title}  (${ep.dur})`,
      ``,
      ep.synopsis,
      ``,
      `— Practice notes ———————————————`,
      `1. Warm up for 10 minutes before drilling.`,
      `2. Film yourself and compare to the lesson.`,
      `3. Track reps below:`,
      ``,
      `[ ] Set 1   [ ] Set 2   [ ] Set 3`,
      ``,
      `Spaire Originals · ${window.SHOW.courseTitle}`,
    ].join('\n');
    const blob = new Blob([body], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Championship Tennis — Lesson ${ep.n} Workbook.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    showToast('Workbook downloaded','download');
  }, [ep, showToast]);

  const likeComment = useCallback((cid, lid=ep.id) => {
    setComments(all => ({ ...all, [lid]: (all[lid]||[]).map(c => c.id===cid ? { ...c, liked:!c.liked, likes:c.likes+(c.liked?-1:1) } : c) }));
  }, [ep.id]);
  const postComment = useCallback((txt, lid=ep.id) => {
    const c = { id:'c'+Date.now(), name:window.VIEWER.name, avatar:window.VIEWER.avatar, time:'now', text:txt, likes:0, liked:false };
    setComments(all => ({ ...all, [lid]: [...(all[lid]||[]), c] }));
    showToast('Comment posted','bubble');
  }, [ep.id, showToast]);

  useEffect(() => {
    const onKey = (e) => {
      if (playing) return; // player handles its own keys
      if (info || showComments || overviewOpen) { if (e.key==='Escape') { setInfo(false); setShowComments(false); setOverviewOpen(false); } return; }
      if (e.key==='ArrowDown') { e.preventDefault(); setFocus(f => Math.min(eps.length-1, f+1)); }
      else if (e.key==='ArrowUp') { e.preventDefault(); setFocus(f => Math.max(0, f-1)); }
      else if (e.key==='Enter') { e.preventDefault(); playLesson(focus); }
      else if (e.key.toLowerCase()==='o') { setOverviewOpen(true); }
      else if (e.key.toLowerCase()==='b') { toggleBookmark(); }
      else if (e.key.toLowerCase()==='c') { setShowComments(true); }
      else if (e.key.toLowerCase()==='i') { setInfo(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, info, showComments, overviewOpen, focus, eps.length, playLesson, toggleBookmark]);

  const now = new Date();
  const time = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  const playLabel = status==='watched' ? 'Replay' : status==='progress' ? 'Resume' : 'Play';
  const nowLabel = status==='watched' ? 'Completed' : status==='progress' ? 'Continue · Lesson '+ep.n : 'Up Next · Lesson '+ep.n;

  return (
    <Stage>
      {eps.map((e,i) => (
        <div key={e.id} className={`hero-layer ${i===active?'show':''}`} style={{ backgroundImage:`url(${e.img})` }}/>
      ))}
      <div className="hero-scrim"/>
      <div className="hero-grain"/>

      <div className="statusbar">{time}</div>

      {/* sidebar */}
      <aside className="sidebar">
        <div className="sb-eyebrow">{window.SHOW.brand}</div>
        <div className="sb-header">
          <img className="sb-portrait" src={window.SHOW.portrait} alt={window.SHOW.instructor}/>
          <div className="sb-brand">
            <div className="nm">{window.SHOW.instructor}</div>
            <div className="ct">{window.SHOW.courseTitle}</div>
          </div>
        </div>
        <div className="sb-divider"/>
        <div className="sb-section">
          <span>{window.SHOW.lessonsLabel}</span><span className="sdot"/>
          <span>{window.SHOW.runtime}</span><span className="sdot"/>
          <span>{subscribed ? (lessonsDone>0 ? `${lessonsDone} watched` : window.SHOW.level) : `${window.SHOW.freePreview} free`}</span>
        </div>
        <div className="sb-list" ref={listRef}>
          {eps.map((e,i) => (
            <EpisodeRow key={e.id} ep={e} status={statusOf(e)} bookmarked={bookmarks.has(e.id)} locked={isLocked(e)} focused={i===focus}
              refEl={el => rowRefs.current[i] = el}
              onFocus={() => setFocus(i)} onPlay={() => playLesson(i)}/>
          ))}
        </div>
      </aside>

      {/* detail panel */}
      <div className="detail" key={ep.id}>
        <div className="eyebrow">{window.SHOW.brand} · {window.SHOW.instructor}</div>
        <div className={`kicker ${status==='watched'?'done':''} ${epLocked?'locked':''}`}>{epLocked ? 'Locked · Lesson '+ep.n : nowLabel}</div>
        <div className="title">{ep.title}</div>
        <div className="synopsis">{ep.synopsis}</div>
        <div className="meta-row">
          <span>Lesson {ep.n}</span><span className="dot"/>
          <span>{ep.dur}</span><span className="dot"/>
          <span>{window.SHOW.level}</span>
          <span className="pill">Self-paced</span>
        </div>
        <div className="actions">
          {epLocked ? (
            <button className="btn-tv primary" onClick={()=>setSubOpen(true)}>
              <Glyph d={SF.lock} size={23} stroke={2.1}/> Unlock — {window.PRICING.price}
            </button>
          ) : (
            <button className="btn-tv primary" onClick={()=>playLesson(focus)}>
              <Glyph d={SF.play} size={26} fill="currentColor"/> {playLabel} Lesson {ep.n}
            </button>
          )}
          <button className="btn-tv" onClick={()=>setOverviewOpen(true)}>
            <Glyph d={SF.doc} size={23} stroke={1.9}/> Overview
          </button>
          <button className={`btn-tv icon-only ${isBookmarked?'on':''}`} onClick={toggleBookmark} aria-label="Bookmark lesson">
            <Glyph d={SF.bookmark} size={24} fill={isBookmarked?'currentColor':'none'} stroke={isBookmarked?0:2}/>
          </button>
          <button className="btn-tv icon-only" onClick={downloadWorkbook} aria-label="Download workbook">
            <Glyph d={SF.download} size={25} stroke={2}/>
          </button>
          <button className="btn-tv icon-only" onClick={()=>setShowComments(true)} aria-label="Discussion">
            <Glyph d={SF.bubble} size={24} stroke={2}/>
            {epComments.length>0 && <span className="btn-badge">{epComments.length}</span>}
          </button>
          <button className="btn-tv icon-only" onClick={()=>setInfo(true)} aria-label="About this class">
            <Glyph d={SF.infoCircle} size={25} stroke={2}/>
          </button>
        </div>
      </div>

      {/* hint */}
      <div className="hint">
        <kbd>↑</kbd><kbd>↓</kbd> <span>Browse</span><span className="hsep">·</span>
        <kbd>↵</kbd> <span>Play</span><span className="hsep">·</span>
        <kbd>O</kbd> <span>Overview</span><span className="hsep">·</span>
        <kbd>C</kbd> <span>Discussion</span>
      </div>

      {toast && <div className="toast"><span className="tk"><Glyph d={SF[toast.icon]||SF.check} size={15} stroke={2.4} fill={toast.icon==='bookmark'?'currentColor':'none'}/></span>{toast.msg}</div>}

      {info && <InfoSheet onClose={()=>setInfo(false)} lessonsDone={lessonsDone} total={eps.length}/>}
      {subOpen && <SubscribeSheet onClose={()=>setSubOpen(false)} onSubscribe={onSubscribe}/>}
      {overviewOpen && <OverviewSheet lesson={ep} bookmarked={isBookmarked} locked={epLocked} onClose={()=>setOverviewOpen(false)}
        onPlay={()=>playLesson(focus)} onChapter={(t)=>playLesson(focus, t)} onBookmark={toggleBookmark} onDownload={downloadWorkbook}/>}
      {showComments && <CommentsPanel lesson={ep} comments={epComments} onClose={()=>setShowComments(false)} onLike={likeComment} onPost={postComment}/>}

      {playing && <VideoPlayer lesson={ep} startSec={playerStart} comments={epComments}
        onClose={()=>setPlaying(false)}
        onLike={(cid)=>likeComment(cid, ep.id)} onPost={(txt)=>postComment(txt, ep.id)}
        onProgress={(frac)=>markProgress(ep.id, frac)} onComplete={()=>markComplete(ep.id)}/>}
    </Stage>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
