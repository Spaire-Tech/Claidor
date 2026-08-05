/* ============================================================
   SPAIRE ORIGINALS v2 — shared parts
   Glyphs · sheets · player · side panels
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
  heart: 'M12 20.2s-7.2-4.4-9.4-9.2C1.2 7.8 3 4.4 6.6 4.4c2 0 3.3 1.2 3.6 1.9.3-.7 1.6-1.9 3.6-1.9 3.6 0 5.4 3.4 4 6.6C19.2 15.8 12 20.2 12 20.2Z',
  send: 'M21 3 3 11l7 2.6L13 21l8-18Z',
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
  info: 'M12 21.2a9.2 9.2 0 1 0 0-18.4 9.2 9.2 0 0 0 0 18.4 M12 11v5.2 M12 7.9h.012',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  camera: 'M4 8.5h3.2L9 6h6l1.8 2.5H20a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z M12 16.8a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2 M12 13.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2',
};

function Glyph({ d, size=24, stroke=2, fill='none' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill==='none'?'currentColor':'none'}
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">{d.split(' M').map((seg,i)=><path key={i} d={(i?'M':'')+seg}/>)}</svg>;
}

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

function useEsc(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key==='Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [onClose]);
}

/* ---------- lesson overview sheet (glass, cover up top) ---------- */
const RES_ICON = { pdf:'pdf', audio:'audio', video:'videoclip', link:'link' };

