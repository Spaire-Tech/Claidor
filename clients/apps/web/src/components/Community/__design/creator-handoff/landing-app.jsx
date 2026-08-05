/* ============================================================
   SPAIRE ORIGINALS — Course landing
   visionOS Apple TV / Fitness+ product panel
   ============================================================ */
const { useState, useEffect, useRef, useCallback } = React;

const P = {
  play: 'M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12.5 4.5 4.5L19 6.5',
  checkCircle: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M7.7 12.2l2.8 2.8 5.6-5.6',
  lock: 'M8 10.5V8a4 4 0 0 1 8 0v2.5 M6.6 10.5h10.8a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6.6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z',
  bolt: 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z',
  chevR: 'm9 6 6 6-6 6', chevL: 'm15 6-6 6 6 6', chevD: 'm6 9 6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  home: 'M3 10.5 12 3l9 7.5 M5 9.5V21h14V9.5',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  heart: 'M12 20s-7-4.4-9.2-9C1.4 7.8 3 4.6 6.3 4.6c2 0 3.1 1.2 3.7 2 .6-.8 1.7-2 3.7-2 3.3 0 4.9 3.2 3.5 6.4C19 15.6 12 20 12 20Z',
  people: 'M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11Z M2.8 19.5c0-3.2 2.8-5.2 6.2-5.2s6.2 2 6.2 5.2 M16.5 4.8a3.2 3.2 0 0 1 0 6.2 M17.5 14.6c2.4.5 3.9 2.2 3.9 4.9',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z M20 20l-3.2-3.2',
  cc: 'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M9.5 10.5a2 2 0 1 0 0 3 M15 10.5a2 2 0 1 0 0 3',
  dolby: 'M4 6h4a6 6 0 0 1 0 12H4z M20 6h-4a6 6 0 0 0 0 12h4',
};
function G({ d, size=24, sw=1.8, fill='none' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={fill==='none'?'currentColor':'none'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>;
}

const S = window.SHOW;
const PR = window.PRICING;

const LANDING = {
  logline: 'A two-time Grand Slam champion takes you inside the all-court game — the strokes, the footwork, and the mind that wins the points that matter. Shot like a film, taught like a private lesson.',
  genre: 'Documentary Series · Tennis',
  year: '2026',
  rating: 'All Levels',
  trailerDur: '2:18',
  cast: 'Carla Marín · World No. 2, 2× Grand Slam Champion',
  quote: 'I never had the biggest serve on tour. I won because I could read a point three shots before it happened — and that\u2019s a thing you can learn.',
  instrBioShort: 'Two-time Grand Slam champion and former World No. 2. Fifteen years on tour, built on a complete, intelligent all-court game rather than raw power.',
  instrBody: [
    'Carla Mar\u00edn spent fifteen years on the professional tour, the kind of career measured less in aces than in points constructed two and three shots ahead. She reached World No. 2 and won two Grand Slam singles titles \u2014 not by overpowering opponents, but by out-thinking them.',
    'This is eleven lessons inside how she sees the game \u2014 the questions she asks before she swings, the small adjustments that change a whole match, and the mind that holds steady when the score doesn\u2019t.',
  ],
};

/* ---------- reveal (robust) ---------- */
function useReveal() {
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const all = () => Array.from(document.querySelectorAll('.rv'));
    if (reduce) { all().forEach(el => el.classList.add('in')); return; }
    const inView = () => { const h = window.innerHeight||800; all().forEach(el => { if (!el.classList.contains('in')) { const r = el.getBoundingClientRect(); if (r.top < h*0.94 && r.bottom > 0) el.classList.add('in'); } }); };
    let io;
    try { io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold:0.05 }); all().forEach(el => io.observe(el)); } catch(_){}
    inView();
    const onScroll = () => inView();
    window.addEventListener('scroll', onScroll, { passive:true }); window.addEventListener('resize', onScroll);
    const t1 = setTimeout(inView, 300);
    const t2 = setTimeout(() => all().forEach(el => { el.classList.add('in'); if (parseFloat(getComputedStyle(el).opacity) < 0.99) { el.style.transition='none'; el.style.opacity='1'; el.style.transform='none'; } }), 1500);
    return () => { if (io) io.disconnect(); window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); clearTimeout(t1); clearTimeout(t2); };
  }, []);
}
function useToasts() {
  const [t, setT] = useState([]);
  const push = useCallback(msg => { const id = Math.random().toString(36).slice(2); setT(x => [...x, { id, msg }]); setTimeout(() => setT(x => x.filter(y => y.id !== id)), 2600); }, []);
  const node = <div className="toast-wrap">{t.map(x => <div className="toast" key={x.id}><span className="tk"><G d={P.checkCircle} size={18}/></span>{x.msg}</div>)}</div>;
  return [push, node];
}

