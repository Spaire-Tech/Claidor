/* ============================================================
   SPAIRE ORIGINALS v2 — app
   Marquee "now playing" hero · catalog rail · instructor
   ============================================================ */
const { useState: uS, useEffect: uE, useRef: uR, useCallback: uC, useMemo: uM } = React;
const { SF: G, Glyph: Gl, OverviewSheet: OvSheet, SubscribeSheet: SubSheet,
        CommentsPanel: CmtPanel, VideoPlayer: Player } = window;

/* ---------- persistence (never cleared, only written) ---------- */
const store = {
  read(key, fallback) {
    try { const v = localStorage.getItem(key); return v==null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  },
};

/* ---------- catalog lesson card ---------- */
function LessonCard({ ep, status, locked, free, bookmarked, progress, onHover, onPlay, onOverview }) {
  return (
    <div className="lc-catalog" onMouseEnter={onHover} onClick={onPlay}>
      <div className="lc-card">
        <div className="lc-thumb">
          <img src={ep.thumb || ep.img} alt="" loading="lazy"/>
          {locked
            ? <div className="lc-state lc-lock"><Gl d={G.locksm} size={11} stroke={2.1}/></div>
            : status==='watched'
              ? <div className="lc-state lc-done"><Gl d={G.check} size={11} stroke={2.8}/></div>
              : free
                ? <div className="lc-state lc-free"><Gl d={G.play2} size={9} fill="currentColor" stroke={0}/>Free</div>
                : null}
          <div className="lc-dur"><Gl d={G.play2} size={11} fill="currentColor" stroke={0}/><span>{ep.dur}</span></div>
          {status==='progress' && !locked && <div className="lc-progbar"><i style={{ width:`${(progress||0)*100}%` }}></i></div>}
          <div className="lc-play"><div className="lc-play-btn"><Gl d={locked?G.locksm:G.play} size={18} fill={locked?'none':'currentColor'} stroke={locked?2:0}/></div></div>
          <button className="lc-ovbtn" aria-label="Lesson overview" onClick={(e)=>{ e.stopPropagation(); onOverview(); }}>
            <Gl d={G.info} size={17} stroke={1.9}/>
          </button>
        </div>
        <div className="lc-info">
          <div className="lc-num">Lesson {ep.n}{bookmarked ? ' · Saved' : ''}</div>
          <div className="lc-title">{ep.title}</div>
          <div className="lc-desc">{ep.synopsis}</div>
          <div className="lc-meta">
            {locked
              ? <React.Fragment><Gl d={G.locksm} size={13} stroke={2}/><span>Locked · {ep.dur}</span></React.Fragment>
              : status==='watched'
                ? <span className="ok"><Gl d={G.check} size={13} stroke={2.6}/>Watched</span>
                : status==='progress'
                  ? <span>Continue · {Math.round((progress||0)*100)}%</span>
                  : <React.Fragment><Gl d={G.play2} size={12} fill="currentColor" stroke={0}/><span>{ep.dur}</span></React.Fragment>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- rail with arrows ---------- */
function Rail({ children }) {
  const stripRef = uR();
  const [canPrev, setCanPrev] = uS(false);
  const [canNext, setCanNext] = uS(true);
  const update = uC(() => {
    const s = stripRef.current; if (!s) return;
    const max = s.scrollWidth - s.clientWidth - 2;
    setCanPrev(s.scrollLeft > 2);
    setCanNext(s.scrollLeft < max);
  }, []);
  uE(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);
  const by = (dir) => stripRef.current.scrollBy({ left: dir * stripRef.current.clientWidth, behavior: 'smooth' });
  return (
    <div className="strip-wrap" onMouseEnter={update}>
      <button className={`arrow prev ${canPrev?'show':''}`} aria-label="Previous" onClick={()=>by(-1)}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 5l-6.5 7 6.5 7"/></svg>
      </button>
      <button className={`arrow next ${canNext?'show':''}`} aria-label="Next" onClick={()=>by(1)}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 5l6.5 7-6.5 7"/></svg>
      </button>
      <div className="grid" ref={stripRef} onScroll={update}>{children}</div>
    </div>
  );
}

function App() {
  const eps = window.EPISODES;
  const [dark, setDark] = uS(() => localStorage.getItem('spaire_theme') === 'dark');
  const [focus, setFocus] = uS(0);
  const [playing, setPlaying] = uS(false);
  const [overviewOpen, setOverviewOpen] = uS(false);
  const [showComments, setShowComments] = uS(false);
  const [playerStart, setPlayerStart] = uS(0);
  const [subOpen, setSubOpen] = uS(false);
  const [toast, setToast] = uS(null);
  const [subscribed, setSubscribed] = uS(() => store.read('so2_subscribed', false));
  const [bookmarks, setBookmarks] = uS(() => new Set(store.read('so2_bookmarks', [])));
  const [watched, setWatched] = uS(() => {
    const saved = store.read('so2_watched', null);
    return new Set(saved!=null ? saved : eps.filter(e=>e.state==='watched').map(e=>e.id));
  });
  const [progress, setProgress] = uS(() => {
    const saved = store.read('so2_progress', null);
    if (saved!=null) return saved;
    const m = {}; eps.forEach(e=>{ if(e.progress!=null && e.state!=='watched') m[e.id]=e.progress; }); return m;
  });
  const [comments, setComments] = uS(() => {
    const m = {}; eps.forEach(e => { m[e.id] = (window.COMMENTS[e.id]||[]).map(c=>({...c})); }); return m;
  });
  const toastT = uR();

  /* entrance: .pre is removed one frame after mount to run the rise-in transition;
     a JS timer then kills the transition entirely (.settled), forcing the visible
     base state even in environments with a frozen animation timeline. */
  const [entered, setEntered] = uS(false);
  const [settled, setSettled] = uS(false);
  uE(() => {
    let id2;
    const id = requestAnimationFrame(() => { id2 = requestAnimationFrame(() => setEntered(true)); });
    const t = setTimeout(() => setSettled(true), 1600);
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(id2); clearTimeout(t); };
  }, []);

  /* theme */
  uE(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('spaire_theme', dark ? 'dark' : 'light');
  }, [dark]);

  /* persist viewing state */
  uE(() => { store.write('so2_subscribed', subscribed); }, [subscribed]);
  uE(() => { store.write('so2_bookmarks', [...bookmarks]); }, [bookmarks]);
  uE(() => { store.write('so2_watched', [...watched]); }, [watched]);
  uE(() => { store.write('so2_progress', progress); }, [progress]);

  const ep = eps[focus];
  const isLocked = (e) => !subscribed && e.n > window.SHOW.freePreview;
  const epLocked = isLocked(ep);
  const statusOf = (e) => watched.has(e.id) ? 'watched' : (progress[e.id]!=null ? 'progress' : 'unwatched');
  const status = statusOf(ep);
  const lessonsDone = watched.size;
  const isBookmarked = bookmarks.has(ep.id);
  const epComments = comments[ep.id] || [];

  const showToast = uC((msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(()=>setToast(null), 2400);
  }, []);

  const playLesson = uC((i, startSec=null) => {
    const e = eps[i];
    if (!subscribed && e.n > window.SHOW.freePreview) { setFocus(i); setOverviewOpen(false); setSubOpen(true); return; }
    const start = startSec!=null ? startSec : (progress[e.id]!=null ? progress[e.id]*e.durSec : 0);
    setFocus(i); setPlayerStart(start); setOverviewOpen(false); setPlaying(true);
  }, [eps, progress, subscribed]);

  const markComplete = uC((id) => {
    setWatched(w => { const n = new Set(w); n.add(id); return n; });
    setProgress(p => { const n = {...p}; delete n[id]; return n; });
  }, []);
  const markProgress = uC((id, frac) => {
    if (frac >= 0.97) { markComplete(id); return; }
    if (frac > 0.03) setProgress(p => ({ ...p, [id]: frac }));
  }, [markComplete]);

  const toggleBookmark = uC(() => {
    setBookmarks(b => {
      const n = new Set(b);
      if (n.has(ep.id)) { n.delete(ep.id); showToast('Bookmark removed'); }
      else { n.add(ep.id); showToast('Lesson bookmarked'); }
      return n;
    });
  }, [ep, showToast]);

  const onSubscribe = uC(() => {
    setSubscribed(true); setSubOpen(false);
    showToast('You\u2019re in — full course unlocked');
  }, [showToast]);

  const downloadWorkbook = uC(() => {
    const body = [
      `${window.SHOW.courseTitle.toUpperCase()} — ${window.SHOW.instructor}`,
      `Lesson ${ep.n}: ${ep.title}  (${ep.dur})`, ``,
      ep.synopsis, ``,
      `— Practice notes ———————————————`,
      `1. Warm up for 10 minutes before drilling.`,
      `2. Film yourself and compare to the lesson.`,
      `3. Track reps below:`, ``,
      `[ ] Set 1   [ ] Set 2   [ ] Set 3`, ``,
      `${window.SHOW.brand} · ${window.SHOW.courseTitle}`,
    ].join('\n');
    const blob = new Blob([body], { type:'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${window.SHOW.courseTitle} — Lesson ${ep.n} Workbook.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
    showToast('Workbook downloaded');
  }, [ep, showToast]);

  const likeComment = uC((cid, lid=ep.id) => {
    setComments(all => ({ ...all, [lid]: (all[lid]||[]).map(c => c.id===cid ? { ...c, liked:!c.liked, likes:c.likes+(c.liked?-1:1) } : c) }));
  }, [ep.id]);
  const postComment = uC((txt, lid=ep.id) => {
    const c = { id:'c'+Date.now(), name:window.VIEWER.name, avatar:window.VIEWER.avatar, time:'now', text:txt, likes:0, liked:false };
    setComments(all => ({ ...all, [lid]: [...(all[lid]||[]), c] }));
    showToast('Comment posted');
  }, [ep.id, showToast]);

  /* keyboard */
  uE(() => {
    const onKey = (e) => {
      if (playing || subOpen || overviewOpen || showComments) return;
      if (e.target.tagName === 'INPUT') return;
      if (e.key==='ArrowRight') { e.preventDefault(); setFocus(f => Math.min(eps.length-1, f+1)); }
      else if (e.key==='ArrowLeft') { e.preventDefault(); setFocus(f => Math.max(0, f-1)); }
      else if (e.key==='Enter') { e.preventDefault(); playLesson(focus); }
      else if (e.key.toLowerCase()==='o') setOverviewOpen(true);
      else if (e.key.toLowerCase()==='b') toggleBookmark();
      else if (e.key.toLowerCase()==='c') setShowComments(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, subOpen, overviewOpen, showComments, focus, eps.length, playLesson, toggleBookmark]);

  const playLabel = status==='watched' ? 'Replay' : status==='progress' ? 'Resume' : 'Play';
  const kicker = epLocked
    ? <span>Locked · Lesson {ep.n} of {eps.length}</span>
    : status==='watched'
      ? <span>Watched · Lesson {ep.n} of {eps.length}</span>
      : status==='progress'
        ? <React.Fragment><span className="nowbars"><i/><i/><i/></span><span>Continue · Lesson {ep.n} of {eps.length}</span></React.Fragment>
        : <span>Lesson {ep.n} of {eps.length}</span>;

  return (
    <React.Fragment>
      {/* ════════ MARQUEE HERO — now playing ════════ */}
      <header className={`panel${entered?'':' pre'}${settled?' settled':''}`} data-screen-label="Now Playing Hero">
        {eps.map((e,i) => (
          <div key={e.id} className={`hero-layer ${i===focus?'show':''}`} style={{ backgroundImage:`url(${e.img})` }}></div>
        ))}
        <div className="panel-scrim"></div>
        <div className="panel-grain"></div>

        <div className="panel-brand rise"><span className="dot"></span>{window.SHOW.brand}</div>

        <div className="top-controls">
          {subscribed && <span className="member-chip"><Gl d={G.check} size={13} stroke={2.6}/>Enrolled</span>}
          <button className="theme-toggle" onClick={()=>setDark(d=>!d)} aria-label="Toggle dark mode">
            <span className="ic-moon"><Gl d={G.moon} size={17} stroke={2}/></span>
            <span className="ic-sun"><Gl d={G.sun} size={17} stroke={2}/></span>
          </button>
        </div>

        <div className="panel-title">
          <div className={`pt-kicker rise d1 ${status==='watched'&&!epLocked?'done':''}`}>{kicker}</div>
          <h1 className="pt-h rise d1">{ep.title}</h1>
        </div>

        <div className="band rise d2">
          <div className="band-actions">
            {epLocked ? (
              <button className="abtn play" onClick={()=>setSubOpen(true)}>
                <Gl d={G.lock} size={18} stroke={2.1}/> Unlock — {window.PRICING.price}
              </button>
            ) : (
              <button className="abtn play" onClick={()=>playLesson(focus)}>
                <Gl d={G.play} size={17} fill="currentColor"/> {playLabel} Lesson {ep.n}
              </button>
            )}
            <button className="abtn glass" onClick={()=>setOverviewOpen(true)}>
              <Gl d={G.doc} size={18} stroke={1.9}/> Overview
            </button>
            <div className="icon-row">
              <button className={`icon-glass ${isBookmarked?'on':''}`} onClick={toggleBookmark} aria-label="Bookmark lesson">
                <Gl d={G.bookmark} size={19} fill={isBookmarked?'currentColor':'none'} stroke={isBookmarked?0:2}/>
              </button>
              <button className="icon-glass" onClick={downloadWorkbook} aria-label="Download workbook"><Gl d={G.download} size={20} stroke={2}/></button>
              <button className="icon-glass" onClick={()=>setShowComments(true)} aria-label="Discussion">
                <Gl d={G.bubble} size={19} stroke={2}/>
                {epComments.length>0 && <span className="icon-badge">{epComments.length}</span>}
              </button>
            </div>
            {!subscribed && <div className="band-free">First {window.SHOW.freePreview} lessons free</div>}
          </div>

          <div className="band-desc">
            <p className="bd-text">{ep.synopsis}</p>
            <div className="bd-meta">{window.SHOW.courseTitle}&nbsp;&nbsp;·&nbsp;&nbsp;{window.SHOW.lessonsLabel}&nbsp;&nbsp;·&nbsp;&nbsp;{window.SHOW.runtime}&nbsp;&nbsp;·&nbsp;&nbsp;{ep.dur}</div>
            <div className="bd-badges">
              <span className="bdg rate">{window.SHOW.level}</span>
              <span className="bdg">Self-paced</span>
              <span className="bdg">Captions</span>
              <span className="bdg">Mobile &amp; TV</span>
            </div>
          </div>

          <div className="band-cast">
            <div className="bc-row">
              <img className="bc-av" src={window.SHOW.portrait} alt={window.SHOW.instructor}/>
              <div>
                <div className="bc-k">Instructor</div>
                <div className="bc-v">{window.SHOW.instructor}</div>
              </div>
            </div>
            <div className="bc-sub">{window.SHOW.bio}</div>
            <div className="bc-progress">
              <div className="bc-pt"><span>Your progress</span><span>{lessonsDone} of {eps.length}</span></div>
              <div className="bc-pbar"><i style={{ width:`${Math.round(lessonsDone/eps.length*100)}%` }}></i></div>
            </div>
          </div>
        </div>
      </header>

      {/* ════════ LESSONS ════════ */}
      <section className="lessons" data-screen-label="Lessons Rail">
        <div className="row-head">
          <span className="rh">Lessons</span>
          <span className="rh-meta">
            {eps.length} lessons{subscribed ? (lessonsDone>0 ? ` · ${lessonsDone} watched` : '') : ` · first ${window.SHOW.freePreview} free`}
          </span>
        </div>
        <Rail>
          {eps.map((e,i)=>(
            <LessonCard key={e.id} ep={e}
              status={statusOf(e)} locked={isLocked(e)}
              free={!subscribed && e.n <= window.SHOW.freePreview}
              bookmarked={bookmarks.has(e.id)} progress={progress[e.id]}
              onHover={()=>setFocus(i)}
              onPlay={()=>playLesson(i)}
              onOverview={()=>{ setFocus(i); setOverviewOpen(true); }}/>
          ))}
        </Rail>
      </section>

      {toast && <div className="toast"><span className="tk"><Gl d={G.check} size={15} stroke={2.6}/></span>{toast}</div>}

      {subOpen && <SubSheet onClose={()=>setSubOpen(false)} onSubscribe={onSubscribe}/>}
      {overviewOpen && <OvSheet lesson={ep} bookmarked={isBookmarked} locked={epLocked}
        onClose={()=>setOverviewOpen(false)}
        onPlay={()=>{ epLocked ? (setOverviewOpen(false), setSubOpen(true)) : playLesson(focus); }}
        onBookmark={toggleBookmark} onDownload={downloadWorkbook}/>}
      {showComments && !playing && <CmtPanel lesson={ep} comments={epComments} onClose={()=>setShowComments(false)} onLike={likeComment} onPost={postComment}/>}

      {playing && <Player lesson={ep} startSec={playerStart} comments={epComments}
        onClose={()=>setPlaying(false)}
        onLike={(cid)=>likeComment(cid, ep.id)} onPost={(txt)=>postComment(txt, ep.id)}
        onProgress={(frac)=>markProgress(ep.id, frac)} onComplete={()=>markComplete(ep.id)}/>}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
