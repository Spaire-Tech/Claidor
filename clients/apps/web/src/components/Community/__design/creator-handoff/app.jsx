/* ============================================================
   SPAIRE — App shell: top nav · sidebar · rail · router · state
   ============================================================ */
const { useState: uS, useRef: uR, useEffect: uE } = React;

/* ---------- Top navigation bar ---------- */
function TopNav({ view, onAction, state }) {
  const [bell, setBell] = uS(false);
  const bellRef = uR();
  window.useClickOutside(bellRef, ()=>setBell(false), bell);
  const navMap = { Home:'feed', Community:'feed', Events:'events', Members:'members' };
  const activeTop = ['events'].includes(view)||view==='eventDetail' ? 'Events' : view==='members' ? 'Members' : 'Community';
  const unread = window.NOTIFS.filter(n=>n.unread).length;
  return (
    <header className="topbar">
      <div className="tb-left">
        <div className="wordmark" onClick={()=>onAction({type:'go', view:'feed'})}>
          <div className="wm-mark"><Icon name="bolt" size={17} color="#fff" stroke={2.2}/></div>
          <span className="wm-text">Spaire</span>
          <span className="wm-caret"><Icon name="caret" size={15}/></span>
        </div>
      </div>
      <div className="tb-center">
        <nav className="nav">
          {['Home','Community','Events','Members'].map(n => (
            <button key={n} className={`nav-item ${activeTop===n && n!=='Home' ? 'active':''}`} onClick={()=>onAction({type:'go', view:navMap[n]})}>{n}</button>
          ))}
        </nav>
      </div>
      <div className="tb-right">
        <div className="search" onClick={()=>onAction({type:'toast', msg:'Search coming soon'})}><Icon name="search" size={16}/> Search</div>
        <div style={{ position:'relative' }} ref={bellRef}>
          <button className="icon-btn" onClick={()=>setBell(o=>!o)}><Icon name="bell" size={20}/>{unread>0 && <span className="dot"/>}</button>
          <Menu open={bell} onClose={()=>setBell(false)} top="calc(100% + 8px)">
            <div className="menu-label">Notifications</div>
            {window.NOTIFS.map(n => (
              <button key={n.id} className="menu-item" style={{ alignItems:'flex-start' }}>
                <Avatar name={n.who} size={32}/>
                <span style={{ flex:1, fontWeight:500, fontSize:13.5, lineHeight:1.4 }}><strong>{n.who}</strong> {n.text}<div style={{ color:'var(--muted)', fontSize:12, marginTop:2 }}>{n.time} ago</div></span>
                {n.unread && <span style={{ width:8, height:8, borderRadius:999, background:'var(--brand)', marginTop:6 }}/>}
              </button>
            ))}
          </Menu>
        </div>
        <button className="icon-btn" onClick={()=>onAction({type:'toast', msg:'Messages'})}><Icon name="chat" size={20}/></button>
        <button className="icon-btn" onClick={()=>onAction({type:'toast', msg:'Help center'})}><Icon name="help" size={20}/></button>
        <div style={{ width:1, height:24, background:'var(--line)', margin:'0 4px' }}/>
        <button onClick={()=>onAction({type:'go', view:'settings'})} style={{ border:'none', background:'transparent', padding:0, borderRadius:999 }}><Avatar name="Mara Linwood" size={34} ring/></button>
      </div>
    </header>
  );
}