function OverviewSheet({ lesson, bookmarked, locked, onClose, onPlay, onBookmark, onDownload }) {
  const o = window.getOverview(lesson);
  useEsc(onClose);
  return (
    <div className="sheet-overlay" data-screen-label="Lesson Overview Sheet" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="x-sheet wide">
        <div className="xs-cover">
          <img src={lesson.img} alt=""/>
          <div className="xs-shade"></div>
          <div className="xs-eyebrow"><span className="dot"></span><span>{window.SHOW.brand} · Lesson {lesson.n}{locked?' · Locked':''}</span></div>
          <div className="xs-title">
            {lesson.title}
            <div className="xs-titlesub">{lesson.dur} · {window.SHOW.instructor}</div>
          </div>
          <button className="xs-close" onClick={onClose} aria-label="Close"><Glyph d={SF.close} size={13} stroke={2.4}/></button>
        </div>
        <div className="xs-body">
          <div className="ov-chips">
            <button className="cta-main" onClick={onPlay}>
              {locked
                ? <React.Fragment><Glyph d={SF.lock} size={17} stroke={2.1}/> Unlock — {window.PRICING.price}</React.Fragment>
                : <React.Fragment><Glyph d={SF.play} size={17} fill="currentColor"/> Play lesson</React.Fragment>}
            </button>
            <button className={`icon-glass ${bookmarked?'on':''}`} onClick={onBookmark} aria-label="Bookmark">
              <Glyph d={SF.bookmark} size={19} fill={bookmarked?'currentColor':'none'} stroke={bookmarked?0:2}/>
            </button>
          </div>

          <div className="ov-h">Lesson overview</div>
          {o.body.map((p,i)=><p className="ov-p" key={i}>{p}</p>)}

          <div className="ov-h">In this lesson</div>
          <ul className="ov-learn">
            {o.learn.map((b,i)=><li key={i}>{b}</li>)}
          </ul>

          <div className="ov-h">Resources</div>
          <div className="ov-res">
            {o.resources.map((r,i)=>(
              <button className="ov-res-row" key={i} onClick={onDownload}>
                <span className="ov-res-ico"><Glyph d={SF[RES_ICON[r.type]||'pdf']} size={21} stroke={1.9}/></span>
                <span className="ov-res-main"><span className="rn">{r.name}</span><span className="rm">{r.meta}</span></span>
                <span className="ov-res-dl"><Glyph d={r.type==='link'?SF.link:SF.download} size={19} stroke={2}/></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- subscribe sheet (enroll-style, cover up top) ---------- */
function SubscribeSheet({ onClose, onSubscribe }) {
  const P = window.PRICING;
  useEsc(onClose);
  return (
    <div className="sheet-overlay" data-screen-label="Subscribe Sheet" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div className="x-sheet">
        <div className="xs-cover">
          <img src={window.SHOW.cover} alt=""/>
          <div className="xs-shade"></div>
          <div className="xs-eyebrow"><span className="dot"></span><span>{window.SHOW.brand}</span></div>
          <div className="xs-title">
            {window.SHOW.courseTitle}
            <div className="xs-titlesub">with {window.SHOW.instructor}</div>
          </div>
          <button className="xs-close" onClick={onClose} aria-label="Close"><Glyph d={SF.close} size={13} stroke={2.4}/></button>
        </div>
        <div className="xs-body">
          <div className="plan">
            <div className="plan-head">
              <div>
                <div className="plan-name">{P.planName}</div>
                <div className="plan-tag">{P.tag}</div>
              </div>
              <div className="plan-price">{P.price}</div>
            </div>
            <div className="plan-div"></div>
            <div className="plan-features">
              {P.features.map((f,i)=>(
                <div className="plan-feat" key={i}>
                  <span className="pf-ico"><Glyph d={SF[f.icon]||SF.play2} size={17} stroke={1.9} fill={f.icon==='play2'?'currentColor':'none'}/></span>
                  {f.text}
                </div>
              ))}
            </div>
          </div>
          <button className="cta-main" onClick={()=>onSubscribe(P)}>{P.cta}</button>
          <div className="sub-note">{P.note}</div>
          <button className="sub-alt" onClick={onClose}>Maybe later</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- discussion panel ---------- */
function CommentRow({ c, onLike }) {
  return (
    <div className="cmt">
      <img className="cmt-av" src={c.avatar} alt={c.name}/>
      <div className="cmt-main">
        <div className="cmt-top"><span className="cmt-name">{c.name}</span><span className="cmt-dot"></span><span className="cmt-time">{c.time}</span></div>
        <div className="cmt-text">{c.text}</div>
        <div className="cmt-actions">
          <button className={`cmt-like ${c.liked?'on':''}`} onClick={()=>onLike(c.id)}>
            <Glyph d={SF.heart} size={15} fill={c.liked?'currentColor':'none'} stroke={c.liked?0:1.9}/>
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
  useEsc(onClose);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [comments.length]);
  const post = () => { if (!text.trim()) return; onPost(text.trim()); setText(''); };
  return (
    <div className="cmt-overlay" data-screen-label="Discussion Panel" onClick={(e)=>{ if(e.target===e.currentTarget) onClose(); }}>
      <aside className="cmt-panel">
        <div className="cmt-head">
          <div>
            <div className="cmt-h-title">Discussion</div>
            <div className="cmt-h-sub">Lesson {lesson.n} · {lesson.title}</div>
          </div>
          <button className="cmt-x" onClick={onClose} aria-label="Close"><Glyph d={SF.close} size={15} stroke={2.4}/></button>
        </div>
        <div className="cmt-count">{comments.length} {comments.length===1?'comment':'comments'}</div>
        <div className="cmt-list" ref={listRef}>
          {comments.length===0
            ? <div className="cmt-empty"><div className="ce-ico"><Glyph d={SF.bubble} size={28} stroke={1.6}/></div>Be the first to comment on this lesson.</div>
            : comments.map(c => <CommentRow key={c.id} c={c} onLike={onLike}/>)}
        </div>
        <div className="cmt-compose">
          <img className="cmt-av sm" src={window.VIEWER.avatar} alt="You"/>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') post(); }} placeholder="Add to the discussion…"/>
          <button className="cmt-send" disabled={!text.trim()} onClick={post} aria-label="Post"><Glyph d={SF.send} size={19} fill="currentColor"/></button>
        </div>
      </aside>
    </div>
  );
}

/* ---------- video player (always dark, liquid glass controls) ---------- */
function VideoPlayer({ lesson, startSec, comments, onClose, onLike, onPost, onProgress, onComplete }) {
  const dur = lesson.durSec;
  const [t, setT] = useState(Math.min(dur, Math.max(0, Math.round(startSec||0))));
  const [paused, setPaused] = useState(false);
  const [side, setSide] = useState(null);     // 'discussion'
  const [cc, setCc] = useState(false);
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
  /* keep the creator's place even on refresh */
  useEffect(() => {
    const id = setInterval(() => { onProgress && onProgress(tRef.current/dur, true); }, 5000);
    return () => clearInterval(id);
  }, [dur]);

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

  return (
    <div className="player" data-screen-label="Player">
      <div className="player-video" style={{ backgroundImage:`url(${lesson.img})` }}></div>
      <div className="player-vignette"></div>

      {paused && <button className="player-bigplay" onClick={()=>setPaused(false)} aria-label="Play"><Glyph d={SF.play} size={44} fill="#fff"/></button>}
      {cc && <div className="player-cc">{lesson.title}</div>}

      <div className="player-top">
        <button className="pbtn" onClick={exit} aria-label="Back"><Glyph d={SF.back} size={24} stroke={2}/></button>
        <div className="player-title">
          <div className="pt-k">{window.SHOW.instructor} · {window.SHOW.courseTitle}</div>
          <div className="pt-t">Lesson {lesson.n} · {lesson.title}</div>
        </div>
        <div className="player-top-right"><span className="pchip">4K</span><span className="pchip">Dolby</span></div>
      </div>

      <div className="player-controls">
        <div className="scrub-row">
          <span className="ptime">{window.fmtTime(t)}</span>
          <div className="scrub" ref={barRef} onMouseDown={(e)=>{ dragging.current=true; seekAt(e.clientX); }}>
            <div className="scrub-track">
              <div className="scrub-buf" style={{ width:`${Math.min(100,frac*100+8)}%` }}></div>
              <div className="scrub-fill" style={{ width:`${frac*100}%` }}></div>
              <div className="scrub-knob" style={{ left:`${frac*100}%` }}></div>
            </div>
          </div>
          <span className="ptime">-{window.fmtTime(Math.max(0,dur-t))}</span>
        </div>

        <div className="transport">
          <div className="tp-left">
            <span className="tp-chaplabel">{lesson.title}</span>
          </div>
          <div className="tp-center">
            <button className="pbtn" onClick={()=>setT(x=>Math.max(0,x-10))} aria-label="Back 10 seconds"><SkipIcon dir={-1} n={10} size={30}/></button>
            <button className="pbtn big" onClick={()=>setPaused(p=>!p)} aria-label={paused?'Play':'Pause'}><Glyph d={paused?SF.play:SF.pause} size={30} fill="currentColor"/></button>
            <button className="pbtn" onClick={()=>setT(x=>Math.min(dur,x+10))} aria-label="Forward 10 seconds"><SkipIcon dir={1} n={10} size={30}/></button>
          </div>
          <div className="tp-right">
            <button className={`pbtn sm ${cc?'on':''}`} onClick={()=>setCc(c=>!c)} aria-label="Captions"><Glyph d={SF.captions} size={21} stroke={1.9}/></button>
            <button className={`pbtn sm ${side==='discussion'?'on':''}`} onClick={()=>setSide(s=>s==='discussion'?null:'discussion')} aria-label="Discussion">
              <Glyph d={SF.bubble} size={21} stroke={2}/>{comments.length>0 && <span className="pbtn-badge">{comments.length}</span>}
            </button>
            <button className="pbtn sm" onClick={exit} aria-label="Exit player"><Glyph d={SF.fullscreen} size={21} stroke={2}/></button>
          </div>
        </div>
      </div>

      {side==='discussion' && <CommentsPanel lesson={lesson} comments={comments} onClose={()=>setSide(null)} onLike={onLike} onPost={onPost}/>}
    </div>
  );
}

Object.assign(window, {
  SF, Glyph, SkipIcon, useEsc,
  OverviewSheet, SubscribeSheet, CommentsPanel, VideoPlayer,
});
