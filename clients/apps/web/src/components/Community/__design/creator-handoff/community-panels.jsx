/* ============================================================
   SPAIRE ORIGINALS — Community · panels
   Events · Activities · Members · sidebar — neutral, word-led
   ============================================================ */
function Pp(who) { return window.CPPL[who] || { name: who, avatar: '' }; }
function Facepile({ list, max = 4 }) {
  return <div className="facepile">{list.slice(0, max).map((w, i) => <img key={i} src={Pp(w).avatar} alt=""/>)}</div>;
}

/* ============================================================ EVENTS */
function CEventsView({ rsvps, onRsvp, onJoin }) {
  return (
    <div className="fade-in">
      <div className="sec-h">
        <div className="h">Hosted by Carla</div>
        <div className="s">Live sessions, watch parties, and drill mornings — all on the course calendar.</div>
      </div>
      <div className="events">
        {window.CEVENTS.map(ev => {
          const going = rsvps[ev.id] != null ? rsvps[ev.id] : ev.rsvp;
          return (
            <article key={ev.id} className="event">
              <div className="ev-date">
                <div className="mo">{ev.mo}</div>
                <div className="dy">{ev.dy}</div>
              </div>
              <div className="ev-main">
                <div className={`ev-kind${ev.live ? ' live' : ''}`}>{ev.live ? 'Live now' : ev.typeLabel}</div>
                <h3 className="ev-title">{ev.title}</h3>
                <p className="ev-desc">{ev.desc}</p>
                <div className="ev-meta">
                  {ev.live ? 'Started 9 minutes ago' : ev.timeText}<span className="sep">·</span>{ev.going} going<span className="sep">·</span>Carla Marín
                </div>
              </div>
              <div className="ev-cta">
                <div className="ev-going"><Facepile list={ev.attendees} max={4}/></div>
                {ev.live
                  ? <button className="btn btn-primary btn-sm" onClick={() => onJoin(ev)}>Join live</button>
                  : <button className={`btn btn-quiet btn-sm ${going ? 'on' : ''}`} onClick={() => onRsvp(ev)}>{going ? 'Going' : 'RSVP'}</button>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="sub-h">Past sessions</div>
      <div className="recs">
        {window.CRECORDINGS.map(r => (
          <button key={r.id} className="rec" onClick={() => onJoin({ title: r.title, recording: true })}>
            <div className="rec-thumb"><img src={r.img} alt=""/><div className="pl"><CGlyph d={CSF.play} size={16} fill="currentColor"/></div></div>
            <div className="rec-main"><div className="rt">{r.title}</div><div className="rm">{r.meta}</div></div>
            <span className="chev"><CGlyph d={CSF.chevron} size={16} stroke={2}/></span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================ ACTIVITIES */
function CActivitiesView({ joins, onJoin }) {
  return (
    <div className="fade-in">
      <div className="sec-h">
        <div className="h">Play along</div>
        <div className="s">Challenges Carla sets for the room. Join one, log your reps, climb the board.</div>
      </div>
      <div className="chal-list">
        {window.CCHALLENGES.map(ch => {
          const joined = joins[ch.id] != null ? joins[ch.id] : ch.joined;
          const pct = Math.min(100, Math.round((ch.yours / ch.total) * 100));
          return (
            <article key={ch.id} className="chal">
              <div className="chal-top">
                <span className="chal-kind">{ch.tag}</span>
                {ch.tag2 && <span className="chal-when">{ch.tag2}</span>}
              </div>
              <h3 className="chal-title">{ch.title}</h3>
              <p className="chal-desc">{ch.desc}</p>
              <div className="chal-progrow">
                <span>{ch.goal ? `${ch.yours.toLocaleString()} of ${ch.total.toLocaleString()} minutes` : (joined ? `You: ${ch.yours} of ${ch.total} days` : 'Not started')}</span>
                <span>{pct}%</span>
              </div>
              <div className="bar"><i style={{ width: pct + '%' }}></i></div>
              <div className="chal-foot">
                <div className="chal-people"><Facepile list={ch.attendees} max={4}/><span>{ch.people.toLocaleString()} {ch.goal ? 'contributing' : 'taking part'}</span></div>
                {!ch.goal && <button className={`btn btn-quiet btn-sm ${joined ? 'on' : ''}`} onClick={() => onJoin(ch)}>{joined ? 'Joined' : 'Join'}</button>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="sub-h">This week’s board</div>
      <div className="lb">
        {window.CLEADERBOARD.map((row, i) => {
          const p = Pp(row.who);
          return (
            <div key={row.who} className="lb-row">
              <span className="lb-rank">{i + 1}</span>
              <img src={p.avatar} alt=""/>
              <div className="lb-id">
                <div className="n">{p.name}{row.badge && <span className="role">{window.roleText(row.badge)}</span>}</div>
                <div className="s">{row.sub}</div>
              </div>
              <span className="lb-score">{row.score.toLocaleString()}<span className="u">pts</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ MEMBERS */
function CMembersView({ onToast }) {
  const [q, setQ] = React.useState('');
  const list = window.CMEMBERS.filter(m => Pp(m.who).name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fade-in">
      <div className="members-bar">
        <div className="sec-h" style={{ marginBottom: 0 }}>
          <div className="h">Members</div>
          <div className="s">{window.COMMUNITY.members.toLocaleString()} on the course · {window.COMMUNITY.online} online now</div>
        </div>
        <div className="search">
          <CGlyph d={CSF.search} size={16} stroke={2}/>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members"/>
        </div>
      </div>
      <div className="members">
        {list.map(m => {
          const p = Pp(m.who);
          const isHost = m.who === 'carla';
          return (
            <article key={m.who} className="member">
              <img className="mav" src={p.avatar} alt={p.name}/>
              <div className="member-id">
                <div className="mn">{p.name}{m.badge && <span className="role">{window.roleText(m.badge)}</span>}</div>
                <div className="mr">{m.role} · {m.posts} posts · {m.streak}-day streak</div>
              </div>
              <button className={`btn btn-sm ${isHost ? 'btn-primary' : 'btn-quiet'}`}
                onClick={() => onToast(isHost ? 'Following Carla Marín' : `Said hi to ${p.name.split(' ')[0]}`)}>
                {isHost ? 'Follow' : 'Message'}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================ SIDEBAR */
function CSidebar({ joins, onJoin, onGoTab }) {
  const upcoming = window.CEVENTS.slice(0, 3);
  const chal = window.CCHALLENGES[0];
  const joined = joins[chal.id] != null ? joins[chal.id] : chal.joined;
  const pct = Math.min(100, Math.round((chal.yours / chal.total) * 100));
  return (
    <div className="side">
      <div className="side-block">
        <div className="side-t">Upcoming<button className="link" onClick={() => onGoTab('events')}>All</button></div>
        {upcoming.map(ev => (
          <button key={ev.id} className="s-event" onClick={() => onGoTab('events')}>
            <div className={`d${ev.live ? ' live' : ''}`}>{ev.live ? 'Live now' : `${ev.mo} ${ev.dy} · ${ev.timeText.split('·')[1] ? ev.timeText.split('·')[1].trim() : ev.wd}`}</div>
            <div className="et">{ev.title}</div>
          </button>
        ))}
      </div>

      <div className="side-block">
        <div className="side-t">Active challenge<button className="link" onClick={() => onGoTab('activities')}>All</button></div>
        <div className="s-chal">
          <div className="ct">{chal.title}</div>
          <div className="cm">{chal.people.toLocaleString()} playing · ends Sunday</div>
          <div className="bar"><i style={{ width: pct + '%' }}></i></div>
          <div className="s-chal-foot">
            <span>You: {chal.yours} of {chal.total} days</span>
            <button className={`btn btn-quiet btn-sm ${joined ? 'on' : ''}`} onClick={() => onJoin(chal)}>{joined ? 'Joined' : 'Join'}</button>
          </div>
        </div>
      </div>

      <div className="side-block">
        <div className="side-t">About</div>
        <p className="about-p">{window.COMMUNITY.about}</p>
        <ul className="about-list">
          {window.COMMUNITY.guidelines.map((g, i) => <li key={i}>{g.text}</li>)}
        </ul>
      </div>
    </div>
  );
}

Object.assign(window, { CEventsView, CActivitiesView, CMembersView, CSidebar });
