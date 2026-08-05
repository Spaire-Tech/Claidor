/* ============================================================
   SPAIRE — Events: list · detail/manage · RSVPs · reminders ·
   announcement email with live preview · schedule modal
   ============================================================ */

function EventThumb({ ev, w=116, h=76 }) {
  return (
    <div className="event-thumb" style={{ width:w, height:h, background:ev.cover }}>
      <div className="tag">
        <div className="t1">{ev.tagLine}</div>
        <div className="t2">{ev.tagWord}</div>
      </div>
    </div>
  );
}

/* ----- Events list ----- */
function EventsView({ state, onAction }) {
  const [tab, setTab] = React.useState('upcoming');
  const events = state.events.filter(e => tab==='upcoming' ? e.status!=='past' : e.status==='past');
  return (
    <div className="content" style={{ paddingTop:20, maxWidth:900, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:6 }}>
        <div className="tabs" style={{ border:'none', flex:1 }}>
          <button className={`tab ${tab==='upcoming'?'active':''}`} onClick={()=>setTab('upcoming')}>Upcoming</button>
          <button className={`tab ${tab==='past'?'active':''}`} onClick={()=>setTab('past')}>Past</button>
        </div>
        <button className="btn btn-primary" onClick={()=>onAction({type:'openEventModal'})}><Icon name="plus" size={16}/> New event</button>
      </div>

      <div className="card" style={{ padding:'6px 18px' }}>
        {events.length===0 ? <div className="empty"><div className="e-emoji">📅</div>No {tab} events yet.</div> :
        events.map(ev => (
          <div className="event-row" key={ev.id}>
            <EventThumb ev={ev}/>
            <div className="event-info">
              <div className="event-title">{ev.title}</div>
              <div className="event-line"><Icon name="calendar" size={15}/> {ev.date}, {ev.time}</div>
              <div className="event-line"><Icon name="video" size={15}/> Live room · <span style={{ color:'var(--ink-2)', fontWeight:600 }}>{ev.rsvps.length} going</span></div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <AvStack names={ev.rsvps} size={28} max={3}/>
              <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'openEvent', id:ev.id})}>Manage <Icon name="caretRight" size={14}/></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----- Event detail / manage ----- */
function EventDetail({ ev, onAction }) {
  const [tab, setTab] = React.useState('details');
  const [reminders, setReminders] = React.useState(ev.reminders);
  const setR = (k,v) => { const r={...reminders,[k]:v}; setReminders(r); onAction({type:'updateEvent', id:ev.id, patch:{reminders:r}}); };
  const copyLink = () => onAction({type:'toast', msg:'Event page link copied'});
  const pct = Math.round(ev.rsvps.length/ev.capacity*100);

  return (
    <div className="content" style={{ paddingTop:20, maxWidth:920, margin:'0 auto' }}>
      <button className="btn btn-subtle btn-sm" onClick={()=>onAction({type:'go', view:'events'})} style={{ marginBottom:16 }}><Icon name="arrowLeft" size={15}/> All events</button>

      {/* hero */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ height:170, background:ev.cover, position:'relative', display:'grid', placeItems:'center' }}>
          <div className="event-thumb" style={{ width:150, height:96, background:'rgba(0,0,0,.12)', boxShadow:'var(--shadow-md)' }}>
            <div className="tag"><div className="t1">{ev.tagLine}</div><div className="t2">{ev.tagWord}</div></div>
          </div>
          <span className="chip" style={{ position:'absolute', top:14, left:14, background:'rgba(255,255,255,.92)', fontWeight:700 }}>{ev.type}</span>
        </div>
        <div className="card-pad">
          <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
            <div style={{ flex:1 }}>
              <h1 style={{ fontSize:24, fontWeight:650, margin:'0 0 10px', letterSpacing:'-.01em' }}>{ev.title}</h1>
              <div className="event-line" style={{ fontSize:15 }}><Icon name="calendar" size={17}/> {ev.date}, {ev.time}</div>
              <div className="event-line" style={{ fontSize:15 }}><Icon name="video" size={17}/> <a href={ev.link} style={{ color:'var(--brand)', fontWeight:600 }} onClick={e=>e.preventDefault()}>{ev.link}</a></div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, alignItems:'flex-end' }}>
              <button className="btn btn-primary" onClick={()=>onAction({type:'goLiveEvent', ev})}><Icon name="video" size={16}/> Start live room</button>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'toast', msg:'Calendar file (.ics) downloaded', icon:'calendar'})}><Icon name="download" size={15}/> .ics</button>
                <button className="btn btn-ghost btn-sm" onClick={copyLink}><Icon name="link" size={15}/> Share page</button>
              </div>
            </div>
          </div>
          <p style={{ color:'var(--ink-2)', lineHeight:1.6, marginTop:14, marginBottom:0 }}>{ev.desc}</p>
        </div>
      </div>

      {/* tabs */}
      <div className="tabs" style={{ marginTop:20 }}>
        <button className={`tab ${tab==='details'?'active':''}`} onClick={()=>setTab('details')}>Reminders</button>
        <button className={`tab ${tab==='guests'?'active':''}`} onClick={()=>setTab('guests')}>Guest list · {ev.rsvps.length}</button>
        <button className={`tab ${tab==='email'?'active':''}`} onClick={()=>setTab('email')}>Announcement email</button>
      </div>

      {tab==='details' && (
        <div className="card card-pad" style={{ marginTop:16 }}>
          <div style={{ fontWeight:650, fontSize:16, marginBottom:4 }}>Automatic reminders</div>
          <div style={{ color:'var(--muted)', fontSize:13.5, marginBottom:6 }}>Spaire emails RSVPs automatically. Toggle any off.</div>
          <div className="row-toggle"><span style={{ color:'var(--brand)' }}><Icon name="checkCircle" size={20}/></span><div className="rt-text"><div className="t">RSVP confirmation</div><div className="d">Sent the moment someone RSVPs.</div></div><Toggle on={reminders.confirm} onChange={v=>setR('confirm',v)}/></div>
          <div className="row-toggle"><span style={{ color:'var(--muted)' }}><Icon name="clock" size={20}/></span><div className="rt-text"><div className="t">24 hours before</div><div className="d">"Happening tomorrow" nudge with the link.</div></div><Toggle on={reminders.day} onChange={v=>setR('day',v)}/></div>
          <div className="row-toggle"><span style={{ color:'var(--muted)' }}><Icon name="bell" size={20}/></span><div className="rt-text"><div className="t">15 minutes before</div><div className="d">"Starting soon — join now."</div></div><Toggle on={reminders.fifteen} onChange={v=>setR('fifteen',v)}/></div>
          <div className="row-toggle"><span style={{ color:'var(--rose)' }}><Icon name="video" size={20}/></span><div className="rt-text"><div className="t">We're live now</div><div className="d">Sent when you open the live room.</div></div><Toggle on={reminders.live} onChange={v=>setR('live',v)}/></div>
        </div>
      )}

      {tab==='guests' && (
        <div className="card" style={{ marginTop:16, overflow:'hidden' }}>
          <div style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:14, borderBottom:'1px solid var(--line)' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:650, fontSize:16 }}>{ev.rsvps.length} going <span style={{ color:'var(--muted)', fontWeight:500 }}>· {ev.capacity-ev.rsvps.length} spots left</span></div>
              <div style={{ height:7, background:'var(--surface-2)', borderRadius:999, marginTop:8, overflow:'hidden', width:240 }}><div style={{ width:`${pct}%`, height:'100%', background:'var(--brand)' }}/></div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'toast', msg:'Guest list (CSV) exported', icon:'download'})}><Icon name="download" size={15}/> Export CSV</button>
            <button className="btn btn-primary btn-sm" onClick={()=>{ onAction({type:'go', view:'eventDetail', id:ev.id}); setTab('email'); }}><Icon name="mail" size={15}/> Email guests</button>
          </div>
          <div style={{ padding:'6px 10px' }}>
            {ev.rsvps.map((name,i)=>{
              const mem = window.MEMBERS.find(m=>m.name===name) || { email:name.toLowerCase().replace(/ /g,'.')+'@email.com', role:'Member' };
              return (
                <div className="mrow" key={i}>
                  <Avatar name={name} size={40}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:14.5 }}>{name}</div>
                    <div style={{ fontSize:13, color:'var(--muted)' }}>{mem.email}</div>
                  </div>
                  <span className="chip" style={{ background:'var(--brand-50)', color:'var(--brand-700)' }}><Icon name="check" size={13} stroke={2.4}/> Going</span>
                  <button className="btn btn-subtle btn-sm" onClick={()=>onAction({type:'toast', msg:`Opening message to ${name}`})}><Icon name="mail" size={14}/></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==='email' && <AnnouncementComposer ev={ev} onAction={onAction}/>}
    </div>
  );
}

