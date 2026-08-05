/* ============================================================
   SPAIRE — Customize / Settings (instructor controls)
   ============================================================ */
function SettingsView({ state, onAction }) {
  const s = state.settings;
  const [feedName, setFeedName] = React.useState(state.feedName);
  const [modules, setModules] = React.useState(window.MODULES.map(m=>({...m})));
  const [dragId, setDragId] = React.useState(null);
  const set = (patch) => onAction({type:'patchSettings', patch});

  const covers = [
    'linear-gradient(120deg,#2E5E48,#4E8A66 55%,#87B79A)',
    'linear-gradient(120deg,#243B53,#4A6B8A)',
    'linear-gradient(120deg,#6B4E7A,#A07FB5)',
    'linear-gradient(120deg,#6E5A3E,#B89A5A)',
    'linear-gradient(120deg,#1B1C1B,#43474B)',
  ];

  const onDrop = (id) => {
    if (!dragId || dragId===id) return;
    const arr=[...modules]; const from=arr.findIndex(m=>m.id===dragId); const to=arr.findIndex(m=>m.id===id);
    const [moved]=arr.splice(from,1); arr.splice(to,0,moved);
    setModules(arr.map((m,i)=>({...m,n:i+1}))); setDragId(null);
    onAction({type:'toast', msg:'Module order saved'});
  };

  return (
    <div className="content" style={{ paddingTop:24, maxWidth:760, margin:'0 auto' }}>
      <h1 style={{ fontSize:24, fontWeight:650, margin:'0 0 4px' }}>Customize community</h1>
      <p style={{ color:'var(--muted)', margin:'0 0 24px' }}>Make the space feel like yours. Changes are live for students.</p>

      {/* identity */}
      <div className="card card-pad" style={{ marginBottom:18 }}>
        <div style={{ fontWeight:650, fontSize:16, marginBottom:14 }}>Identity</div>
        <div className="field"><label>Community name</label>
          <input className="input" value={feedName} onChange={e=>setFeedName(e.target.value)} onBlur={()=>onAction({type:'rename', name:feedName})}/>
          <div className="hint">Shown at the top of the feed and in emails.</div>
        </div>
        <div className="field" style={{ marginBottom:0 }}><label>Banner</label>
          <div style={{ height:120, borderRadius:12, position:'relative', display:'grid', placeItems:'center', overflow:'hidden', ...(s.coverImage ? { backgroundImage:`linear-gradient(180deg, rgba(14,20,17,.10), rgba(14,20,17,.30)), url(${s.coverImage})`, backgroundSize:'cover', backgroundPosition:'center' } : { background: s.coverGradient||covers[0] }) }}>
            <div style={{ color:'rgba(255,255,255,.9)', fontSize:11, fontWeight:600, letterSpacing:'.2em' }}>{(s.coverLabel||'COMMUNITY')}</div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:10, alignItems:'center', flexWrap:'wrap' }}>
            {covers.map((c,i)=><button key={i} onClick={()=>set({coverGradient:c, coverImage:null})} style={{ width:46, height:30, borderRadius:8, background:c, border: (!s.coverImage && s.coverGradient===c)?'2px solid var(--brand)':'2px solid transparent', cursor:'pointer', boxShadow:'var(--shadow-sm)' }}/>)}
            <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'toast', msg:'Banner image updated', icon:'image'})}><Icon name="image" size={15}/> Upload image</button>
          </div>
        </div>
      </div>

      {/* modules reorder */}
      <div className="card card-pad" style={{ marginBottom:18 }}>
        <div style={{ fontWeight:650, fontSize:16, marginBottom:4 }}>Modules</div>
        <div style={{ color:'var(--muted)', fontSize:13.5, marginBottom:12 }}>Drag to reorder. Rename inline. Posts tie to these.</div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {modules.map(m => (
            <div key={m.id} draggable onDragStart={()=>setDragId(m.id)} onDragOver={e=>e.preventDefault()} onDrop={()=>onDrop(m.id)}
              style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 12px', border:'1px solid var(--line)', borderRadius:11, background: dragId===m.id?'var(--brand-50)':'var(--surface)', cursor:'grab' }}>
              <Icon name="drag" size={18} color="var(--faint)"/>
              <span style={{ width:26, height:26, borderRadius:7, background:'var(--brand-50)', color:'var(--brand-700)', display:'grid', placeItems:'center', fontWeight:650, fontSize:13, flexShrink:0 }}>{m.n}</span>
              <input defaultValue={m.title} onBlur={e=>{ setModules(ms=>ms.map(x=>x.id===m.id?{...x,title:e.target.value}:x)); }} style={{ flex:1, border:'none', background:'transparent', fontSize:14.5, fontWeight:600, fontFamily:'inherit', outline:'none', color:'var(--ink)' }}/>
              <span style={{ fontSize:13, color:'var(--muted)' }}>{m.lessons} lessons</span>
            </div>
          ))}
        </div>
      </div>

      {/* engagement toggles */}
      <div className="card card-pad" style={{ marginBottom:18 }}>
        <div style={{ fontWeight:650, fontSize:16, marginBottom:6 }}>Engagement</div>
        <div className="row-toggle"><div className="rt-text"><div className="t">Reactions</div><div className="d">Let people react with 👍 👏 ❤️ 🔥 💡 🙏. Off hides them everywhere.</div></div><Toggle on={state.reactionsEnabled} onChange={v=>onAction({type:'toggleReactions', v})}/></div>
        <div className="row-toggle"><div className="rt-text"><div className="t">Comments on new posts</div><div className="d">Default comment setting when you write a post.</div></div><Toggle on={s.commentsDefault} onChange={v=>set({commentsDefault:v})}/></div>
        <div className="row-toggle"><div className="rt-text"><div className="t">Auto-post milestones</div><div className="d">Celebrate when a student finishes a module in the feed.</div></div><Toggle on={s.autoPost} onChange={v=>set({autoPost:v})}/></div>
      </div>

      {/* danger / on-off */}
      <div className="card card-pad" style={{ border:'1px solid #F0D9D2' }}>
        <div style={{ fontWeight:650, fontSize:16, marginBottom:6 }}>Community status</div>
        <div className="row-toggle" style={{ borderBottom:'none' }}>
          <div className="rt-text"><div className="t">{state.communityOn?'Community is on':'Community is off'}</div><div className="d">{state.communityOn?'Students can see and post in the community.':'Hidden from students. Course videos still work.'}</div></div>
          <Toggle on={state.communityOn} onChange={v=>onAction({type:'toggleCommunity', v})}/>
        </div>
      </div>
    </div>
  );
}
Object.assign(window, { SettingsView });
