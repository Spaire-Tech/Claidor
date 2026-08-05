/* ============================================================
   SPAIRE — Members roster (instructor view)
   ============================================================ */
function MembersView({ onAction }) {
  const [q, setQ] = React.useState('');
  const [role, setRole] = React.useState('all');
  const members = window.MEMBERS.filter(m =>
    (q==='' || m.name.toLowerCase().includes(q.toLowerCase()) || m.email.toLowerCase().includes(q.toLowerCase())) &&
    (role==='all' || (role==='staff' ? (m.tags.includes('Admin')||m.tags.includes('Moderator')) : !m.tags.length))
  );
  const stats = [
    { v: window.COURSE.members, l:'Total members' },
    { v: window.COURSE.online, l:'Online now' },
    { v: '64%', l:'Avg. progress' },
    { v: '41', l:'Joined this week' },
  ];
  return (
    <div className="content" style={{ paddingTop:20, maxWidth:960, margin:'0 auto' }}>
      <div className="stat-grid" style={{ marginBottom:18 }}>
        {stats.map((s,i)=><div className="stat" key={i}><div className="v">{s.v}</div><div className="l">{s.l}</div></div>)}
      </div>

      <div className="card">
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid var(--line)' }}>
          <div className="search" style={{ width:280, background:'var(--surface-2)' }}>
            <Icon name="search" size={16}/>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or email" style={{ border:'none', background:'transparent', outline:'none', flex:1, fontSize:14, fontFamily:'inherit', color:'var(--ink)' }}/>
          </div>
          <div className="segmented">
            {[['all','Everyone'],['staff','Staff'],['students','Students']].map(([v,l])=><button key={v} className={role===v?'active':''} onClick={()=>setRole(v)}>{l}</button>)}
          </div>
          <div style={{ flex:1 }}/>
          <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'toast', msg:'Roster (CSV) exported', icon:'download'})}><Icon name="download" size={15}/> Export</button>
          <button className="btn btn-primary btn-sm" onClick={()=>onAction({type:'toast', msg:'Invite link copied', icon:'link'})}><Icon name="plus" size={15}/> Invite</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 130px 110px 44px', padding:'10px 18px', borderBottom:'1px solid var(--line)', fontSize:11.5, fontWeight:700, letterSpacing:'.05em', textTransform:'uppercase', color:'var(--muted-2)' }}>
          <span>Member</span><span>Joined</span><span>Progress</span><span/>
        </div>

        {members.map(m => (
          <div key={m.id} style={{ display:'grid', gridTemplateColumns:'1fr 130px 110px 44px', alignItems:'center', padding:'12px 18px', borderBottom:'1px solid var(--line)' }} className="mrow-grid">
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <Avatar name={m.name} size={40} ring={m.you}/>
              <div style={{ minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <span style={{ fontWeight:700, fontSize:14.5 }}>{m.name}</span>
                  {m.tags.map(t=><Badge key={t} kind={t}/>)}
                  {m.you && <span className="chip badge-soft">You</span>}
                </div>
                <div style={{ fontSize:13, color:'var(--muted)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{m.email} · {m.role}</div>
              </div>
            </div>
            <span style={{ fontSize:13.5, color:'var(--muted)' }}>{m.joined}</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ flex:1, height:6, background:'var(--surface-2)', borderRadius:999, overflow:'hidden' }}><div style={{ width:`${m.progress}%`, height:'100%', background: m.progress>=80?'var(--brand)':m.progress>=40?'var(--amber)':'var(--faint)' }}/></div>
              <span style={{ fontSize:12.5, fontWeight:700, color:'var(--muted)', width:30 }}>{m.progress}%</span>
            </div>
            <MemberMenu m={m} onAction={onAction}/>
          </div>
        ))}
        {members.length===0 && <div className="empty">No members match "{q}".</div>}
      </div>
    </div>
  );
}
function MemberMenu({ m, onAction }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef();
  window.useClickOutside(ref, ()=>setOpen(false), open);
  return (
    <div style={{ position:'relative', justifySelf:'end' }} ref={ref}>
      <button className="icon-btn" onClick={()=>setOpen(o=>!o)}><Icon name="dots" size={18}/></button>
      <Menu open={open} onClose={()=>setOpen(false)}>
        <MenuItem icon="mail" onClick={()=>{ onAction({type:'toast', msg:`Opening message to ${m.name}`}); setOpen(false); }}>Message</MenuItem>
        <MenuItem icon="star" onClick={()=>{ onAction({type:'toast', msg:`${m.name} made a moderator`}); setOpen(false); }}>Make moderator</MenuItem>
        <MenuItem icon="directory" onClick={()=>{ onAction({type:'toast', msg:'Profile opened'}); setOpen(false); }}>View profile</MenuItem>
        <div className="menu-sep"/>
        <MenuItem icon="ban" danger onClick={()=>{ onAction({type:'toast', msg:`${m.name} removed`}); setOpen(false); }}>Remove from community</MenuItem>
      </Menu>
    </div>
  );
}
Object.assign(window, { MembersView });