/* ============================================================ LEFT TAB RAIL */
function TabRail() {
  const icons = [
    { d:P.home, on:true }, { d:P.grid }, { d:P.heart }, { d:P.people }, { d:P.search },
  ];
  return (
    <nav className="tabrail" aria-label="Spaire">
      <div className="tabrail-pill">
        {icons.map((ic,i)=>(
          <button key={i} className={`tabicon ${ic.on?'on':''}`}><G d={ic.d} size={23} sw={1.9}/></button>
        ))}
      </div>
    </nav>
  );
}

/* ============================================================ HERO PANEL (Apple TV product) */
function Hero({ onPlay, onBuy, onTrailer }) {
  const badges = ['Self-paced','Lifetime access','Workbooks','Captions','Mobile & TV'];
  return (
    <header className="panel" id="top">
      <div className="panel-art" style={{ backgroundImage:`url(${window.EPISODES[4].img})` }}/>
      <div className="panel-scrim"/>
      <div className="panel-grain"/>

      {/* small brand mark, top-left */}
      <div className="panel-brand rv in">Spaire Originals</div>

      {/* title, anchored low near the band */}
      <div className="panel-title rv in">
        <h1 className="pt-h">{S.courseTitle}</h1>
      </div>

      {/* frosted control band */}
      <div className="band rv in">
        <div className="band-actions">
          <button className="abtn play" onClick={onPlay}><G d={P.play} size={20} fill="currentColor"/> Play Lesson 1 Free</button>
          <button className="abtn buy" onClick={onBuy}>Subscribe — {PR.price}</button>
          <div className="band-free">{S.freePreview} lessons free · one-time purchase</div>
        </div>

        <div className="band-desc">
          <p className="bd-text">{LANDING.logline}</p>
          <div className="bd-meta">{LANDING.genre}&nbsp;&nbsp;·&nbsp;&nbsp;{LANDING.year}&nbsp;&nbsp;·&nbsp;&nbsp;{S.lessonsLabel}&nbsp;&nbsp;·&nbsp;&nbsp;{S.runtime}</div>
          <div className="bd-badges">
            <span className="bdg rate">{LANDING.rating}</span>
            {badges.map(b=><span className="bdg" key={b}>{b}</span>)}
            <button className="bd-trailer" onClick={onTrailer}><G d={P.play} size={13} fill="currentColor"/> Trailer</button>
          </div>
        </div>

        <div className="band-cast">
          <div className="bc-k">Instructor</div>
          <div className="bc-v">{S.instructor}</div>
          <div className="bc-sub">{S.bio}</div>
        </div>
      </div>
    </header>
  );
}

/* ============================================================ EPISODE CARD */
function Lockup({ ep, free, onClick }) {
  return (
    <div className="lockup rv" onClick={onClick}>
      <div className="lockup-card" style={{ backgroundImage:`url(${ep.img})` }}>
        <div className="lockup-blur"/>
        <div className="lockup-shade"/>
        {free ? <div className="lockup-chip-free">Free</div> : <div className="lockup-chip-lock"><G d={P.lock} size={15}/></div>}
        <div className="lockup-playhover"><G d={P.play} size={24} fill="#fff"/></div>
        <div className="lockup-info">
          <div className="lockup-ep">Lesson {ep.n}</div>
          <div className="lockup-title">{ep.title}</div>
          <div className="lockup-desc">{ep.synopsis}</div>
          <div className="lockup-foot">
            <span className="lockup-time">{free && <G d={P.play} size={11} fill="currentColor"/>}{ep.dur}</span>
            <button className="lockup-more" onClick={(e)=>e.stopPropagation()} aria-label="More"><span/><span/><span/></button>
          </div>
        </div>
      </div>
    </div>
  );
}
function Season({ onLesson }) {
  const trackRef = useRef();
  const eps = window.EPISODES;
  const scroll = (dir) => { const el = trackRef.current; if (el) el.scrollBy({ left: dir * el.clientWidth * 0.82, behavior:'smooth' }); };
  return (
    <section className="season" id="lessons">
      <div className="season-head gut rv">
        <button className="season-title">Season 1 <G d={P.chevD} size={20} sw={2.2}/></button>
        <div className="season-sub">{S.lessonsLabel} · {S.runtime} · first {S.freePreview} free</div>
      </div>
      <div className="rail">
        <button className="rail-arrow left" onClick={()=>scroll(-1)} aria-label="Scroll left"><G d={P.chevL} size={22} sw={2.2}/></button>
        <div className="rail-track" ref={trackRef}>
          {eps.map(ep => <Lockup key={ep.id} ep={ep} free={ep.n <= S.freePreview} onClick={()=>onLesson(ep)}/>)}
        </div>
        <button className="rail-arrow right" onClick={()=>scroll(1)} aria-label="Scroll right"><G d={P.chevR} size={22} sw={2.2}/></button>
      </div>
    </section>
  );
}

