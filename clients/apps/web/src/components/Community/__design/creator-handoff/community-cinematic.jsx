/* ============================================================
   SPAIRE ORIGINALS — Community · cinematic Events & Activities
   Forks the Course Landing language: full-bleed stills, filmic
   shades, glass CTAs, a blurred join-modal, Apple activity rings.
   Loaded AFTER community-panels.jsx so these win.
   ============================================================ */
const { useState: uSc, useEffect: uEc } = React;
function Pc(who) { return window.CPPL[who] || { name: who, avatar: '' }; }
function Pile({ list, max = 4, ring = 'var(--surface)' }) {
  return <div className="facepile">{list.slice(0, max).map((w, i) => <img key={i} src={Pc(w).avatar} alt="" style={{ boxShadow: `0 0 0 2px ${ring}` }}/>)}</div>;
}

/* ---------- Apple Fitness-style activity ring ---------- */
function Ring({ pct, size = 58, stroke = 6, label, sub }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
  const mid = size / 2;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--fill-2)" strokeWidth={stroke}/>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--live)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
          transform={`rotate(-90 ${mid} ${mid})`} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.3,1,.3,1)' }}/>
      </svg>
      {label != null && <div className="ring-c"><b>{label}</b>{sub && <span>{sub}</span>}</div>}
    </div>
  );
}

/* ---------- blurred join / RSVP modal (forks landing .modal-ov) ---------- */
function JoinModal({ ev, mode, onClose }) {
  uEc(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, []);
  const live = mode === 'live';
  return (
    <div className="cm-ov" onClick={onClose}>
      <div className="cm-frame" onClick={e => e.stopPropagation()}>
        <div className="cm-img" style={{ backgroundImage: `url(${ev.img})` }}></div>
        <div className="cm-shade"></div>
        <button className="cm-x" onClick={onClose} aria-label="Close"><CGlyph d={CSF.close} size={18} stroke={2}/></button>

        <div className="cm-body">
          <div className={`cm-kind${live ? ' live' : ''}`}>{live ? <React.Fragment><span className="ld"></span>Live now</React.Fragment> : ev.typeLabel}</div>
          <h3 className="cm-title">{ev.title}</h3>
          <p className="cm-desc">{ev.desc}</p>
          <div className="cm-meta">Hosted by Carla Marín<span className="sep">·</span>{live ? 'Started 9 minutes ago' : ev.timeText}<span className="sep">·</span>{ev.going} going</div>
          <div className="cm-cta">
            {live
              ? <button className="btn btn-light" onClick={onClose}><CGlyph d={CSF.play} size={15} fill="currentColor"/> Enter live session</button>
              : <button className="btn btn-light" onClick={onClose}><CGlyph d={CSF.check} size={15} stroke={2.4}/> You’re going</button>}
            <button className="btn btn-glass-d" onClick={onClose}>Add to calendar</button>
          </div>
        </div>

        {live && <div className="cm-play"><CGlyph d={CSF.play} size={30} fill="#fff"/></div>}
      </div>
    </div>
  );
}

