/* ============================================================
   The Baseline — STUDENT view (member POV)
   Reuses the shared community UI (window.CUI / window.CRFPost).
   ============================================================ */
const { useState: us, useEffect: ue, useRef: ur } = React;
const G = window.CGlyph, SF = window.CSF, C = window.COMMUNITY, PPL = window.CPPL;
const {
  Field, Seg, Toggle, RichComposer, EventCard, EventSheet, ActivityCard, ActivityPage,
  ProviderLogo, fmtDateLabel, fmtTimeLabel, coverFor, fmtOf, EPISODES, episodeOf,
  mockSubmissions, useUpload, CR,
} = window.CUI;
const Post = window.CRFPost;

/* ---------- the student's own identity (editable in Profile) ---------- */
const ME = 'you';
const DEFAULT_ME = { name: 'Jordan Hale', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80&auto=format&fit=crop', headline: 'Member · Championship Tennis' };

/* ---------- seed: activities in the shared model ---------- */
function seedActivities() {
  return [
    { id: 'sa1', prompt: 'Post a clip of one serve you want eyes on this week — toss, timing, the thing you can’t see from inside your own motion.', format: 'video', episode: 6, cover: '', coverPos: 'center 50%', submissions: mockSubmissions() },
    { id: 'sa2', prompt: 'Share a photo from a session that felt like progress — even a small one. Caption what changed.', format: 'photonote', episode: 3, cover: '', coverPos: 'center 50%', submissions: mockSubmissions() },
    { id: 'sa3', prompt: 'Drop a question you think is “too basic.” It isn’t. We answer each other here.', format: 'text', episode: null, cover: '', coverPos: 'center 50%', submissions: mockSubmissions() },
  ];
}

/* ---------- seed: events in the shared model ---------- */
function seedEvents() {
  return [
    { id: 'se1', title: 'Office Hours: Ask Carla Anything', type: 'Q&A', date: '2026-06-20', time: '18:00', dur: '45 min', provider: 'zoom', link: 'https://zoom.us/j/baseline', desc: 'Bring your questions on serve, nerves, or your last match. Carla answers live on camera.', cover: '', coverPos: 'center 50%' },
    { id: 'se2', title: 'Premiere: “Serve Mechanics” + live breakdown', type: 'Watch Party', date: '2026-06-23', time: '19:00', dur: '60 min', provider: 'meet', link: 'https://meet.google.com/baseline', desc: 'We watch Lesson 6 together, then Carla breaks down three members’ serves submitted this week.', cover: '', coverPos: 'center 50%' },
    { id: 'se3', title: 'Live Footwork & Court Coverage', type: 'Workshop', date: '2026-06-27', time: '08:00', dur: '30 min', provider: 'zoom', link: 'https://zoom.us/j/footwork', desc: 'A 30-minute movement session you do along with Carla. Sneakers on, racquet optional.', cover: '', coverPos: 'center 50%' },
    { id: 'se4', title: 'Mental Game Clinic', type: 'Q&A', date: '2026-06-10', time: '18:30', dur: '45 min', provider: 'zoom', link: 'https://zoom.us/j/mental', desc: 'Pressure, nerves, and the inner voice — the six seconds between points.', cover: '', coverPos: 'center 50%' },
  ];
}

/* ============================================================ FEED */
const FEED_TOPICS = ['All', 'Wins', 'Technique', 'Match stories', 'Questions', 'From Carla'];
function StudentFeed({ me, events, showToast }) {
  const [posts, setPosts] = us(() => (window.CPOSTS || []).map(p => ({ ...p })));
  const [filter, setFilter] = us('All');
  const newComment = (who, text) => ({ id: 'k' + Date.now() + Math.random().toString(36).slice(2, 5), who, time: 'now', text, likes: 0, liked: false, replies: [] });
  const onAction = (a) => {
    if (a.type === 'toast') { showToast(a.msg); return; }
    if (a.type === 'remove') { setPosts(prev => prev.filter(p => p.id !== a.postId)); showToast('Post deleted'); return; }
    setPosts(prev => prev.map(p => {
      if (p.id !== a.postId) return p;
      if (a.type === 'likePost') return { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) };
      if (a.type === 'comment') return { ...p, comments: [...(p.comments || []), newComment(ME, a.text)] };
      if (a.type === 'likeComment') { const tog = (c) => c.id === a.commentId ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : { ...c, replies: (c.replies || []).map(tog) }; return { ...p, comments: (p.comments || []).map(tog) }; }
      if (a.type === 'reply') return { ...p, comments: (p.comments || []).map(c => c.id === a.commentId ? { ...c, replies: [...(c.replies || []), newComment(ME, a.text)] } : c) };
      if (a.type === 'vote') return p.poll && p.poll.voted == null ? { ...p, poll: { ...p.poll, voted: a.optionId, options: p.poll.options.map(o => o.id === a.optionId ? { ...o, votes: o.votes + 1 } : o) } } : p;
      return p;
    }));
  };
  const addPost = (payload) => {
    setPosts(prev => [{ id: 'mine' + Date.now(), who: ME, time: 'now', likes: 0, liked: false, comments: [], topic: 'Wins', ...payload }, ...prev]);
    showToast('Posted to The Baseline');
  };
  const shown = posts.filter(p => filter === 'All' || p.topic === filter || (filter === 'From Carla' && (p.who === 'carla' || p.who === 'host')));
  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Feed</div>
          <div className="s">The running conversation of the room. Share your reps and wins, ask the question you think is too basic, and reply right in the thread.</div>
        </div>
      </div>
      <RichComposer onPost={addPost} events={events} showToast={showToast} avatar={me.avatar} authorName={me.name} placeholder="Share a rep, a win, or a question…"/>
      <div className="feed-filter">
        {FEED_TOPICS.map(t => <button key={t} className={`chip${filter === t ? ' on' : ''}`} onClick={() => setFilter(t)}>{t}</button>)}
      </div>
      <div className="crf-stack">
        {shown.map(p => <Post key={p.id} post={p} onAction={onAction} viewer="member"/>)}
      </div>
    </React.Fragment>
  );
}

