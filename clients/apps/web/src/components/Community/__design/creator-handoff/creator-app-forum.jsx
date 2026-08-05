/* ============================================================
   SPAIRE ORIGINALS — Community · CREATOR console (empty state)
   Carla setting up "The Baseline" from scratch.
   ============================================================ */
const { useState: us, useEffect: ue, useRef: ur, useCallback: uc } = React;
const G = window.CGlyph, SF = window.CSF, C = window.COMMUNITY, HOST = window.CHOST;

/* extra glyphs the creator view needs */
const CR = {
  chevR: 'M9 6l6 6-6 6',
  settings: 'M4 8h9 M17 8h3 M4 16h3 M11 16h9 M15 5.5v5 M7 13.5v5',
  spark: 'M12 3.2l1.7 5.6 5.6 1.7-5.6 1.7L12 17.8l-1.7-5.6L4.7 10.5l5.6-1.7Z M18.5 14.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7Z',
  link: 'M9.5 13.5 14.5 8.5 M8 11 6 13a3 3 0 0 0 4.2 4.2l2-2 M16 13l2-2a3 3 0 0 0-4.2-4.2l-2 2',
  doc: 'M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M13.5 3v5h4.5',
};
const ALLG = { ...SF, ...CR };

/* ---------- activity ring (local) ---------- */
function Ring({ pct, size = 92, stroke = 9, label, sub }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  const off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
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

/* ---------- small form atoms ---------- */
function Field({ label, hint, children }) {
  return <div className="field"><label>{label}</label>{children}{hint && <div className="hint">{hint}</div>}</div>;
}
function Seg({ value, options, onChange }) {
  return (
    <div className="seg-ctl">
      {options.map(o => <button key={o} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}
function Toggle({ on, onClick }) { return <button className={`tog${on ? ' on' : ''}`} onClick={onClick} aria-pressed={on}></button>; }

/* ============================================================ AI ASSISTANT */
const AI_DRAFTS = {
  post: `Welcome to The Baseline.

This is our room — not a broadcast channel. Post your reps even when they're ugly, ask the question you think is too basic (it isn't), and tell us when something finally clicks.

I'll be here every week with a live Q&A and a drill session, and I read every thread. Let's build games that hold up when the match is on the line.`,
  guidelines: `1. Be generous — everyone here is mid-rebuild.
2. Post reps, wins, and honest questions. Ugly footage welcome.
3. Keep feedback kind and specific.
4. What's shared in the room stays in the room.`,
  event: { title: 'Live Welcome Q&A', type: 'Live Q&A', date: '2026-06-20', time: '18:00', dur: '45 min',
    desc: "Kick things off live. Introduce yourself, tell everyone what you're working on, and ask me anything about your game — serve, nerves, or your last match." },
  activity: { title: '7-Day Serve Streak', type: 'Streak', target: '7', unit: 'days',
    desc: "Log 100 serves a day for a week. Track your toss consistency, not just the count — quality reps beat tired ones. Film one and drop it in the feed." },
};

function AIModal({ ctx, onClose, onUse }) {
  const [mode, setMode] = us(ctx ? 'thinking' : 'menu');   // menu | thinking | result
  const [kind, setKind] = us(ctx || null);
  ue(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, []);
  ue(() => {
    if (mode !== 'thinking') return;
    const id = setTimeout(() => setMode('result'), 1100);
    return () => clearTimeout(id);
  }, [mode, kind]);

  const run = (k) => { setKind(k); setMode('thinking'); };
  const draft = AI_DRAFTS[kind];
  const isText = kind === 'post' || kind === 'guidelines';

  const ACTIONS = [
    { k: 'post', ic: SF.bubble, l: 'Write a welcome post', s: 'A warm first message for your feed' },
    { k: 'event', ic: SF.calendar, l: 'Plan my first event', s: 'A live session to bring everyone in' },
    { k: 'activity', ic: SF.target, l: 'Suggest a beginner challenge', s: 'A simple activity members can start today' },
    { k: 'guidelines', ic: CR.doc, l: 'Draft community guidelines', s: 'Set the tone for how the room behaves' },
  ];

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
              <p className="ai-intro">New here? Tell me what you want to set up and I'll draft it. You can edit everything after.</p>
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

          {mode === 'thinking' && (
            <div className="ai-draft">
              <div className="ai-thinking">Drafting<span className="ai-dots"><i></i><i></i><i></i></span></div>
            </div>
          )}

          {mode === 'result' && (
            <div className="ai-draft">
              <div className="ai-result-label"><G d={CR.spark} size={13} fill="currentColor"/> Draft</div>
              {isText
                ? <div className="ai-result-text">{draft}</div>
                : <div className="ai-result-text"><b>{draft.title}</b>{'\n'}{draft.type}{draft.date ? ` · ${draft.date} ${draft.time}` : ''}{draft.target ? ` · ${draft.target} ${draft.unit}` : ''}{'\n\n'}{draft.desc}</div>}
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

/* ============================================================ EVENT FORM */
const EVENT_TYPES = ['Live Q&A', 'Watch Party', 'Drill Session'];
function EventForm({ form, set, onCreate, onAI }) {
  const can = form.title.trim() && form.date;
  return (
    <div className="card form-card">
      <div className="form-title">New event</div>
      <Field label="Title"><input className="input" value={form.title} placeholder="e.g. Live Welcome Q&A" onChange={e => set({ title: e.target.value })}/></Field>
      <Field label="Type"><Seg value={form.type} options={EVENT_TYPES} onChange={v => set({ type: v })}/></Field>
      <div className="field-row">
        <Field label="Date"><input className="input" type="date" value={form.date} onChange={e => set({ date: e.target.value })}/></Field>
        <Field label="Time"><input className="input" type="time" value={form.time} onChange={e => set({ time: e.target.value })}/></Field>
      </div>
      <Field label="Duration">
        <select className="input" value={form.dur} onChange={e => set({ dur: e.target.value })}>
          <option>30 min</option><option>45 min</option><option>60 min</option><option>90 min</option>
        </select>
      </Field>
      <Field label="Description" hint="Members see this on the event card and in their reminder.">
        <textarea className="textarea" value={form.desc} placeholder="What happens in this session?" onChange={e => set({ desc: e.target.value })}></textarea>
      </Field>
      <div className="form-foot">
        <span className="grow-main" style={{ fontSize: 13, color: 'var(--t3)' }}>Visible to all members · recorded automatically</span>
        <span className="sp"></span>
        <button className="btn btn-primary" disabled={!can} style={!can ? { opacity: .4 } : null} onClick={onCreate}>Schedule event</button>
      </div>
    </div>
  );
}

/* ============================================================ ACTIVITY FORM */
const ACT_TYPES = ['Challenge', 'Daily Drill', 'Streak', 'Community Goal'];
function ActivityForm({ form, set, onCreate, onAI }) {
  const can = form.title.trim() && form.target;
  return (
    <div className="card form-card">
      <div className="form-title">New activity</div>
      <Field label="Title"><input className="input" value={form.title} placeholder="e.g. 7-Day Serve Streak" onChange={e => set({ title: e.target.value })}/></Field>
      <Field label="Type"><Seg value={form.type} options={ACT_TYPES} onChange={v => set({ type: v })}/></Field>
      <Field label="Goal" hint="What members aim for. Their progress ring fills toward this.">
        <div className="numunit">
          <input className="input num" type="number" min="1" value={form.target} placeholder="7" onChange={e => set({ target: e.target.value })}/>
          <select className="input" value={form.unit} onChange={e => set({ unit: e.target.value })}>
            <option>days</option><option>reps</option><option>sessions</option><option>minutes</option>
          </select>
        </div>
      </Field>
      <Field label="Runs for">
        <Seg value={form.dur} options={['This week', 'This month', 'Ongoing']} onChange={v => set({ dur: v })}/>
      </Field>
      <Field label="Description">
        <textarea className="textarea" value={form.desc} placeholder="What should members do, and how do they log it?" onChange={e => set({ desc: e.target.value })}></textarea>
      </Field>
      <div className="form-foot">
        <span className="sp"></span>
        <button className="btn btn-primary" disabled={!can} style={!can ? { opacity: .4 } : null} onClick={onCreate}>Create activity</button>
      </div>
    </div>
  );
}

/* ============================================================ APP */
function App() {
  const [dark, setDark] = us(() => localStorage.getItem('spaire_theme') === 'dark');
  ue(() => { document.body.classList.toggle('dark', dark); localStorage.setItem('spaire_theme', dark ? 'dark' : 'light'); }, [dark]);

  const [tab, setTab] = us('feed');
  const [posts, setPosts] = us([]);
  const [events, setEvents] = us([]);
  const [acts, setActs] = us([]);
  const [invited, setInvited] = us(false);
  const [settingsSaved, setSettingsSaved] = us(false);
  const [showEventForm, setShowEventForm] = us(true);
  const [showActForm, setShowActForm] = us(true);
  const [toast, setToast] = us(null);
  const [ai, setAi] = us(null);            // null | { ctx }
  const tRef = ur();

  const [postText, setPostText] = us('');
  const [settings, setSettings] = us({
    name: 'The Baseline', tagline: "Carla Marín's private community",
    privacy: 'Public', whoCanPost: 'Everyone', memberEvents: false, moderation: true, welcomeDM: true,
  });
  const [eventForm, setEventForm] = us({ title: '', type: 'Live Q&A', date: '', time: '18:00', dur: '45 min', desc: '' });
  const [actForm, setActForm] = us({ title: '', type: 'Challenge', target: '', unit: 'days', dur: 'This week', desc: '' });
  const setEv = (p) => setEventForm(f => ({ ...f, ...p }));
  const setAct = (p) => setActForm(f => ({ ...f, ...p }));
  const setSet = (p) => setSettings(s => ({ ...s, ...p }));

  const showToast = uc((m) => { setToast(m); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToast(null), 2400); }, []);
  const goTab = (t) => { setTab(t); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  /* checklist */
  const tasks = [
    { k: 'settings', done: settingsSaved, tt: 'Set up your community', ts: 'Name, privacy, and who can post', to: 'settings' },
    { k: 'post', done: posts.length > 0, tt: 'Write a welcome post', ts: 'The first thing new members see', to: 'feed' },
    { k: 'event', done: events.length > 0, tt: 'Schedule your first event', ts: 'A live session brings people in', to: 'events' },
    { k: 'activity', done: acts.length > 0, tt: 'Create your first activity', ts: 'Give members something to do today', to: 'activities' },
    { k: 'invite', done: invited, tt: 'Invite your members', ts: 'Share the link with your students', to: null },
  ];
  const doneCount = tasks.filter(t => t.done).length;
  const allDone = doneCount === tasks.length;

  /* AI use handler */
  const onUse = (kind, draft) => {
    if (kind === 'post') { setPostText(draft); setTab('feed'); showToast('Draft added to your post'); }
    else if (kind === 'guidelines') { showToast('Guidelines saved to settings'); }
    else if (kind === 'event') { setEventForm(f => ({ ...f, ...draft })); setTab('events'); setShowEventForm(true); showToast('Event drafted — review and schedule'); }
    else if (kind === 'activity') { setActForm(f => ({ ...f, ...draft })); setTab('activities'); setShowActForm(true); showToast('Activity drafted — review and create'); }
  };

  const publishPost = () => {
    if (!postText.trim()) return;
    setPosts(p => [{ id: Date.now(), text: postText.trim() }, ...p]); setPostText(''); showToast('Posted to your community');
  };
  const createEvent = () => {
    setEvents(e => [{ ...eventForm, id: Date.now() }, ...e]);
    setEventForm({ title: '', type: 'Live Q&A', date: '', time: '18:00', dur: '45 min', desc: '' });
    setShowEventForm(false); showToast('Event scheduled');
  };
  const createAct = () => {
    setActs(a => [{ ...actForm, id: Date.now() }, ...a]);
    setActForm({ title: '', type: 'Challenge', target: '', unit: 'days', dur: 'This week', desc: '' });
    setShowActForm(false); showToast('Activity created');
  };
  const saveSettings = () => { setSettingsSaved(true); showToast('Settings saved'); };
  const invite = () => { setInvited(true); showToast('Invite link copied'); };

  const TABS = [{ k: 'feed', label: 'Feed' }, { k: 'events', label: 'Events' }, { k: 'activities', label: 'Activities' }, { k: 'settings', label: 'Settings' }];

  return (
    <React.Fragment>
      {/* TOP BAR */}
      <div className="topbar">
        <div className="wrap topbar-in">
          <div className="brand"><span className="dot"></span>{C.brand}<span className="ctx">&nbsp;·&nbsp;{C.course}</span></div>
          <span className="spacer"></span>
          <div className="top-right">
            <span className="creator-pill"><span className="dotc"></span>Creator</span>
            <span className="who"><img src={HOST.avatar} alt="Carla"/>Carla</span>
            <button className="tt" aria-label="Appearance" onClick={() => setDark(d => !d)}>
              <span className="ic-moon"><G d={SF.moon} size={16} stroke={1.8}/></span>
              <span className="ic-sun"><G d={SF.sun} size={16} stroke={1.8}/></span>
            </button>
          </div>
        </div>
      </div>

      {/* MASTHEAD */}
      <div className="mh-cover">
        <img src={C.cover} alt=""/>
        <div className="wrap mh-head">
          <div className="mh-eyebrow">{C.brand} · Creator</div>
          <h1 className="mh-title">{settings.name}</h1>
          <div className="mh-by">Hosted by Carla Marín</div>
        </div>
      </div>
      <div className="mh-bar">
        <div className="wrap mh-bar-in">
          <div className="mh-meta">
            <b>0</b> members<span style={{ margin: '0 10px', opacity: .5 }}>·</span>
            <span className="mh-draft">{settingsSaved ? 'Ready to invite' : 'Not published yet'}</span>
          </div>
          <span className="spacer"></span>
          <button className="btn btn-quiet btn-sm" onClick={invite}><G d={CR.link} size={15} stroke={1.9}/> Copy invite link</button>
          <button className="btn btn-primary btn-sm" onClick={() => settingsSaved ? showToast('Your community is live') : goTab('settings')}>{settingsSaved ? 'Published' : 'Publish'}</button>
        </div>
      </div>

      {/* TABS */}
      <div className="tabs">
        <div className="wrap tabs-in">
          {TABS.map(t => <button key={t.k} className={`tab ${tab === t.k ? 'on' : ''}`} onClick={() => setTab(t.k)}>{t.label}</button>)}
        </div>
      </div>

      {/* CONTENT */}
      <div className="wrap content">

        {/* setup checklist — shows until everything is done */}
        {!allDone && (
          <div className="card setup">
            <div className="setup-ring"><Ring pct={doneCount / tasks.length * 100} size={96} stroke={9} label={`${doneCount}/${tasks.length}`} sub="done"/></div>
            <div className="setup-head">
              <div className="eyebrow">Welcome, Carla</div>
              <h2>Let's set up The Baseline</h2>
              <p>Five quick steps and your community is ready for members. Work through them in any order — you can change everything later.</p>
            </div>
            <div className="setup-tasks">
              {tasks.map(t => (
                <button key={t.k} className={`task${t.done ? ' done' : ''}`} onClick={() => t.to ? goTab(t.to) : invite()}>
                  <span className="task-check"><G d={SF.check} size={15} stroke={2.6}/></span>
                  <span className="task-main"><span className="task-tt">{t.tt}</span><span className="task-ts">{t.ts}</span></span>
                  <span className="task-cta">{t.done ? 'Done' : <React.Fragment>{t.k === 'invite' ? 'Copy link' : 'Set up'} <G d={CR.chevR} size={15} stroke={2}/></React.Fragment>}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- FEED ---------------- */}
        {tab === 'feed' && (
          <React.Fragment>
            <div className="card first-post">
              <div className="fp-row">
                <img src={HOST.avatar} alt="Carla"/>
                <textarea value={postText} onChange={e => setPostText(e.target.value)} placeholder="Write your first post — welcome the people who join…"></textarea>
              </div>
              <div className="fp-foot">
                <span className="sp"></span>
                <button className="btn btn-primary btn-sm" disabled={!postText.trim()} style={!postText.trim() ? { opacity: .4 } : null} onClick={publishPost}>Post</button>
              </div>
            </div>

            {posts.length === 0 ? (
              <div className="card empty" style={{ marginTop: 18 }}>
                <div className="empty-ic"><G d={SF.bubble} size={26} stroke={1.7}/></div>
                <h3>No posts yet</h3>
                <p>Your feed is where the community lives. Your first post is your welcome — say hi and tell members what this room is for.</p>
              </div>
            ) : (
              <div className="feed-stack" style={{ marginTop: 18 }}>
                {posts.map(p => (
                  <article key={p.id} className="card post fade-in">
                    <header className="post-head">
                      <img className="av" src={HOST.avatar} alt="Carla"/>
                      <div className="post-id"><div className="post-name">Carla Marín<span className="role">Host</span></div><div className="post-meta">now · From Carla</div></div>
                    </header>
                    <div className="post-text">{p.text}</div>
                  </article>
                ))}
              </div>
            )}
          </React.Fragment>
        )}

        {/* ---------------- EVENTS ---------------- */}
        {tab === 'events' && (
          <React.Fragment>
            <div className="cr-head">
              <div><div className="h">Events</div><div className="s">Live sessions, watch parties, and drills you host for members.</div></div>
              {events.length > 0 && !showEventForm && <button className="btn btn-quiet btn-sm" onClick={() => setShowEventForm(true)}><G d={SF.plus} size={15} stroke={2}/> New event</button>}
            </div>

            {events.length > 0 && (
              <div className="card form-card" style={{ marginBottom: showEventForm ? 18 : 0, padding: '8px 22px' }}>
                {events.map(ev => (
                  <div key={ev.id} className="made">
                    <span className="made-ic"><G d={SF.calendar} size={20} stroke={1.8}/></span>
                    <div className="made-main"><div className="mt">{ev.title}</div><div className="ms">{ev.type} · {ev.date || 'TBD'}{ev.time ? ` · ${ev.time}` : ''} · {ev.dur}</div></div>
                    <span className="made-tag">Scheduled</span>
                  </div>
                ))}
              </div>
            )}

            {(showEventForm || events.length === 0) && (
              events.length === 0 && !showEventForm ? null : (
                <EventForm form={eventForm} set={setEv} onCreate={createEvent}/>
              )
            )}
          </React.Fragment>
        )}

        {/* ---------------- ACTIVITIES ---------------- */}
        {tab === 'activities' && (
          <React.Fragment>
            <div className="cr-head">
              <div><div className="h">Activities</div><div className="s">Challenges and streaks that give members something to do between lessons.</div></div>
              {acts.length > 0 && !showActForm && <button className="btn btn-quiet btn-sm" onClick={() => setShowActForm(true)}><G d={SF.plus} size={15} stroke={2}/> New activity</button>}
            </div>

            {acts.length > 0 && (
              <div className="card form-card" style={{ marginBottom: showActForm ? 18 : 0, padding: '8px 22px' }}>
                {acts.map(a => (
                  <div key={a.id} className="made">
                    <span className="made-ic"><G d={SF.target} size={20} stroke={1.8}/></span>
                    <div className="made-main"><div className="mt">{a.title}</div><div className="ms">{a.type} · {a.target} {a.unit} · {a.dur}</div></div>
                    <span className="made-tag">Live</span>
                  </div>
                ))}
              </div>
            )}

            {(showActForm || acts.length === 0) && (
              <ActivityForm form={actForm} set={setAct} onCreate={createAct}/>
            )}
          </React.Fragment>
        )}

        {/* ---------------- SETTINGS ---------------- */}
        {tab === 'settings' && (
          <React.Fragment>
            <div className="cr-head"><div><div className="h">Community settings</div><div className="s">How your room looks and who gets to do what.</div></div></div>

            <div className="glist-label">Identity</div>
            <div className="card glist" style={{ marginBottom: 26 }}>
              <div className="grow"><div className="grow-main"><div className="gl">Name</div></div><div className="grow-ctl"><input className="input" value={settings.name} onChange={e => setSet({ name: e.target.value })}/></div></div>
              <div className="grow"><div className="grow-main"><div className="gl">Tagline</div></div><div className="grow-ctl"><input className="input" value={settings.tagline} onChange={e => setSet({ tagline: e.target.value })}/></div></div>
              <div className="grow"><div className="grow-main"><div className="gl">Cover image</div><div className="gs">Shown across the top of your community</div></div><div className="grow-ctl grow-cover"><img className="cov" src={C.cover} alt=""/><button className="btn btn-quiet btn-sm" onClick={() => showToast('Cover picker coming soon')}>Change</button></div></div>
            </div>

            <div className="glist-label">Access</div>
            <div className="card glist" style={{ marginBottom: 26 }}>
              <div className="grow"><div className="grow-main"><div className="gl">Privacy</div><div className="gs">Public communities appear on your course page</div></div><div className="grow-ctl"><Seg value={settings.privacy} options={['Public', 'Private']} onChange={v => setSet({ privacy: v })}/></div></div>
              <div className="grow"><div className="grow-main"><div className="gl">Who can post</div><div className="gs">Members can always comment and react</div></div><div className="grow-ctl"><Seg value={settings.whoCanPost} options={['Everyone', 'Approved']} onChange={v => setSet({ whoCanPost: v })}/></div></div>
              <div className="grow"><div className="grow-main"><div className="gl">Let members host events</div><div className="gs">Members can propose their own meetups</div></div><div className="grow-ctl"><Toggle on={settings.memberEvents} onClick={() => setSet({ memberEvents: !settings.memberEvents })}/></div></div>
            </div>

            <div className="glist-label">Moderation</div>
            <div className="card glist" style={{ marginBottom: 26 }}>
              <div className="grow"><div className="grow-main"><div className="gl">Review first post from new members</div><div className="gs">Catch spam before it reaches the feed</div></div><div className="grow-ctl"><Toggle on={settings.moderation} onClick={() => setSet({ moderation: !settings.moderation })}/></div></div>
              <div className="grow"><div className="grow-main"><div className="gl">Welcome new members</div><div className="gs">Send an automatic hello when someone joins</div></div><div className="grow-ctl"><Toggle on={settings.welcomeDM} onClick={() => setSet({ welcomeDM: !settings.welcomeDM })}/></div></div>
            </div>

            <div className="form-foot" style={{ border: 'none', paddingTop: 0 }}>
              <span className="sp"></span>
              <button className="btn btn-primary" onClick={saveSettings}>{settingsSaved ? 'Saved' : 'Save settings'}</button>
            </div>
          </React.Fragment>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