/* ============================================================ EVENTS */
function CEventsView({ rsvps, onRsvp, onJoin }) {
  const [modal, setModal] = uSc(null);
  const all = window.CEVENTS;
  const live = all.find(e => e.live);
  const upcoming = all.filter(e => !e.live);

  return (
    <div className="fade-in cine">
      {/* featured live event — full-bleed cinematic */}
      {live && (
        <section className="feat" onClick={() => { setModal({ ev: live, mode: 'live' }); onJoin && onJoin(live); }}>
          <div className="feat-img" style={{ backgroundImage: `url(${live.img})` }}></div>
          <div className="feat-shade"></div>
          <div className="feat-grain"></div>
          <div className="feat-body">
            <div className="feat-kind live"><span className="ld"></span>Live now</div>
            <h2 className="feat-title">{live.title}</h2>
            <p className="feat-desc">{live.desc}</p>
            <div className="feat-row">
              <button className="btn btn-light" onClick={(e) => { e.stopPropagation(); setModal({ ev: live, mode: 'live' }); }}>
                <CGlyph d={CSF.play} size={15} fill="currentColor"/> Join live
              </button>
              <div className="feat-going"><Pile list={live.attendees} max={5} ring="rgba(0,0,0,.35)"/><span>{live.going} watching now</span></div>
            </div>
          </div>
        </section>
      )}

      <div className="rule"></div>

      {/* upcoming — editorial list */}
      <div className="sec-h"><div className="h">Upcoming</div><div className="s">RSVP and we’ll hold your seat — every session is recorded.</div></div>
      <div className="ev2-list">
        {upcoming.map(ev => {
          const going = rsvps[ev.id] != null ? rsvps[ev.id] : ev.rsvp;
          return (
            <article key={ev.id} className="ev2" onClick={() => setModal({ ev, mode: going ? 'rsvp' : 'preview' })}>
              <div className="ev2-thumb" style={{ backgroundImage: `url(${ev.img})` }}>
                <span className="ev2-day"><b>{ev.dy}</b>{ev.mo}</span>
              </div>
              <div className="ev2-main">
                <div className="ev2-kind">{ev.typeLabel}<span className="sep">·</span>{ev.timeText}</div>
                <h3 className="ev2-title">{ev.title}</h3>
                <p className="ev2-desc">{ev.desc}</p>
                <div className="ev2-foot"><Pile list={ev.attendees} max={4}/><span>{ev.going} going</span></div>
              </div>
              <div className="ev2-cta">
                <button className={`btn btn-sm ${going ? 'btn-quiet on' : 'btn-quiet'}`}
                  onClick={(e) => { e.stopPropagation(); onRsvp(ev); }}>
                  {going ? <React.Fragment><CGlyph d={CSF.check} size={14} stroke={2.5}/> Going</React.Fragment> : 'RSVP'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="rule"></div>

      {/* past sessions — cinematic rail */}
      <div className="sec-h"><div className="h">Replays</div><div className="s">Missed one? Every live session lands here the next morning.</div></div>
      <div className="past-rail">
        {window.CRECORDINGS.map(r => (
          <button key={r.id} className="past" onClick={() => onJoin({ title: r.title, recording: true })}>
            <div className="past-card" style={{ backgroundImage: `url(${r.img})` }}>
              <div className="past-shade"></div>
              <div className="past-play"><CGlyph d={CSF.play} size={20} fill="#fff"/></div>
              <div className="past-info"><div className="past-t">{r.title}</div><div className="past-m">{r.meta}</div></div>
            </div>
          </button>
        ))}
      </div>

      {modal && <JoinModal ev={modal.ev} mode={modal.mode} onClose={() => setModal(null)}/>}
    </div>
  );
}

/* ============================================================ ACTIVITIES */
function CActivitiesView({ joins, onJoin }) {
  const all = window.CCHALLENGES;
  const feat = all.find(c => c.span) || all[0];
  const rest = all.filter(c => c !== feat);
  const featJoined = joins[feat.id] != null ? joins[feat.id] : feat.joined;
  const featPct = Math.round((feat.yours / feat.total) * 100);

  return (
    <div className="fade-in cine">
      {/* featured weekly challenge — image + big ring */}
      <section className="chal-feat">
        <div className="chal-feat-img" style={{ backgroundImage: `url(${feat.img})` }}>
          <div className="chal-feat-shade"></div>
          <span className="chal-feat-tag">{feat.tag}<span className="dot2"></span>{feat.tag2}</span>
        </div>
        <div className="chal-feat-body">
          <Ring pct={featPct} size={104} stroke={10} label={`${feat.yours}/${feat.total}`} sub="days"/>
          <div className="chal-feat-txt">
            <h2 className="chal-feat-title">{feat.title}</h2>
            <p className="chal-feat-desc">{feat.desc}</p>
            <div className="chal-feat-row">
              <button className="btn btn-primary btn-sm" onClick={() => onJoin(feat)}>{featJoined ? 'Log today’s reps' : 'Join challenge'}</button>
              <div className="chal-people"><Pile list={feat.attendees} max={5}/><span>{feat.people.toLocaleString()} playing</span></div>
            </div>
          </div>
        </div>
      </section>

      <div className="rule"></div>

      {/* the rest — rows with rings */}
      <div className="sec-h"><div className="h">More to play</div><div className="s">Pick one up any time. Your rings reset each morning.</div></div>
      <div className="chal2-list">
        {rest.map(ch => {
          const joined = joins[ch.id] != null ? joins[ch.id] : ch.joined;
          const pct = Math.round((ch.yours / ch.total) * 100);
          const center = ch.goal ? `${pct}%` : (joined ? `${ch.yours}` : '0');
          return (
            <article key={ch.id} className="chal2">
              <Ring pct={pct} size={62} stroke={7} label={center} sub={ch.goal ? '' : `/${ch.total}`}/>
              <div className="chal2-main">
                <div className="chal2-kind">{ch.tag}{ch.tag2 ? <React.Fragment><span className="sep">·</span>{ch.tag2}</React.Fragment> : null}</div>
                <h3 className="chal2-title">{ch.title}</h3>
                <p className="chal2-desc">{ch.desc}</p>
                <div className="chal2-people"><Pile list={ch.attendees} max={3}/><span>{ch.people.toLocaleString()} {ch.goal ? 'contributing' : 'taking part'}</span></div>
              </div>
              <div className="chal2-cta">
                {ch.goal
                  ? <span className="chal2-goal">{ch.yours.toLocaleString()}<span className="u">/ {ch.total.toLocaleString()} min</span></span>
                  : <button className={`btn btn-sm ${joined ? 'btn-quiet on' : 'btn-primary'}`} onClick={() => onJoin(ch)}>{joined ? 'Joined' : 'Join'}</button>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="rule"></div>

      {/* leaderboard */}
      <div className="sec-h"><div className="h">This week’s board</div><div className="s">Ranked by practice points logged in the last 7 days.</div></div>
      <div className="lb2">
        {window.CLEADERBOARD.map((row, i) => {
          const p = Pc(row.who);
          return (
            <div key={row.who} className={`lb2-row${i === 0 ? ' top' : ''}`}>
              <span className="lb2-rank">{i + 1}</span>
              <img src={p.avatar} alt=""/>
              <div className="lb2-id"><div className="n">{p.name}{row.badge && <span className="role">{window.roleText(row.badge)}</span>}</div><div className="s">{row.sub}</div></div>
              <span className="lb2-score">{row.score.toLocaleString()}<span className="u">pts</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { CEventsView, CActivitiesView, Ring, JoinModal });