/* ============================================================ ACTIVITIES */
function StudentActivities({ me, events, showToast }) {
  const [acts] = us(seedActivities);
  const [open, setOpen] = us(null);
  if (open) {
    const live = acts.find(a => a.id === open.id) || open;
    return <ActivityPage act={live} onBack={() => setOpen(null)} showToast={showToast} events={events} author={{ who: ME, name: me.name, avatar: me.avatar }} viewer="member"/>;
  }
  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Activities</div>
          <div className="s">What the room is working on. Open one to see everyone’s submissions and add your own — a clip, a photo, or a note.</div>
        </div>
      </div>
      <div className="ev-grid">
        {acts.map(a => <ActivityCard key={a.id} act={a} onOpen={setOpen}/>)}
      </div>
    </React.Fragment>
  );
}

/* ============================================================ EVENTS */
function StudentEvents({ showToast }) {
  const [events] = us(seedEvents);
  const [openEv, setOpenEv] = us(null);
  const todayKey = new Date().toISOString().slice(0, 10);
  const isPast = (ev) => ev.date && ev.date < todayKey;
  const upcoming = events.filter(ev => !isPast(ev)).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const past = events.filter(isPast).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Events</div>
          <div className="s">Live moments with Carla and the room — Q&amp;As, watch parties, and drill sessions. Tap any card to see the details and join.</div>
        </div>
      </div>
      {upcoming.length > 0 && (
        <React.Fragment>
          <div className="ev-sec-label">Upcoming · {upcoming.length}</div>
          <div className="ev-grid">{upcoming.map(ev => <EventCard key={ev.id} ev={ev} onOpen={setOpenEv}/>)}</div>
        </React.Fragment>
      )}
      {past.length > 0 && (
        <React.Fragment>
          <div className="ev-sec-label past">Past · {past.length}</div>
          <div className="ev-grid ev-grid-past">{past.map(ev => <EventCard key={ev.id} ev={ev} onOpen={setOpenEv} past/>)}</div>
        </React.Fragment>
      )}
      {openEv && <EventSheet ev={openEv} onClose={() => setOpenEv(null)} showToast={showToast}/>}
    </React.Fragment>
  );
}