/* ----- Announcement email composer with live preview ----- */
function AnnouncementComposer({ ev, onAction }) {
  const [subject, setSubject] = React.useState(`You're invited: ${ev.title}`);
  const [intro, setIntro] = React.useState(`Hi {first name},\n\nI'm hosting "${ev.title}" on ${ev.date} at ${ev.time}. Come with your questions — we'll keep it hands-on.\n\nSee you there,\nMara`);
  const [audience, setAudience] = React.useState('rsvps');
  const recip = audience==='rsvps' ? ev.rsvps.length : audience==='all' ? window.COURSE.members : ev.rsvps.length;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:18, marginTop:16, alignItems:'start' }}>
      {/* editor */}
      <div className="card card-pad">
        <div style={{ fontWeight:650, fontSize:16, marginBottom:14 }}>Compose announcement</div>
        <div className="field">
          <label>Send to</label>
          <div className="segmented" style={{ display:'flex' }}>
            {[['rsvps',`RSVPs · ${ev.rsvps.length}`],['all',`Everyone · ${window.COURSE.members}`],['nonrsvp','Not yet RSVP\'d']].map(([v,l])=>(
              <button key={v} className={audience===v?'active':''} style={{ flex:1 }} onClick={()=>setAudience(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Subject</label>
          <input className="input" value={subject} onChange={e=>setSubject(e.target.value)}/>
        </div>
        <div className="field">
          <label>Message</label>
          <textarea className="textarea" style={{ minHeight:180 }} value={intro} onChange={e=>setIntro(e.target.value)}/>
          <div className="hint">Use <code>{'{first name}'}</code> to personalize. The event card below is added automatically.</div>
        </div>
        <div style={{ display:'flex', gap:10, marginTop:6 }}>
          <button className="btn btn-ghost" onClick={()=>onAction({type:'toast', msg:'Test email sent to you', icon:'mail'})}>Send test to myself</button>
          <div style={{ flex:1 }}/>
          <button className="btn btn-primary" onClick={()=>onAction({type:'sendAnnouncement', count:recip})}><Icon name="send" size={15}/> Send to {recip}</button>
        </div>
      </div>

      {/* live preview */}
      <div style={{ position:'sticky', top:'calc(var(--topbar-h) + 16px)' }}>
        <div style={{ fontSize:12, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--muted-2)', marginBottom:8, display:'flex', alignItems:'center', gap:7 }}><Icon name="eye" size={15}/> Live preview</div>
        <div className="card" style={{ overflow:'hidden', boxShadow:'var(--shadow-md)' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--line)', background:'var(--surface-2)' }}>
            <div style={{ fontSize:12.5, color:'var(--muted)' }}>From <strong style={{ color:'var(--ink)' }}>Mara Linwood</strong> · Persuasive Writing</div>
            <div style={{ fontSize:15, fontWeight:700, marginTop:3 }}>{subject||'(no subject)'}</div>
          </div>
          <div style={{ padding:'20px 22px' }}>
            <div style={{ width:38, height:38, borderRadius:8, background:'var(--brand)', display:'grid', placeItems:'center', marginBottom:14 }}><Icon name="rocket" size={20} color="#fff"/></div>
            <div style={{ whiteSpace:'pre-wrap', fontSize:14.5, lineHeight:1.6, color:'var(--ink-2)' }}>{intro.replace('{first name}','Nadya')}</div>
            {/* auto event card */}
            <div style={{ border:'1px solid var(--line-2)', borderRadius:12, overflow:'hidden', marginTop:18 }}>
              <div style={{ height:8, background:ev.cover }}/>
              <div style={{ padding:'14px 16px' }}>
                <div style={{ fontWeight:650, fontSize:15.5 }}>{ev.title}</div>
                <div className="event-line" style={{ marginTop:6 }}><Icon name="calendar" size={15}/> {ev.date}, {ev.time}</div>
                <button className="btn btn-primary btn-sm" style={{ marginTop:12, width:'100%' }}>RSVP &amp; add to calendar</button>
              </div>
            </div>
            <div style={{ fontSize:12, color:'var(--faint)', marginTop:16, textAlign:'center' }}>Sent with Spaire · Unsubscribe</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----- Schedule event modal ----- */
function EventModal({ onClose, onCreate }) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState('Workshop');
  const [date, setDate] = React.useState('2026-06-19');
  const [start, setStart] = React.useState('13:00');
  const [end, setEnd] = React.useState('14:00');
  const [link, setLink] = React.useState('https://meet.spaire.co/');
  const [desc, setDesc] = React.useState('');
  const types = ['Workshop','Office Hours','Cohort Session','Guest Session'];

  const create = () => {
    if (!title.trim()) return;
    const d = new Date(date+'T'+start);
    onCreate({
      title: title.trim(), type,
      date: d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}),
      time: `${new Date(date+'T'+start).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} – ${new Date(date+'T'+end).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} EDT`,
      cover:'linear-gradient(120deg,#2E5E48,#5C9170)', tagLine:type.split(' ')[0].toLowerCase(), tagWord:(type.split(' ')[1]||'LIVE').toUpperCase(),
      desc: desc||'Join us live.', link, rsvps:[], capacity:50, status:'upcoming',
      reminders:{ day:true, fifteen:true, live:true, confirm:true },
    });
  };

  return (
    <Modal title="Schedule a live event" onClose={onClose}
      footer={<><div style={{flex:1}}/><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!title.trim()} onClick={create}><Icon name="calendar" size={15}/> Create event</button></>}>
      <div className="modal-body">
        <div className="field"><label>Event title</label><input className="input input-lg" autoFocus placeholder="e.g. Live Q&A: Rewriting Your Hook" value={title} onChange={e=>setTitle(e.target.value)}/></div>
        <div className="field"><label>Type</label>
          <div className="segmented" style={{ display:'flex', flexWrap:'wrap' }}>{types.map(t=><button key={t} className={type===t?'active':''} style={{flex:'1 0 auto'}} onClick={()=>setType(t)}>{t}</button>)}</div>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <div className="field" style={{ flex:1 }}><label>Date</label><input type="date" className="input" value={date} onChange={e=>setDate(e.target.value)}/></div>
          <div className="field" style={{ width:120 }}><label>Start</label><input type="time" className="input" value={start} onChange={e=>setStart(e.target.value)}/></div>
          <div className="field" style={{ width:120 }}><label>End</label><input type="time" className="input" value={end} onChange={e=>setEnd(e.target.value)}/></div>
        </div>
        <div className="field"><label>Meeting link</label><input className="input" value={link} onChange={e=>setLink(e.target.value)}/></div>
        <div className="field" style={{ marginBottom:4 }}><label>Description</label><textarea className="textarea" placeholder="What will you cover? What should they bring?" value={desc} onChange={e=>setDesc(e.target.value)}/></div>
        <div className="card-pad" style={{ background:'var(--brand-50)', borderRadius:12, display:'flex', alignItems:'center', gap:10, fontSize:13.5, color:'var(--brand-700)' }}>
          <Icon name="bell" size={18}/> Automatic reminders (confirmation, 24h, 15min, live) are on by default.
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { EventsView, EventDetail, EventModal, AnnouncementComposer, EventThumb });
