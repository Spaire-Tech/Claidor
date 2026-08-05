/* ============================================================
   SPAIRE — Compose / Edit post modal (instructor)
   ============================================================ */
function ComposeModal({ initial, preset, onClose, onPublish }) {
  const editing = !!initial;
  const [body, setBody] = React.useState(initial ? (initial.body||[]).join('\n\n') : '');
  const [media, setMedia] = React.useState(initial?.image ? (initial.image.kind==='video'?'video':'photo') : (preset==='photo'?'photo':preset==='video'?'video':null));
  const [moduleId, setModuleId] = React.useState(initial?.module || (preset==='module' ? 'm1' : ''));
  const [pinned, setPinned] = React.useState(initial?.pinned || false);
  const [commentMode, setCommentMode] = React.useState(initial?.commentMode || 'open');
  const [schedule, setSchedule] = React.useState(!!initial?.scheduledFor || preset==='schedule');
  const [schedDate, setSchedDate] = React.useState('2026-06-09');
  const [schedTime, setSchedTime] = React.useState('09:00');
  const taRef = React.useRef();

  React.useEffect(()=>{ taRef.current?.focus(); }, []);

  const fmtSched = () => {
    const d = new Date(`${schedDate}T${schedTime}`);
    if (isNaN(d)) return 'later';
    return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) + ' · ' +
           d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  };

  const submit = () => {
    if (!body.trim()) return;
    onPublish({
      body: body.split(/\n\n+/).map(s=>s.trim()).filter(Boolean),
      image: media ? (media==='video'
        ? { kind:'video', g:'linear-gradient(120deg,#3A2E53,#6A4A8A)', label:'VIDEO' }
        : { kind:'gradient', g:'linear-gradient(120deg,#2E5E48,#5C9170)', label:'PHOTO' }) : null,
      module: moduleId || null,
      pinned, commentMode,
      schedule, scheduledFor: schedule ? fmtSched() : null,
      id: initial?.id,
    });
  };

  return (
    <Modal title={editing ? 'Edit post' : 'New post'} onClose={onClose} wide
      footer={
        <>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            <button className={`btn btn-sm ${pinned?'btn-primary':'btn-subtle'}`} onClick={()=>setPinned(p=>!p)} title="Pin to top"><Icon name="pin" size={15}/> {pinned?'Pinned':'Pin'}</button>
            <button className={`btn btn-sm ${schedule?'btn-primary':'btn-subtle'}`} onClick={()=>setSchedule(s=>!s)} title="Schedule"><Icon name="clock" size={15}/> Schedule</button>
          </div>
          <div style={{ flex:1 }}/>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!body.trim()} onClick={submit}>
            {schedule ? <><Icon name="clock" size={15}/> Schedule post</> : editing ? 'Save changes' : <><Icon name="send" size={15}/> Publish</>}
          </button>
        </>
      }>
      <div className="modal-body" style={{ paddingTop:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:11, marginBottom:14 }}>
          <Avatar name="Mara Linwood" size={42}/>
          <div>
            <div style={{ fontWeight:700, display:'flex', alignItems:'center', gap:7 }}>Mara Linwood <Badge kind="Admin"/></div>
            <div style={{ fontSize:13, color:'var(--muted)' }}>Posting as the instructor</div>
          </div>
        </div>

        <textarea ref={taRef} className="textarea" style={{ minHeight:140, fontSize:16, border:'none', padding:'4px 2px', boxShadow:'none' }}
          placeholder="What do you want to share with your students?" value={body} onChange={e=>setBody(e.target.value)}/>

        {/* media preview */}
        {media && (
          <div style={{ marginTop:8, borderRadius:12, overflow:'hidden', height:150, background: media==='video'?'linear-gradient(120deg,#3A2E53,#6A4A8A)':'linear-gradient(120deg,#2E5E48,#5C9170)', display:'grid', placeItems:'center', position:'relative', border:'1px dashed rgba(255,255,255,.4)' }}>
            <div style={{ textAlign:'center', color:'#fff' }}>
              <Icon name={media==='video'?'video':'image'} size={26}/>
              <div style={{ fontSize:13, fontWeight:700, marginTop:6 }}>Drop a {media} or click to upload</div>
            </div>
            <button className="x-btn" style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.4)', color:'#fff' }} onClick={()=>setMedia(null)}><Icon name="x" size={16}/></button>
          </div>
        )}

        {/* tie to module */}
        {(moduleId || preset==='module') && (
          <div className="field" style={{ marginTop:16, marginBottom:0 }}>
            <label><Icon name="book" size={15} style={{verticalAlign:'-2px', marginRight:6}}/>About a lesson</label>
            <select className="select" value={moduleId} onChange={e=>setModuleId(e.target.value)}>
              <option value="">Not tied to a module</option>
              {window.MODULES.map(m => <option key={m.id} value={m.id}>Module {m.n} · {m.title}</option>)}
            </select>
            <div className="hint">Students see this post highlighted inside the lesson.</div>
          </div>
        )}

        {/* schedule controls */}
        {schedule && (
          <div className="card-pad card" style={{ marginTop:16, background:'var(--blue-bg)', border:'1px solid #CFE0FA' }}>
            <div style={{ fontWeight:700, fontSize:13.5, marginBottom:10, display:'flex', alignItems:'center', gap:7, color:'var(--blue)' }}><Icon name="clock" size={16}/> Schedule for later</div>
            <div style={{ display:'flex', gap:10 }}>
              <input type="date" className="input" value={schedDate} onChange={e=>setSchedDate(e.target.value)} style={{ flex:1, background:'#fff' }}/>
              <input type="time" className="input" value={schedTime} onChange={e=>setSchedTime(e.target.value)} style={{ width:130, background:'#fff' }}/>
            </div>
            <div className="hint" style={{ color:'var(--blue)' }}>Goes live {fmtSched()}.</div>
          </div>
        )}

        <div className="divider" style={{ margin:'18px 0 14px' }}/>

        {/* toolbar + comment mode */}
        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
          <button className={`btn btn-sm ${media==='photo'?'btn-ghost':'btn-subtle'}`} onClick={()=>setMedia('photo')}><Icon name="image" size={15} color="var(--brand)"/> Photo</button>
          <button className={`btn btn-sm ${media==='video'?'btn-ghost':'btn-subtle'}`} onClick={()=>setMedia('video')}><Icon name="video" size={15} color="var(--rose)"/> Video</button>
          {!moduleId && preset!=='module' && <button className="btn btn-sm btn-subtle" onClick={()=>setModuleId('m1')}><Icon name="book" size={15} color="var(--amber)"/> Tie to module</button>}
          <div style={{ flex:1, minWidth:12 }}/>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12.5, fontWeight:600, color:'var(--muted)' }}>Comments</span>
            <div className="segmented">
              {[['open','On'],['read-only','Read-only'],['off','Off']].map(([v,l])=>(
                <button key={v} className={commentMode===v?'active':''} onClick={()=>setCommentMode(v)}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
Object.assign(window, { ComposeModal });