/* ============================================================ MEMBERS */
const BADGE_LABEL = { host: 'Host', mod: 'Moderator', founding: 'Founding member' };
function StudentMembers({ me }) {
  const members = window.CMEMBERS || [];
  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Members</div>
          <div className="s">Everyone rebuilding their game alongside you. {C.members.toLocaleString()} members.</div>
        </div>
      </div>
      <div className="mem-grid">
        <div className="mem-card me">
          <img src={me.avatar} alt=""/>
          <div className="mem-main"><div className="mem-name">{me.name} <span className="mem-you">You</span></div><div className="mem-role">{me.headline}</div></div>
        </div>
        {members.map(m => {
          const p = PPL[m.who] || { name: m.who, avatar: '' };
          const badge = BADGE_LABEL[m.badge];
          return (
            <div key={m.who} className="mem-card">
              <img src={p.avatar} alt=""/>
              <div className="mem-main">
                <div className="mem-name">{p.name}{badge && <span className={`mem-badge ${m.badge}`}>{badge}</span>}</div>
                <div className="mem-role">{m.role}</div>
                <div className="mem-stats">{m.posts} posts · {m.joined === 'Founder' ? 'Founder' : `Joined ${m.joined}`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </React.Fragment>
  );
}

/* ============================================================ PROFILE (the student's settings) */
function AvatarEdit({ src, onFile }) {
  const [openPick, input] = useUpload('image/*', onFile);
  return (
    <button className="avatar-edit" onClick={openPick} aria-label="Change photo">
      <img src={src} alt=""/>
      <span className="avatar-edit-over"><G d={SF.image} size={20} stroke={1.9}/></span>
      {input}
    </button>
  );
}
function StudentProfile({ me, setMe, prefs, setPref, showToast }) {
  return (
    <React.Fragment>
      <div className="cr-head"><div><div className="h">Your profile</div><div className="s">How you show up in The Baseline. Update your photo, name, and what the room sees next to your posts.</div></div></div>

      <div className="glist-label">You</div>
      <div className="card prof-card" style={{ marginBottom: 26 }}>
        <div className="prof-id">
          <AvatarEdit src={me.avatar} onFile={img => { setMe(m => ({ ...m, avatar: img })); showToast('Photo updated'); }}/>
          <div className="prof-id-main">
            <div className="prof-id-name">{me.name}</div>
            <div className="prof-id-sub">{me.headline}</div>
          </div>
        </div>
        <Field label="Display name"><input className="input" value={me.name} onChange={e => setMe(m => ({ ...m, name: e.target.value }))}/></Field>
        <Field label="Headline" hint="A short line shown under your name on posts and in the member list.">
          <input className="input" value={me.headline} onChange={e => setMe(m => ({ ...m, headline: e.target.value }))}/>
        </Field>
      </div>

      <div className="glist-label">Notifications</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow"><div className="grow-main"><div className="gl">Replies to your posts</div><div className="gs">When someone comments on or replies to you</div></div><div className="grow-ctl"><Toggle on={prefs.replies} onClick={() => setPref('replies')}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Event reminders</div><div className="gs">A nudge before a live moment starts</div></div><div className="grow-ctl"><Toggle on={prefs.events} onClick={() => setPref('events')}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">New activities</div><div className="gs">When Carla posts something new to work on</div></div><div className="grow-ctl"><Toggle on={prefs.activities} onClick={() => setPref('activities')}/></div></div>
        <div className="grow"><div className="grow-main"><div className="gl">Weekly digest</div><div className="gs">A Monday recap of the best of the room</div></div><div className="grow-ctl"><Toggle on={prefs.digest} onClick={() => setPref('digest')}/></div></div>
      </div>

      <div className="glist-label">The masterclass</div>
      <div className="card glist" style={{ marginBottom: 26 }}>
        <div className="grow">
          <div className="set-course">
            <span className="set-course-ic" style={{ backgroundImage: `url(${C.cover})` }}></span>
            <div className="grow-main"><div className="gl">{C.course}</div><div className="gs">{C.brand} · {EPISODES.length} lessons · your enrollment gives you this room</div></div>
          </div>
          <div className="grow-ctl"><button className="btn btn-quiet btn-sm" onClick={() => showToast('Opening the course…')}>Go to course</button></div>
        </div>
      </div>
    </React.Fragment>
  );
}

/* ============================================================ APP */
function StudentApp() {
  const [dark, setDark] = us(() => localStorage.getItem('spaire_theme') === 'dark');
  ue(() => { document.body.classList.toggle('dark', dark); localStorage.setItem('spaire_theme', dark ? 'dark' : 'light'); }, [dark]);

  const [me, setMe] = us(DEFAULT_ME);
  ue(() => { window.CPPL[ME] = { name: me.name, avatar: me.avatar }; }, [me]);
  const [prefs, setPrefs] = us({ replies: true, events: true, activities: true, digest: false });
  const setPref = (k) => setPrefs(p => ({ ...p, [k]: !p[k] }));

  const [tab, setTab] = us('feed');
  const [toast, setToast] = us('');
  const tRef = ur();
  const showToast = (m) => { setToast(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToast(''), 2200); };
  const events = seedEvents();

  const TABS = [{ k: 'feed', label: 'Feed' }, { k: 'brief', label: 'Activities' }, { k: 'events', label: 'Events' }, { k: 'members', label: 'Members' }, { k: 'profile', label: 'Profile' }];

  return (
    <React.Fragment>
      <div className="mh-cover">
        <img src={C.cover} alt="" style={{ objectPosition: 'center 36%' }}/>
        <div className="wrap mh-brand">{C.brand}</div>
        <div className="wrap mh-head">
          <h1 className="mh-title">{C.title}</h1>
          <div className="mh-by">Hosted by Carla Marín</div>
        </div>
      </div>
      <div className="mh-bar">
        <div className="wrap mh-bar-in">
          <div className="mh-meta"><b>{C.members.toLocaleString()}</b> members</div>
          <span className="spacer"></span>
          <span className="mh-me"><img src={me.avatar} alt=""/>{me.name}</span>
        </div>
      </div>

      <div className="tabs cr-tabs">
        <div className="wrap tabs-in">
          {TABS.map(t => <button key={t.k} className={`tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
      </div>

      <div className="wrap content">
        {tab === 'feed'    && <StudentFeed me={me} events={events} showToast={showToast}/>}
        {tab === 'brief'   && <StudentActivities me={me} events={events} showToast={showToast}/>}
        {tab === 'events'  && <StudentEvents showToast={showToast}/>}
        {tab === 'members' && <StudentMembers me={me}/>}
        {tab === 'profile' && <StudentProfile me={me} setMe={setMe} prefs={prefs} setPref={setPref} showToast={showToast}/>}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<StudentApp/>);
