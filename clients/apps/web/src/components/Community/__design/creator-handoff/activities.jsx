/* ============================================================
   SPAIRE — Activities: list · detail · submission review/feedback
   ============================================================ */

const ACT_ICON = { text:'edit', photo:'image', video:'video', link:'link' };
const ACT_MEDIA_BG = { text:'linear-gradient(120deg,#3E5C7A,#6E92B2)', photo:'linear-gradient(120deg,#2E5E48,#5C9170)', video:'linear-gradient(120deg,#5A3E6E,#8A6AA8)', link:'linear-gradient(120deg,#6E5A3E,#A8895A)' };

function ActivitiesView({ state, onAction }) {
  const [tab, setTab] = React.useState('open');
  const acts = state.activities.filter(a => tab==='open' ? a.status==='open' : a.status==='closed');
  return (
    <div className="content" style={{ paddingTop:20, maxWidth:920, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:6 }}>
        <div className="tabs" style={{ border:'none', flex:1 }}>
          <button className={`tab ${tab==='open'?'active':''}`} onClick={()=>setTab('open')}>Active</button>
          <button className={`tab ${tab==='closed'?'active':''}`} onClick={()=>setTab('closed')}>Closed</button>
        </div>
        <button className="btn btn-primary" onClick={()=>onAction({type:'openActivityModal'})}><Icon name="plus" size={16}/> New activity</button>
      </div>

      <div style={{ display:'grid', gap:14 }}>
        {acts.length===0 ? <div className="card empty"><div className="e-emoji">🎯</div>No {tab} activities.</div> :
        acts.map(a => {
          const reviewed = a.submissions.filter(s=>s.status==='reviewed').length;
          const needs = a.submissions.filter(s=>s.status==='new').length;
          return (
            <div className="card" key={a.id} style={{ overflow:'hidden', cursor:'pointer' }} onClick={()=>onAction({type:'openActivity', id:a.id})}>
              <div style={{ display:'flex' }}>
                <div style={{ width:8, background:ACT_MEDIA_BG[a.type] }}/>
                <div className="card-pad" style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', gap:8, marginBottom:8, flexWrap:'wrap' }}>
                        <span className="chip"><Icon name={ACT_ICON[a.type]} size={13}/> {a.type} submission</span>
                        {a.module && <span className="chip chip-module"><Icon name="book" size={13}/> {window.moduleName(a.module)}</span>}
                        <span className={`chip ${a.visibility==='private'?'chip-draft':''}`}><Icon name={a.visibility==='private'?'lock':'globe'} size={13}/> {a.visibility==='private'?'Private to you':'Shared with group'}</span>
                      </div>
                      <div style={{ fontWeight:650, fontSize:18, letterSpacing:'-.01em' }}>{a.title}</div>
                      <div style={{ color:'var(--ink-2)', fontSize:14.5, marginTop:6, lineHeight:1.5 }}>{a.prompt}</div>
                    </div>
                    <Icon name="caretRight" size={18} color="var(--muted-2)"/>
                  </div>
                  <div className="divider" style={{ margin:'14px 0' }}/>
                  <div style={{ display:'flex', alignItems:'center', gap:20, fontSize:13.5 }}>
                    <span style={{ color:'var(--muted)' }}><strong style={{ color:'var(--ink)', fontSize:15 }}>{a.participants}</strong> participated</span>
                    <span style={{ color:'var(--muted)' }}><strong style={{ color:'var(--ink)', fontSize:15 }}>{a.submissions.length}</strong> to review</span>
                    {needs>0 && <span className="chip" style={{ background:'var(--amber-bg)', color:'var(--amber)' }}>{needs} need feedback</span>}
                    {reviewed>0 && <span className="chip" style={{ background:'var(--brand-50)', color:'var(--brand-700)' }}><Icon name="check" size={12} stroke={2.4}/> {reviewed} reviewed</span>}
                    <div style={{ flex:1 }}/>
                    <span style={{ color:'var(--muted)', fontWeight:600 }}>{a.dueLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----- Activity detail with submission review ----- */
function ActivityDetail({ act, onAction }) {
  const [filter, setFilter] = React.useState('all');
  const [active, setActive] = React.useState(null); // submission being reviewed
  const subs = act.submissions.filter(s => filter==='all' ? true : filter==='new' ? s.status==='new' : s.status==='reviewed');
  const pct = Math.round(act.participants / window.COURSE.members * 100);

  return (
    <div className="content" style={{ paddingTop:20, maxWidth:980, margin:'0 auto' }}>
      <button className="btn btn-subtle btn-sm" onClick={()=>onAction({type:'go', view:'activities'})} style={{ marginBottom:16 }}><Icon name="arrowLeft" size={15}/> All activities</button>

      <div className="card card-pad">
        <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
          <span className="chip"><Icon name={ACT_ICON[act.type]} size={13}/> {act.type} submission</span>
          {act.module && <span className="chip chip-module"><Icon name="book" size={13}/> {window.moduleFull(act.module)}</span>}
          <span className={`chip ${act.visibility==='private'?'chip-draft':''}`}><Icon name={act.visibility==='private'?'lock':'globe'} size={13}/> {act.visibility==='private'?'Private to you & student':'Shared with group'}</span>
        </div>
        <h1 style={{ fontSize:24, fontWeight:650, margin:'0 0 8px' }}>{act.title}</h1>
        <p style={{ color:'var(--ink-2)', fontSize:15.5, lineHeight:1.6, margin:0 }}>{act.prompt}</p>
        <div className="divider" style={{ margin:'16px 0' }}/>
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}><span style={{ fontSize:22, fontWeight:650 }}>{act.participants}</span><span style={{ color:'var(--muted)', fontSize:13.5 }}>of {window.COURSE.members} students participated ({pct}%)</span></div>
            <div style={{ height:7, background:'var(--surface-2)', borderRadius:999, marginTop:8, overflow:'hidden', maxWidth:360 }}><div style={{ width:`${pct}%`, height:'100%', background:'var(--brand)' }}/></div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'toast', msg:'Reminder sent to non-participants', icon:'bell'})}><Icon name="bell" size={15}/> Nudge non-participants</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'toast', msg: act.status==='open'?'Activity closed':'Activity reopened'})}>{act.status==='open'?'Close activity':'Reopen'}</button>
        </div>
      </div>

      {/* submissions */}
      <div style={{ display:'flex', alignItems:'center', gap:12, margin:'22px 0 12px' }}>
        <h2 style={{ fontSize:17, fontWeight:650, margin:0, flex:1 }}>Submissions · {act.submissions.length}</h2>
        <div className="segmented">
          {[['all','All'],['new','Needs feedback'],['reviewed','Reviewed']].map(([v,l])=><button key={v} className={filter===v?'active':''} onClick={()=>setFilter(v)}>{l}</button>)}
        </div>
      </div>

      {subs.length===0 ? <div className="card empty"><div className="e-emoji">📭</div>Nothing here yet.</div> : (
        <div className="sub-grid">
          {subs.map(s => (
            <div className="sub-card" key={s.id} onClick={()=>setActive(s)}>
              <div className="sub-media" style={{ background:ACT_MEDIA_BG[act.type] }}>
                {s.kind==='video' && <div style={{ width:48, height:48, borderRadius:999, background:'rgba(255,255,255,.92)', display:'grid', placeItems:'center' }}><Icon name="video" size={20} color="var(--ink)"/></div>}
                {s.kind==='text' && <div style={{ padding:'14px 16px', fontSize:13, color:'#fff', fontWeight:500, lineHeight:1.45, display:'-webkit-box', WebkitLineClamp:4, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{s.content}</div>}
                {s.kind==='link' && <div style={{ color:'#fff', textAlign:'center' }}><Icon name="link" size={22}/><div style={{ fontSize:12, marginTop:6, fontWeight:600 }}>{s.content.replace('https://','')}</div></div>}
                {s.kind==='photo' && <Icon name="image" size={28} color="#fff"/>}
                {s.visibility==='private' && <span className="chip" style={{ position:'absolute', top:10, left:10, background:'rgba(0,0,0,.4)', color:'#fff' }}><Icon name="lock" size={12}/> Private</span>}
                {s.status==='reviewed' && <span className="chip" style={{ position:'absolute', top:10, right:10, background:'var(--brand)', color:'#fff' }}><Icon name="check" size={12} stroke={2.4}/></span>}
              </div>
              <div style={{ padding:'11px 13px', display:'flex', alignItems:'center', gap:9 }}>
                <Avatar name={s.author} size={28}/>
                <div style={{ flex:1, minWidth:0 }}><div style={{ fontWeight:700, fontSize:13.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{s.author}</div><div style={{ fontSize:12, color:'var(--muted)' }}>{s.time} ago</div></div>
                {s.status==='new' ? <span style={{ width:8, height:8, borderRadius:999, background:'var(--amber)' }}/> : <Icon name="checkCircle" size={16} color="var(--brand)"/>}
              </div>
            </div>
          ))}
        </div>
      )}

      {active && <ReviewModal act={act} sub={active} onClose={()=>setActive(null)} onAction={onAction}/>}
    </div>
  );
}

/* ----- review a single submission + leave feedback ----- */
function ReviewModal({ act, sub, onClose, onAction }) {
  const [fb, setFb] = React.useState(sub.feedback?.text || '');
  const save = () => { onAction({type:'reviewSubmission', actId:act.id, subId:sub.id, text:fb}); onClose(); };
  return (
    <Modal title="Review submission" onClose={onClose} wide
      headRight={<span className={`chip ${sub.visibility==='private'?'chip-draft':''}`} style={{ marginRight:6 }}><Icon name={sub.visibility==='private'?'lock':'globe'} size={13}/> {sub.visibility==='private'?'Private':'Group-visible'}</span>}
      footer={<><div style={{flex:1}}/><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!fb.trim()} onClick={save}><Icon name="send" size={15}/> {sub.feedback?'Update feedback':'Send feedback'}</button></>}>
      <div className="modal-body">
        <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:16 }}>
          <Avatar name={sub.author} size={42}/>
          <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:15 }}>{sub.author}</div><div style={{ fontSize:13, color:'var(--muted)' }}>Submitted {sub.time} ago to "{act.title}"</div></div>
          <button className="btn btn-subtle btn-sm" onClick={()=>onAction({type:'toast', msg:`Opening message to ${sub.author}`})}><Icon name="mail" size={14}/> Message</button>
        </div>

        {/* the submission */}
        <div style={{ background:'var(--surface-2)', borderRadius:13, padding:18, marginBottom:18 }}>
          {sub.kind==='text' && <div style={{ fontSize:15.5, lineHeight:1.65, color:'var(--ink)' }}>{sub.content}</div>}
          {sub.kind==='link' && <a href={sub.content} onClick={e=>e.preventDefault()} style={{ color:'var(--brand)', fontWeight:600, fontSize:15 }}><Icon name="link" size={16} style={{verticalAlign:'-3px', marginRight:6}}/>{sub.content}</a>}
          {sub.kind==='video' && <div style={{ height:200, borderRadius:10, background:'linear-gradient(120deg,#3A2E53,#6A4A8A)', display:'grid', placeItems:'center' }}><div style={{ width:60, height:60, borderRadius:999, background:'rgba(255,255,255,.92)', display:'grid', placeItems:'center' }}><Icon name="video" size={26} color="var(--ink)"/></div></div>}
          {sub.kind==='photo' && <div style={{ height:200, borderRadius:10, background:'linear-gradient(120deg,#2E5E48,#5C9170)', display:'grid', placeItems:'center', color:'#fff' }}><Icon name="image" size={30}/></div>}
        </div>

        {sub.feedback && <div style={{ display:'flex', gap:11, marginBottom:16 }}>
          <Avatar name="Mara Linwood" size={34}/>
          <div className="comment-bubble" style={{ background:'var(--brand-50)', boxShadow:'inset 0 0 0 1px var(--brand-200)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:7 }}><span className="comment-name">Mara Linwood</span><Badge kind="Admin">Instructor</Badge><span style={{ fontSize:12, color:'var(--muted)' }}>{sub.feedback.time} ago</span></div>
            <div className="comment-text">{sub.feedback.text}</div>
          </div>
        </div>}

        <div className="field" style={{ marginBottom:0 }}>
          <label>{sub.feedback?'Edit your feedback':'Leave feedback as the instructor'}</label>
          <textarea className="textarea" autoFocus placeholder="Be specific — name the one change that would make the biggest difference…" value={fb} onChange={e=>setFb(e.target.value)} style={{ minHeight:110 }}/>
          <div className="hint">{sub.visibility==='private' ? 'Only this student will see your feedback.' : 'Visible to the whole group under this submission.'}</div>
        </div>
      </div>
    </Modal>
  );
}

/* ----- new activity modal ----- */
function ActivityModal({ onClose, onCreate }) {
  const [title, setTitle] = React.useState('');
  const [prompt, setPrompt] = React.useState('');
  const [type, setType] = React.useState('text');
  const [moduleId, setModuleId] = React.useState('');
  const [visibility, setVisibility] = React.useState('group');
  const types = [['text','Text','edit'],['photo','Photo','image'],['video','Video','video'],['link','Link','link']];
  const create = () => { if(!title.trim()) return; onCreate({ title:title.trim(), prompt:prompt||'Share your work below.', type, module:moduleId||null, visibility, status:'open', dueLabel:'Open · no deadline', participants:0, submissions:[] }); };
  return (
    <Modal title="New activity" onClose={onClose}
      footer={<><div style={{flex:1}}/><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!title.trim()} onClick={create}><Icon name="trophy" size={15}/> Post activity</button></>}>
      <div className="modal-body">
        <div className="field"><label>Activity title</label><input className="input input-lg" autoFocus placeholder="e.g. Rewrite your worst sentence" value={title} onChange={e=>setTitle(e.target.value)}/></div>
        <div className="field"><label>Prompt</label><textarea className="textarea" placeholder="What do you want students to submit? Be specific about the ask." value={prompt} onChange={e=>setPrompt(e.target.value)}/></div>
        <div className="field"><label>What do they submit?</label>
          <div style={{ display:'flex', gap:8 }}>{types.map(([v,l,ic])=><button key={v} className={`btn btn-sm ${type===v?'btn-primary':'btn-subtle'}`} style={{flex:1}} onClick={()=>setType(v)}><Icon name={ic} size={15}/> {l}</button>)}</div>
        </div>
        <div style={{ display:'flex', gap:12 }}>
          <div className="field" style={{ flex:1 }}><label>Tie to a module</label>
            <select className="select" value={moduleId} onChange={e=>setModuleId(e.target.value)}><option value="">None</option>{window.MODULES.map(m=><option key={m.id} value={m.id}>Module {m.n} · {m.title}</option>)}</select>
          </div>
          <div className="field" style={{ flex:1 }}><label>Submission visibility</label>
            <div className="segmented" style={{ display:'flex' }}>
              <button className={visibility==='group'?'active':''} style={{flex:1}} onClick={()=>setVisibility('group')}><Icon name="globe" size={14}/> Group</button>
              <button className={visibility==='private'?'active':''} style={{flex:1}} onClick={()=>setVisibility('private')}><Icon name="lock" size={14}/> Private</button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

Object.assign(window, { ActivitiesView, ActivityDetail, ReviewModal, ActivityModal });
