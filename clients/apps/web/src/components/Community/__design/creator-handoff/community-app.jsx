/* ============================================================
   SPAIRE ORIGINALS — Community hub · app shell
   Topbar · masthead · segmented tabs · state · toast
   ============================================================ */
const { useState: uS, useEffect: uE, useRef: uR, useCallback: uC } = React;

/* viewer is a valid "person" for new posts/comments */
window.CPPL.you = { name: window.CVIEWER.name, avatar: window.CVIEWER.avatar };

/* recursively map a comment tree */
function mapTree(list, id, fn) {
  return list.map(c => {
    if (c.id === id) return fn(c);
    if (c.replies && c.replies.length) return { ...c, replies: mapTree(c.replies, id, fn) };
    return c;
  });
}
function addReply(list, id, reply) {
  return list.map(c => {
    if (c.id === id) return { ...c, replies: [...(c.replies || []), reply] };
    if (c.replies && c.replies.length) return { ...c, replies: addReply(c.replies, id, reply) };
    return c;
  });
}
let _uid = 1000;
const uid = () => 'x' + (++_uid);

function App() {
  /* theme */
  const [dark, setDark] = uS(() => localStorage.getItem('spaire_theme') === 'dark');
  uE(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem('spaire_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const [tab, setTab] = uS('feed');
  const [filter, setFilter] = uS('All');
  const [posts, setPosts] = uS(() => window.CPOSTS.map(p => ({ ...p })));
  const [rsvps, setRsvps] = uS({});
  const [joins, setJoins] = uS({});
  const [toast, setToast] = uS(null);
  const toastT = uR();

  const showToast = uC((msg) => {
    setToast(msg);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const goTab = uC((t) => { setTab(t); const el = document.querySelector('.tabs'); if (el) window.scrollTo({ top: el.offsetTop - 52, behavior: 'smooth' }); }, []);

  /* feed actions */
  const onAction = uC((a) => {
    if (a.type === 'toast') return showToast(a.msg);
    setPosts(all => all.map(p => {
      if (p.id !== a.postId) return p;
      if (a.type === 'likePost') return { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) };
      if (a.type === 'comment') return { ...p, comments: [...(p.comments || []), { id: uid(), who: 'you', time: 'now', text: a.text, likes: 0, liked: false, replies: [] }] };
      if (a.type === 'likeComment') return { ...p, comments: mapTree(p.comments, a.commentId, c => ({ ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) })) };
      if (a.type === 'reply') return { ...p, comments: addReply(p.comments, a.commentId, { id: uid(), who: 'you', time: 'now', text: a.text, likes: 0, liked: false, replies: [] }) };
      return p;
    }));
    if (a.type === 'comment' || a.type === 'reply') showToast(a.type === 'reply' ? 'Reply posted' : 'Comment posted');
  }, [showToast]);

  const onPost = uC(({ text, topic }) => {
    setPosts(all => [{ id: uid(), who: 'you', topic, time: 'now', text, likes: 0, liked: false, comments: [] }, ...all]);
    showToast('Posted to the community');
  }, [showToast]);

  const onRsvp = uC((ev) => {
    setRsvps(r => {
      const cur = r[ev.id] != null ? r[ev.id] : ev.rsvp;
      showToast(!cur ? `You’re going · ${ev.title}` : 'RSVP removed');
      return { ...r, [ev.id]: !cur };
    });
  }, [showToast]);
  const onJoinLive = uC((ev) => showToast(ev.recording ? `Opening recording…` : `Joining ${ev.title}…`), [showToast]);
  const onJoinChal = uC((ch) => {
    setJoins(j => {
      const cur = j[ch.id] != null ? j[ch.id] : ch.joined;
      showToast(!cur ? `Joined · ${ch.title}` : `Left ${ch.title}`);
      return { ...j, [ch.id]: !cur };
    });
  }, [showToast]);

  const C = window.COMMUNITY;
  const liveCount = window.CEVENTS.filter(e => e.live).length;

  const shown = posts.filter(p => {
    if (filter === 'All') return true;
    if (filter === 'From Carla') return p.who === 'carla';
    return p.topic === filter;
  });

  const TABS = [
    { k: 'feed', label: 'Feed' },
    { k: 'events', label: 'Events', badge: liveCount > 0 },
    { k: 'activities', label: 'Activities' },
    { k: 'members', label: 'Members' },
  ];

  return (
    <React.Fragment>
      {/* TOP BAR */}
      <div className="topbar">
        <div className="wrap topbar-in">
          <div className="brand">
            <span className="dot"></span>{C.brand}
            <span className="ctx">&nbsp;·&nbsp;{C.course}</span>
          </div>
          <span className="spacer"></span>
          <div className="top-right">
            <span className="who"><img src={window.CVIEWER.avatar} alt="You"/>You</span>
            <button className="tt" aria-label="Toggle appearance" onClick={() => setDark(d => !d)}>
              <span className="ic-moon"><CGlyph d={CSF.moon} size={16} stroke={1.8}/></span>
              <span className="ic-sun"><CGlyph d={CSF.sun} size={16} stroke={1.8}/></span>
            </button>
          </div>
        </div>
      </div>

      {/* MASTHEAD */}
      <div className="mh-cover">
        <img src={C.cover} alt=""/>
        <div className="wrap mh-head">
          <div className="mh-eyebrow">{C.brand} · Community</div>
          <h1 className="mh-title">{C.title}</h1>
          <div className="mh-by">Hosted by Carla Marín</div>
        </div>
      </div>
      <div className="mh-bar">
        <div className="wrap mh-bar-in">
          <div className="mh-meta">
            <b>{C.members.toLocaleString()}</b> members<span className="sep">&nbsp;&nbsp;·&nbsp;&nbsp;</span>
            <b>{C.online}</b> online{liveCount ? <React.Fragment><span className="sep">&nbsp;&nbsp;·&nbsp;&nbsp;</span><span className="live">1 live event now</span></React.Fragment> : null}
          </div>
          <span className="spacer"></span>
          <div className="facepile">
            {['amara','sam','diego','yuki','priya'].map(w => <img key={w} src={window.CPPL[w].avatar} alt=""/>)}
          </div>
          <button className="btn btn-quiet btn-sm" onClick={() => showToast('You’re a member of The Baseline')}>Joined</button>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        <div className="wrap tabs-in">
          {TABS.map(t => (
            <button key={t.k} className={`tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>
              {t.label}{t.badge ? <span className="live-dot"></span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* CONTENT */}
      <div className="wrap content">
        {tab === 'feed' && (
          <div className="feed-grid">
            <div className="col-main">
              <CComposer onPost={onPost}/>
              <div className="filter">
                {window.CTOPICS.map(t => (
                  <button key={t} className={filter === t ? 'on' : ''} onClick={() => setFilter(t)}>{t}</button>
                ))}
              </div>
              <div className="feed-stack">
                {shown.map(p => <CPostCard key={p.id} post={p} onAction={onAction}/>)}
                {shown.length === 0 && <div className="card post" style={{ color: 'var(--t3)' }}>Nothing in “{filter}” yet.</div>}
              </div>
            </div>
            <aside className="col-side">
              <CSidebar joins={joins} onJoin={onJoinChal} onGoTab={goTab}/>
            </aside>
          </div>
        )}
        {tab === 'events' && <CEventsView rsvps={rsvps} onRsvp={onRsvp} onJoin={onJoinLive}/>}
        {tab === 'activities' && <CActivitiesView joins={joins} onJoin={onJoinChal}/>}
        {tab === 'members' && <CMembersView onToast={showToast}/>}
      </div>

      {/* TOAST */}
      {toast && <div className="toast">{toast}</div>}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