/* ============================================================ TRAILER MODAL */
function TrailerModal({ onClose }) {
  useEffect(() => { const h = e => { if (e.key==='Escape') onClose(); }; window.addEventListener('keydown', h); document.body.style.overflow='hidden'; return () => { window.removeEventListener('keydown', h); document.body.style.overflow=''; }; }, []);
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal-frame" onClick={e=>e.stopPropagation()}>
        <div style={{ position:'absolute', inset:0, backgroundImage:`url(${window.EPISODES[5].img})`, backgroundSize:'cover', backgroundPosition:'center' }}/>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(0deg, rgba(0,0,0,.5), rgba(0,0,0,.1))' }}/>
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:92, height:92, borderRadius:'50%', background:'rgba(255,255,255,.16)', backdropFilter:'blur(18px)', WebkitBackdropFilter:'blur(18px)', display:'grid', placeItems:'center', boxShadow:'inset 0 0 0 1px rgba(255,255,255,.4)' }}><G d={P.play} size={34} fill="#fff"/></div>
        <div style={{ position:'absolute', left:28, bottom:24, fontSize:17, fontWeight:600 }}>{S.courseTitle} — Official Trailer · {LANDING.trailerDur}</div>
        <button className="modal-x" onClick={onClose}><G d={P.x} size={18} sw={2}/></button>
      </div>
    </div>
  );
}

/* ============================================================ MEET THE INSTRUCTOR (editorial) */
function Meet() {
  return (
    <section className="meet" id="instructor">
      <div className="meet-in gut">
        <div className="meet-eyebrow rv">Your instructor</div>
        <div className="meet-grid">
          <div className="meet-left rv">
            <div className="meet-card">
              <img className="meet-av" src={S.portrait} alt={S.instructor}/>
              <div className="meet-card-txt">
                <div className="meet-name">{S.instructor}</div>
                <div className="meet-card-bio">{LANDING.instrBioShort}</div>
              </div>
            </div>
            <div className="meet-divider"/>
            <div className="meet-body">
              {LANDING.instrBody.map((p,i)=><p key={i}>{p}</p>)}
            </div>
          </div>
          <div className="meet-right rv">
            <div className="meet-photo" style={{ backgroundImage:`url(${S.cover})` }}/>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ MOMENTS TIMELINE */
const MOMENTS = [
  { dot:'#1F8A5B', img: window.EPISODES[3].img, eyebrow:'Moment 01', title:'Build a forehand that repeats under pressure.', side:'above' },
  { dot:'#C77B25', img: window.EPISODES[5].img, eyebrow:'Moment 02', title:'Serve with power, placement, and disguise.', side:'below' },
  { dot:'#2A6FDB', img: window.EPISODES[1].img, eyebrow:'Moment 03', title:'Win the points that actually decide matches.', side:'above' },
  { dot:'#6D4AC2', img: window.EPISODES[7].img, eyebrow:'Moment 04', title:'Move before your opponent even hits.', side:'below' },
];
function MomentCard({ m }) {
  const caption = (
    <div className="mc-cap">
      <div className="mc-eyebrow"><span className="mc-dot" style={{ background:m.dot }}/>{m.eyebrow}</div>
      <div className="mc-title">{m.title}</div>
      <button className="mc-more">Read more <span>→</span></button>
    </div>
  );
  const photo = <div className="mc-photo" style={{ backgroundImage:`url(${m.img})` }}/>;
  return (
    <div className={`moment ${m.side}`}>
      <div className="mc-card">
        {m.side==='above' ? <>{photo}{caption}</> : <>{caption}{photo}</>}
      </div>
      <div className="mc-stem"/>
      <div className="mc-node"/>
    </div>
  );
}
function Moments() {
  return (
    <section className="moments-sec" id="moments">
      <div className="moments-in gut">
        <div className="moments-head rv">
          <div className="moments-eyebrow">What you’ll learn</div>
          <h2 className="moments-h">Four moments worth seeing<br/><span>across the course.</span></h2>
        </div>
        <div className="moments-rail rv">
          <div className="rail-line"/>
          {MOMENTS.map((m,i)=><MomentCard key={i} m={m}/>)}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ APP */
function App() {
  const [trailer, setTrailer] = useState(false);
  const [push, toastNode] = useToasts();
  useReveal();

  const onLesson = useCallback((ep) => {
    if (ep.n <= S.freePreview) push(`Playing free preview · ${ep.title}`);
    else push('Subscribe to unlock all lessons');
  }, [push]);

  return (
    <div className="stage">
      <Hero onPlay={()=>push('Playing free preview · Introduction')} onBuy={()=>push('Redirecting to secure checkout…')} onTrailer={()=>setTrailer(true)}/>
      <Season onLesson={onLesson}/>
      <Moments/>
      <Meet/>
      {trailer && <TrailerModal onClose={()=>setTrailer(false)}/>}
      {toastNode}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