/* ---------- Left sidebar ---------- */
function SidebarItem({ icon, label, active, count, unread, onClick }) {
  return (
    <button className={`sb-item ${active?'active':''}`} onClick={onClick}>
      <span className="sb-ico"><Icon name={icon} size={18}/></span>
      <span className="sb-label">{label}</span>
      {unread>0 && <span className="sb-count" style={{ background:'var(--brand)', color:'#fff' }}>{unread}</span>}
      {count!=null && unread==null && <span className="sb-count">{count}</span>}
    </button>
  );
}
function Sidebar({ view, selectedId, onAction, state }) {
  const [modOpen, setModOpen] = uS(true);
  return (
    <aside className="sidebar">
      <div className="sb-scroll">
        <SidebarItem icon="feed" label="Feed" active={view==='feed'} onClick={()=>onAction({type:'go', view:'feed'})}/>

        <div className="sb-section"><span className="sb-section-t">Welcome</span></div>
        <div className="sb-group">
          <SidebarItem icon="rocket" label="Start Here" onClick={()=>onAction({type:'toast', msg:'Start Here space'})}/>
          <SidebarItem icon="book" label="Course Resources" onClick={()=>onAction({type:'toast', msg:'Resources space'})}/>
        </div>

        <div className="sb-section"><span className="sb-section-t">Spaces</span><button className="add" onClick={()=>onAction({type:'toast', msg:'New space'})}><Icon name="plus" size={15}/></button></div>
        <div className="sb-group">
          <SidebarItem icon="hand" label="Introductions" onClick={()=>onAction({type:'toast', msg:'Introductions'})}/>
          <SidebarItem icon="message" label="General Chat" onClick={()=>onAction({type:'toast', msg:'General Chat'})}/>
          <SidebarItem icon="trophy" label="Wins & Work" onClick={()=>onAction({type:'toast', msg:'Wins & Work'})}/>
        </div>

        <div className="sb-section"><span className="sb-section-t">Modules</span><button className="add" onClick={()=>setModOpen(o=>!o)}><Icon name={modOpen?'caretUp':'caret'} size={15}/></button></div>
        {modOpen && <div className="sb-group">
          {window.MODULES.map(m => (
            <button key={m.id} className="sb-item" onClick={()=>onAction({type:'toast', msg:`Module ${m.n} · ${m.title}`})}>
              <span className="sb-ico" style={{ width:18, fontWeight:650, fontSize:12, color:'var(--muted)' }}>{m.n}</span>
              <span className="sb-label">{m.title}</span>
              {m.unread>0 && <span className="sb-dot-unread"/>}
            </button>
          ))}
        </div>}

        <div className="sb-section"><span className="sb-section-t">Live</span></div>
        <div className="sb-group">
          <SidebarItem icon="events" label="Events" active={view==='events'||view==='eventDetail'} count={state.events.filter(e=>e.status!=='past').length} onClick={()=>onAction({type:'go', view:'events'})}/>
          <SidebarItem icon="trophy" label="Activities" active={view==='activities'||view==='activityDetail'} count={state.activities.filter(a=>a.status==='open').length} onClick={()=>onAction({type:'go', view:'activities'})}/>
          <SidebarItem icon="users" label="Members" active={view==='members'} onClick={()=>onAction({type:'go', view:'members'})}/>
        </div>

        <div className="sb-section"><span className="sb-section-t">Manage</span></div>
        <div className="sb-group">
          <SidebarItem icon="settings" label="Customize" active={view==='settings'} onClick={()=>onAction({type:'go', view:'settings'})}/>
        </div>
      </div>
      <div className="sb-foot">
        <button className="golive" onClick={()=>onAction({type:'toast', msg:'Starting your live room…', icon:'video'})}><span className="rec"/> Go live</button>
      </div>
    </aside>
  );
}

/* ---------- Right rail ---------- */
function RightRail({ state, onAction }) {
  const next = state.events.find(e=>e.status!=='past');
  return (
    <aside className="rail">
      {next && (
        <div className="rail-card">
          <div className="rail-h"><h3>Next live event</h3><button className="rail-link" onClick={()=>onAction({type:'go', view:'events'})}>All</button></div>
          <div onClick={()=>onAction({type:'openEvent', id:next.id})} style={{ cursor:'pointer' }}>
            <div style={{ height:150, borderRadius:13, background:next.cover, marginBottom:12, display:'grid', placeItems:'center', position:'relative', overflow:'hidden' }}>
              <div className="event-thumb" style={{ width:132, height:86, background:'rgba(0,0,0,.14)', boxShadow:'var(--shadow-md)' }}>
                <div className="tag" style={{ padding:'7px 14px' }}><div className="t1" style={{ fontSize:13 }}>{next.tagLine}</div><div className="t2" style={{ fontSize:12 }}>{next.tagWord}</div></div>
              </div>
            </div>
            <div style={{ fontWeight:600, fontSize:15, lineHeight:1.35, letterSpacing:'-0.015em' }}>{next.title}</div>
            <div className="event-line" style={{ fontSize:13 }}><Icon name="calendar" size={14}/> {next.date}, {next.time}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:9, marginTop:12 }}>
            <AvStack names={next.rsvps} size={26} max={4}/>
            <span style={{ fontSize:13, color:'var(--muted)', fontWeight:500 }}>{next.rsvps.length} going</span>
          </div>
        </div>
      )}

      <div className="rail-card">
        <div className="rail-h"><h3>Members</h3><button className="rail-link" onClick={()=>onAction({type:'go', view:'members'})}>{window.COURSE.members}</button></div>
        {window.MEMBERS.slice(1,7).map(m => (
          <div className="rail-member" key={m.id}>
            <Avatar name={m.name} size={36}/>
            <div style={{ flex:1, minWidth:0 }}><div className="nm">{m.name}</div><div className="rl" style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.role}</div></div>
            {m.tags.includes('Moderator') && <Badge kind="Moderator">Mod</Badge>}
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ---------- Page header (sticky, below topbar) ---------- */
function PageHead({ view, state, onAction }) {
  const meta = {
    feed:       { emoji:'💬', title: state.feedName },
    events:     { emoji:'📅', title:'Events' },
    eventDetail:{ emoji:'📅', title:'Events' },
    activities: { emoji:'🎯', title:'Activities' },
    activityDetail:{ emoji:'🎯', title:'Activities' },
    members:    { emoji:'👥', title:'Members' },
    settings:   { emoji:'⚙️', title:'Customize' },
  }[view] || { emoji:'💬', title:'Feed' };
  return (
    <div className="page-head">
      <div className="ph-title"><span className="ph-emoji">{meta.emoji}</span>{meta.title}</div>
      <div className="ph-spacer"/>
      {view==='feed' && <>
        <AvStack names={window.MEMBERS.slice(1).map(m=>m.name)} size={30} max={3} extra={window.COURSE.members}/>
        <button className="btn btn-primary" onClick={()=>onAction({type:'openCompose'})}><Icon name="plus" size={16}/> New post</button>
        <button className="icon-btn" onClick={()=>onAction({type:'go', view:'settings'})}><Icon name="dotsV" size={19}/></button>
      </>}
    </div>
  );
}

/* ---------- Root App ---------- */
function App() {
  const toast = window.useToast();
  const [view, setView] = uS('feed');
  const [selectedId, setSelectedId] = uS(null);
  const [posts, setPosts] = uS(window.INITIAL_POSTS);
  const [scheduledPosts, setScheduledPosts] = uS(window.INITIAL_SCHEDULED);
  const [events, setEvents] = uS(window.INITIAL_EVENTS);
  const [activities, setActivities] = uS(window.INITIAL_ACTIVITIES);
  const [reactionsEnabled, setReactionsEnabled] = uS(true);
  const [communityOn, setCommunityOn] = uS(true);
  const [coverOn, setCoverOn] = uS(true);
  const [feedName, setFeedName] = uS('Persuasive Writing Community');
  const [settings, setSettings] = uS({ coverImage:null, coverGradient:'linear-gradient(120deg,#2E5E48,#4E8A66 55%,#87B79A)', coverLabel:'COMMUNITY', commentsDefault:true, autoPost:false });
  const [compose, setCompose] = uS(null);       // {initial, preset} | null
  const [eventModal, setEventModal] = uS(false);
  const [activityModal, setActivityModal] = uS(false);

  const updatePost = (id, fn) => setPosts(ps => ps.map(p => p.id===id ? fn(p) : p));
  const me = 'Mara Linwood';

  const toggleReact = (obj, key, who=me) => {
    const list = obj[key] ? [...obj[key]] : [];
    const i = list.indexOf(who);
    if (i>=0) list.splice(i,1); else list.push(who);
    return { ...obj, [key]: list };
  };

  const onAction = (a) => {
    switch (a.type) {
      case 'go': setView(a.view); setSelectedId(a.id||null); window.scrollTo({top:0}); break;
      case 'toast': toast(a.msg, a.icon||'check'); break;

      case 'openCompose': setCompose({ preset:a.preset }); break;
      case 'editPost': setCompose({ initial:a.post }); break;
      case 'openEvent': setView('eventDetail'); setSelectedId(a.id); window.scrollTo({top:0}); break;
      case 'openEventModal': setEventModal(true); break;
      case 'openActivity': setView('activityDetail'); setSelectedId(a.id); window.scrollTo({top:0}); break;
      case 'openActivityModal': setActivityModal(true); break;
      case 'openSettings': setView('settings'); break;

      case 'reactPost': updatePost(a.postId, p => {
        const reactions = {};
        for (const k of Object.keys(p.reactions||{})) reactions[k] = (p.reactions[k]||[]).filter(n => n !== me);
        const prev = p.myReaction || (p.myReactions && p.myReactions[0]) || null;
        let myReaction = null;
        if (prev !== a.key) { myReaction = a.key; reactions[a.key] = [...(reactions[a.key]||[]), me]; }
        return { ...p, reactions, myReaction, myReactions: myReaction ? [myReaction] : [] };
      }); break;
      case 'togglePin': updatePost(a.postId, p => ({ ...p, pinned: !p.pinned })); toast(posts.find(p=>p.id===a.postId)?.pinned ? 'Post unpinned' : 'Pinned to top','pin'); break;
      case 'commentMode': updatePost(a.postId, p => ({ ...p, commentMode: a.mode })); toast(`Comments ${a.mode==='open'?'on':a.mode}`); break;
      case 'hidePost': updatePost(a.postId, p => ({ ...p })); toast('Post hidden from students','eyeOff'); break;
      case 'deletePost': setPosts(ps => ps.filter(p=>p.id!==a.postId)); toast('Post deleted','trash'); break;

      case 'comment': updatePost(a.postId, p => ({ ...p, comments: [...(p.comments||[]), { id:'c'+Date.now(), author:me, role:'Instructor', isInstructor:true, time:'now', text:a.text, reactions:{}, replies:[] }] })); toast('Reply posted'); break;
      case 'reply': updatePost(a.postId, p => ({ ...p, comments: p.comments.map(c => c.id===a.parentId ? { ...c, replies:[...(c.replies||[]), { id:'r'+Date.now(), author:me, role:'Instructor', isInstructor:true, time:'now', text:a.text, reactions:{}, replies:[] }] } : c) })); toast('Reply posted'); break;
      case 'reactComment': updatePost(a.postId, p => ({ ...p, comments: p.comments.map(c => c.id===a.commentId ? { ...c, reactions: toggleReact(c.reactions||{}, a.key) } : { ...c, replies: c.replies?.map(r => r.id===a.commentId ? { ...r, reactions: toggleReact(r.reactions||{}, a.key) } : r) }) })); break;
      case 'deleteComment': updatePost(a.postId, p => ({ ...p, comments: p.comments.filter(c=>c.id!==a.commentId).map(c=>({ ...c, replies: c.replies?.filter(r=>r.id!==a.commentId) })) })); toast('Comment deleted','trash'); break;
      case 'hideComment': toast('Comment hidden','eyeOff'); break;

      case 'publishNow': { const p = scheduledPosts.find(x=>x.id===a.postId); if(p){ setScheduledPosts(s=>s.filter(x=>x.id!==a.postId)); setPosts(ps=>[{ ...p, time:'now', scheduledFor:null, badges:['Admin','Team'], myReactions:[], myReaction:null }, ...ps]); } toast('Published','bolt'); break; }
      case 'deleteScheduled': setScheduledPosts(s=>s.filter(x=>x.id!==a.postId)); toast('Scheduled post cancelled','trash'); break;

      case 'updateEvent': setEvents(es => es.map(e => e.id===a.id ? { ...e, ...a.patch } : e)); break;
      case 'goLiveEvent': toast('Live room opened — "We\'re live" email sent','video'); break;
      case 'sendAnnouncement': toast(`Announcement sent to ${a.count} ${a.count===1?'person':'people'}`,'mail'); break;

      case 'reviewSubmission': setActivities(as => as.map(act => act.id===a.actId ? { ...act, submissions: act.submissions.map(s => s.id===a.subId ? { ...s, status:'reviewed', feedback:{ text:a.text, time:'now' } } : s) } : act)); toast('Feedback sent'); break;

      case 'toggleReactions': setReactionsEnabled(a.v); toast(a.v?'Reactions on':'Reactions off'); break;
      case 'toggleCommunity': setCommunityOn(a.v); toast(a.v?'Community is live':'Community turned off'); break;
      case 'toggleCover': setCoverOn(c=>!c); break;
      case 'setCover': setSettings(s => ({ ...s, coverImage:a.dataUrl })); toast('Cover photo updated','image'); break;
      case 'clearCover': setSettings(s => ({ ...s, coverImage:null })); toast('Cover removed'); break;
      case 'patchSettings': setSettings(s => ({ ...s, ...a.patch })); break;
      case 'rename': setFeedName(a.name); toast('Community renamed'); break;
      default: break;
    }
  };

  // publish from compose modal
  const publish = (data) => {
    if (data.id) { // editing
      const upd = (p) => ({ ...p, body:data.body, image:data.image, module:data.module, pinned:data.pinned, commentMode:data.commentMode, scheduledFor:data.schedule?data.scheduledFor:null });
      if (scheduledPosts.find(p=>p.id===data.id)) setScheduledPosts(s=>s.map(p=>p.id===data.id?upd(p):p));
      else setPosts(ps=>ps.map(p=>p.id===data.id?upd(p):p));
      toast('Post updated');
    } else {
      const np = { id:'p'+Date.now(), author:me, role:'Instructor', badges:['Admin','Team'], time:'now', body:data.body, image:data.image, module:data.module, pinned:data.pinned, commentMode:data.commentMode, reactions:{}, myReactions:[], myReaction:null, comments:[], scheduledFor:data.scheduledFor };
      if (data.schedule) { setScheduledPosts(s=>[np, ...s]); toast('Post scheduled','clock'); }
      else { setPosts(ps=>[np, ...ps]); toast('Published','send'); }
    }
    setCompose(null);
  };

  const state = { posts, scheduledPosts, events, activities, reactionsEnabled, communityOn, coverOn, feedName, settings };
  const selectedEvent = events.find(e=>e.id===selectedId);
  const selectedActivity = activities.find(a=>a.id===selectedId);
  const showRail = view==='feed';

  return (
    <div className="app">
      <TopNav view={view} onAction={onAction} state={state}/>
      <div className={`layout ${showRail?'':'no-rail'}`}>
        <Sidebar view={view} selectedId={selectedId} onAction={onAction} state={state}/>
        <main className="main">
          <PageHead view={view} state={state} onAction={onAction}/>
          {!communityOn && view==='feed' && (
            <div style={{ margin:'16px 28px 0', padding:'12px 16px', background:'var(--amber-bg)', color:'var(--amber)', borderRadius:11, display:'flex', alignItems:'center', gap:10, fontWeight:600, fontSize:14 }}>
              <Icon name="eyeOff" size={18}/> The community is currently off — students can't see this. <button className="rail-link" style={{ marginLeft:'auto', color:'var(--amber)' }} onClick={()=>onAction({type:'toggleCommunity', v:true})}>Turn on</button>
            </div>
          )}
          {view==='feed' && <FeedView state={state} onAction={onAction}/>}
          {view==='events' && <EventsView state={state} onAction={onAction}/>}
          {view==='eventDetail' && selectedEvent && <EventDetail ev={selectedEvent} onAction={onAction}/>}
          {view==='activities' && <ActivitiesView state={state} onAction={onAction}/>}
          {view==='activityDetail' && selectedActivity && <ActivityDetail act={selectedActivity} onAction={onAction}/>}
          {view==='members' && <MembersView onAction={onAction}/>}
          {view==='settings' && <SettingsView state={state} onAction={onAction}/>}
        </main>
        {showRail && <RightRail state={state} onAction={onAction}/>}
      </div>

      {compose && <ComposeModal initial={compose.initial} preset={compose.preset} onClose={()=>setCompose(null)} onPublish={publish}/>}
      {eventModal && <EventModal onClose={()=>setEventModal(false)} onCreate={(e)=>{ setEvents(es=>[{ ...e, id:'e'+Date.now() }, ...es]); setEventModal(false); toast('Event scheduled','calendar'); }}/>}
      {activityModal && <ActivityModal onClose={()=>setActivityModal(false)} onCreate={(a)=>{ setActivities(as=>[{ ...a, id:'a'+Date.now() }, ...as]); setActivityModal(false); toast('Activity posted','trophy'); }}/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  React.createElement(window.ToastProvider, null, React.createElement(App))
);
