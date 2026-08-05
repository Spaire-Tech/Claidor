/* ============================================================
   SPAIRE — Feed view (the heart): composer, posts, comments
   ============================================================ */
const { useState: useStateF, useRef: useRefF } = React;

/* ---------- LinkedIn-style reaction helpers ---------- */
function rset() { return window.REACTION_SET; }
function topReactions(reactions) {
  return Object.entries(reactions||{})
    .filter(([k,v]) => (v||[]).length>0)
    .sort((a,b) => b[1].length - a[1].length)
    .slice(0,3)
    .map(([k]) => rset().find(r=>r.key===k))
    .filter(Boolean);
}
function reactionTitle(reactions) {
  return rset().filter(r => (reactions[r.key]||[]).length>0)
    .map(r => `${r.label} ${reactions[r.key].length}`).join(' · ');
}

/* LinkedIn Like button: hover reveals the reaction flyout, click toggles default Like */
function LikeControl({ post, onReact }) {
  const [open, setOpen] = useStateF(false);
  const enterT = useRefF(), leaveT = useRefF();
  const my = post.myReaction || (post.myReactions && post.myReactions[0]) || null;
  const meta = my ? rset().find(r=>r.key===my) : null;
  const openSoon = () => { clearTimeout(leaveT.current); enterT.current = setTimeout(()=>setOpen(true), 200); };
  const closeSoon = () => { clearTimeout(enterT.current); leaveT.current = setTimeout(()=>setOpen(false), 160); };
  return (
    <div className="like-wrap" onMouseEnter={openSoon} onMouseLeave={closeSoon}>
      {open && (
        <div className="rx-flyout" onMouseEnter={()=>clearTimeout(leaveT.current)} onMouseLeave={closeSoon}>
          {rset().map(r => (
            <button key={r.key} className="rx-emoji" data-label={r.label} onClick={()=>{ onReact(r.key); setOpen(false); }}>
              <span>{r.emoji}</span>
            </button>
          ))}
        </div>
      )}
      <button className={`act-btn ${meta?'reacted':''}`} style={meta?{ color:meta.color }:{}} onClick={()=>{ onReact(my||'thumb'); setOpen(false); }}>
        {meta ? <span className="act-emoji">{meta.emoji}</span> : <Icon name="thumbUp" size={18}/>}
        <span>{meta ? meta.label : 'Like'}</span>
      </button>
    </div>
  );
}

/* ---------- a single comment (with one level of threaded replies) ---------- */
function Comment({ comment, postId, depth = 0, onAction, reactionsEnabled }) {
  const [replying, setReplying] = useStateF(false);
  const [replyText, setReplyText] = useStateF('');
  const [menuOpen, setMenuOpen] = useStateF(false);
  const menuRef = useRefF();
  window.useClickOutside(menuRef, ()=>setMenuOpen(false), menuOpen);

  const submitReply = () => {
    if (!replyText.trim()) return;
    onAction({ type:'reply', postId, parentId: comment.id, text: replyText });
    setReplyText(''); setReplying(false);
  };

  return (
    <div className="comment">
      <Avatar name={comment.author} size={depth?30:34}/>
      <div className="comment-body">
        <div className="comment-bubble" style={comment.isInstructor ? { background:'var(--brand-50)', boxShadow:'inset 0 0 0 1px var(--brand-200)' } : {}}>
          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
            <span className="comment-name">{comment.author}</span>
            {comment.isInstructor && <Badge kind="Admin">Instructor</Badge>}
            {comment.role==='Moderator' && <Badge kind="Moderator">Mod</Badge>}
          </div>
          <div className="comment-text">{comment.text}</div>
        </div>
        <div className="comment-actions">
          <span>{comment.time}</span>
          {reactionsEnabled && <button onClick={()=>onAction({ type:'reactComment', postId, commentId: comment.id, key:'thumb' })}>
            Like{(comment.reactions?.thumb?.length)? ` · ${comment.reactions.thumb.length}`:''}
          </button>}
          {depth===0 && <button onClick={()=>setReplying(r=>!r)}>Reply as instructor</button>}
          <div style={{ position:'relative', marginLeft:'auto' }} ref={menuRef}>
            <button onClick={()=>setMenuOpen(o=>!o)} style={{ display:'grid', placeItems:'center' }}><Icon name="dots" size={15}/></button>
            <Menu open={menuOpen} onClose={()=>setMenuOpen(false)}>
              <MenuItem icon="pin" onClick={()=>{ onAction({type:'toast', msg:'Comment pinned'}); setMenuOpen(false); }}>Pin comment</MenuItem>
              <MenuItem icon="eyeOff" onClick={()=>{ onAction({type:'hideComment', postId, commentId: comment.id}); setMenuOpen(false); }}>Hide from group</MenuItem>
              <div className="menu-sep"/>
              <MenuItem icon="trash" danger onClick={()=>{ onAction({type:'deleteComment', postId, commentId: comment.id}); setMenuOpen(false); }}>Delete</MenuItem>
            </Menu>
          </div>
        </div>

        {replying && (
          <div className="comment-compose" style={{ marginTop:10 }}>
            <Avatar name="Mara Linwood" size={30}/>
            <input autoFocus value={replyText} onChange={e=>setReplyText(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter') submitReply(); }}
              placeholder="Reply as the instructor…"/>
            <button className="btn btn-primary btn-sm" onClick={submitReply} disabled={!replyText.trim()}>Reply</button>
          </div>
        )}

        {comment.replies?.length > 0 && (
          <div className="comment-thread">
            {comment.replies.map(r => (
              <Comment key={r.id} comment={r} postId={postId} depth={depth+1} onAction={onAction} reactionsEnabled={reactionsEnabled}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- post card ---------- */
function PostCard({ post, reactionsEnabled, onAction, scheduled }) {
  const [showComments, setShowComments] = useStateF(post.id==='p1');
  const [commentText, setCommentText] = useStateF('');
  const [menuOpen, setMenuOpen] = useStateF(false);
  const menuRef = useRefF();
  window.useClickOutside(menuRef, ()=>setMenuOpen(false), menuOpen);

  // SYSTEM auto-post (e.g. "Maya finished Module 2")
  if (post.system) {
    return (
      <div className="post fade-in" style={{ background:'var(--brand-50)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:38, height:38, borderRadius:999, background:'var(--brand)', display:'grid', placeItems:'center', color:'#fff', flexShrink:0 }}>
            <Icon name="trophy" size={19}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14.5, color:'var(--ink-2)' }}>
              <strong>{post.body[0].split(' just ')[0]}</strong> just finished <strong>{post.body[0].split('finished ')[1] || 'a module'}</strong>
            </div>
            <div style={{ fontSize:12.5, color:'var(--muted)', marginTop:2, display:'flex', alignItems:'center', gap:6 }}>
              <span className="chip badge-soft" style={{ background:'#fff' }}><Icon name="sparkle" size={12}/> Auto-post</span> · {post.time} ago
            </div>
          </div>
          <ReactionBar reactions={post.reactions} myReactions={post.myReactions} enabled={reactionsEnabled} onToggle={(k)=>onAction({type:'reactPost', postId:post.id, key:k})}/>
        </div>
      </div>
    );
  }

  const totalReactions = Object.values(post.reactions||{}).reduce((a,l)=>a+l.length,0);
  const commentCount = (post.comments||[]).reduce((a,c)=>a+1+(c.replies?.length||0),0);

  return (
    <div className="post fade-in">
      {/* status chips */}
      {(post.pinned || scheduled || post.module || post.commentMode!=='open') && (
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
          {post.pinned && <span className="chip chip-pinned"><Icon name="pin" size={13}/> Pinned</span>}
          {scheduled && <span className="chip chip-scheduled"><Icon name="clock" size={13}/> Scheduled · {post.scheduledFor}</span>}
          {post.module && <span className="chip chip-module"><Icon name="book" size={13}/> {window.moduleFull(post.module)}</span>}
          {post.commentMode==='off' && <span className="chip chip-draft"><Icon name="ban" size={13}/> Comments off</span>}
          {post.commentMode==='read-only' && <span className="chip chip-draft"><Icon name="lock" size={13}/> Comments read-only</span>}
        </div>
      )}

      <div className="post-head">
        <Avatar name={post.author} size={42}/>
        <div className="post-meta">
          <div className="post-name-row">
            <span className="post-name">{post.author}</span>
            {(post.badges||[]).map(b => <Badge key={b} kind={b}/>)}
          </div>
          <div className="post-sub">
            <span>{post.role==='Instructor' ? window.COURSE.instructorRole : post.role}</span>
            <span className="dot-sep"/><span>{scheduled ? `Scheduled for ${post.scheduledFor}` : `${post.time} ago`}</span>
          </div>
        </div>
        <div style={{ position:'relative' }} ref={menuRef}>
          <button className="icon-btn" onClick={()=>setMenuOpen(o=>!o)}><Icon name="dots" size={19}/></button>
          <Menu open={menuOpen} onClose={()=>setMenuOpen(false)}>
            <div className="menu-label">Instructor controls</div>
            <MenuItem icon="pin" onClick={()=>{ onAction({type:'togglePin', postId:post.id}); setMenuOpen(false); }}>{post.pinned?'Unpin post':'Pin to top'}</MenuItem>
            <MenuItem icon="book" onClick={()=>{ onAction({type:'editPost', post}); setMenuOpen(false); }}>{post.module?'Change linked module':'Tie to a module'}</MenuItem>
            <MenuItem icon="edit" onClick={()=>{ onAction({type:'editPost', post}); setMenuOpen(false); }}>Edit post</MenuItem>
            <div className="menu-sep"/>
            <div className="menu-label">Comments</div>
            <MenuItem icon="comment" onClick={()=>{ onAction({type:'commentMode', postId:post.id, mode:'open'}); setMenuOpen(false); }}>Allow comments {post.commentMode==='open'&&'✓'}</MenuItem>
            <MenuItem icon="lock" onClick={()=>{ onAction({type:'commentMode', postId:post.id, mode:'read-only'}); setMenuOpen(false); }}>Read-only {post.commentMode==='read-only'&&'✓'}</MenuItem>
            <MenuItem icon="ban" onClick={()=>{ onAction({type:'commentMode', postId:post.id, mode:'off'}); setMenuOpen(false); }}>Turn off {post.commentMode==='off'&&'✓'}</MenuItem>
            <div className="menu-sep"/>
            <MenuItem icon="eyeOff" onClick={()=>{ onAction({type:'hidePost', postId:post.id}); setMenuOpen(false); }}>Hide from students</MenuItem>
            <MenuItem icon="trash" danger onClick={()=>{ onAction({type:'deletePost', postId:post.id}); setMenuOpen(false); }}>Delete post</MenuItem>
          </Menu>
        </div>
      </div>

      <div className="post-body">{post.body.map((p,i)=><p key={i}>{p}</p>)}</div>

      {post.image && (
        <div style={{ marginTop:14, borderRadius:12, overflow:'hidden', height:240, background:post.image.g, display:'grid', placeItems:'center', position:'relative' }}>
          <div style={{ color:'rgba(255,255,255,.9)', fontWeight:650, letterSpacing:'.16em', fontSize:14 }}>{post.image.label}</div>
          {post.image.kind==='video' && <div style={{ position:'absolute', width:56, height:56, borderRadius:999, background:'rgba(255,255,255,.92)', display:'grid', placeItems:'center' }}><Icon name="video" size={24} color="var(--ink)"/></div>}
        </div>
      )}

      {/* reactions summary + LinkedIn action bar */}
      {!scheduled && (
        <>
          {((reactionsEnabled && totalReactions>0) || commentCount>0) && (
            <div className="rx-summary-row">
              {reactionsEnabled && totalReactions>0 ? (
                <button className="rx-summary" title={reactionTitle(post.reactions)}>
                  <span className="rx-bubbles">
                    {topReactions(post.reactions).map((r,i)=>(
                      <span className="rx-bubble" key={r.key} style={{ zIndex:3-i }}>{r.emoji}</span>
                    ))}
                  </span>
                  <span className="rx-count">{totalReactions}</span>
                </button>
              ) : <span/>}
              {commentCount>0 && post.commentMode!=='off' && (
                <button className="rx-meta" onClick={()=>setShowComments(s=>!s)}>{commentCount} {commentCount===1?'comment':'comments'}</button>
              )}
            </div>
          )}

          <div className="action-bar">
            {reactionsEnabled
              ? <LikeControl post={post} onReact={(k)=>onAction({type:'reactPost', postId:post.id, key:k})}/>
              : <button className="act-btn"><Icon name="thumbUp" size={18}/> Like</button>}
            {post.commentMode!=='off'
              ? <button className="act-btn" onClick={()=>setShowComments(s=>!s)}><Icon name="comment" size={18}/> Comment</button>
              : <span className="act-btn disabled"><Icon name="ban" size={17}/> Comments off</span>}
            <button className="act-btn"><Icon name="share" size={18}/> Share</button>
            <button className="act-btn"><Icon name="send" size={18}/> Send</button>
          </div>
        </>
      )}

      {/* scheduled controls */}
      {scheduled && (
        <div style={{ display:'flex', gap:10, marginTop:16, paddingTop:14, borderTop:'1px solid var(--line)' }}>
          <button className="btn btn-ghost btn-sm" onClick={()=>onAction({type:'editPost', post, scheduled:true})}><Icon name="edit" size={15}/> Edit</button>
          <button className="btn btn-primary btn-sm" onClick={()=>onAction({type:'publishNow', postId:post.id})}><Icon name="bolt" size={15}/> Publish now</button>
          <button className="btn btn-danger btn-sm" onClick={()=>onAction({type:'deleteScheduled', postId:post.id})}>Cancel</button>
        </div>
      )}

      {/* comments */}
      {showComments && post.commentMode!=='off' && !scheduled && (
        <div className="comments">
          <div className="divider" style={{ margin:'4px 0 8px' }}/>
          {(post.comments||[]).map(c => (
            <Comment key={c.id} comment={c} postId={post.id} onAction={onAction} reactionsEnabled={reactionsEnabled}/>
          ))}
          {post.commentMode==='read-only' ? (
            <div style={{ fontSize:13, color:'var(--muted)', padding:'10px 0', display:'flex', alignItems:'center', gap:8 }}>
              <Icon name="lock" size={15}/> Comments are read-only. Students can read but not reply.
            </div>
          ) : (
            <div className="comment-compose" style={{ marginTop:6 }}>
              <Avatar name="Mara Linwood" size={34}/>
              <input value={commentText} onChange={e=>setCommentText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter' && commentText.trim()){ onAction({type:'comment', postId:post.id, text:commentText}); setCommentText(''); } }}
                placeholder="Comment as the instructor…"/>
              <button className="btn btn-primary btn-sm" disabled={!commentText.trim()} onClick={()=>{ onAction({type:'comment', postId:post.id, text:commentText}); setCommentText(''); }}>
                <Icon name="send" size={15}/>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- the Feed page ---------- */
function FeedView({ state, onAction }) {
  const { posts, scheduledPosts, reactionsEnabled, feedName, coverOn, settings } = state;
  const [tab, setTab] = useStateF('feed');           // feed | scheduled
  const [sort, setSort] = useStateF('Latest');
  const fileRef = useRefF();
  const onPick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => onAction({ type:'setCover', dataUrl: rd.result });
    rd.readAsDataURL(f);
    e.target.value = '';
  };
  const pinned = posts.filter(p=>p.pinned);
  const rest = posts.filter(p=>!p.pinned);
  const ordered = [...pinned, ...rest];

  return (
    <div className="content" style={{ paddingTop:20 }}>
      {/* cover */}
      {coverOn && (
        <div className={`cover ${settings.coverImage?'':'cover-empty'}`} style={settings.coverImage
          ? { backgroundImage:`linear-gradient(180deg, rgba(10,14,12,.04), rgba(10,14,12,.30)), url(${settings.coverImage})`, backgroundSize:'cover', backgroundPosition:'center' }
          : undefined}>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick}/>
          {settings.coverImage ? (
            <div className="cover-actions">
              <button className="cover-btn" onClick={()=>fileRef.current && fileRef.current.click()}><Icon name="image" size={15} style={{marginRight:6, verticalAlign:'-2px'}}/>Change cover</button>
              <button className="cover-btn" onClick={()=>onAction({type:'clearCover'})}>Remove</button>
            </div>
          ) : (
            <button className="cover-upload" onClick={()=>fileRef.current && fileRef.current.click()}>
              <span className="cu-icon"><Icon name="image" size={22}/></span>
              <span className="cu-title">Upload a cover photo</span>
              <span className="cu-sub">PNG or JPG · recommended 1600 × 460</span>
            </button>
          )}
        </div>
      )}

      {/* tabs + sort */}
      <div style={{ display:'flex', alignItems:'center', marginTop:coverOn?18:0, marginBottom:4 }}>
        <div className="tabs" style={{ border:'none', flex:1 }}>
          <button className={`tab ${tab==='feed'?'active':''}`} onClick={()=>setTab('feed')}>Feed</button>
          <button className={`tab ${tab==='scheduled'?'active':''}`} onClick={()=>setTab('scheduled')}>
            Scheduled {scheduledPosts.length>0 && <span style={{ marginLeft:5, fontSize:11.5, background:'var(--blue-bg)', color:'var(--blue)', padding:'1px 7px', borderRadius:999 }}>{scheduledPosts.length}</span>}
          </button>
        </div>
        <button className="seg" onClick={()=>setSort(s=>s==='Latest'?'Top':'Latest')}>
          {sort} <Icon name="caret" size={15}/>
        </button>
      </div>

      {tab==='feed' ? (
        <>
          {/* composer */}
          <div className="card" style={{ marginTop:12 }}>
            <button className="composer" style={{ width:'100%', border:'none', background:'transparent', textAlign:'left' }} onClick={()=>onAction({type:'openCompose'})}>
              <Avatar name="Mara Linwood" size={40}/>
              <span className="fake-input">Share an update with your students…</span>
              <span className="plus"><Icon name="plus" size={19}/></span>
            </button>
            <div className="divider"/>
            <div style={{ display:'flex', padding:'10px 14px', gap:6 }}>
              <button className="pa-btn" onClick={()=>onAction({type:'openCompose', preset:'photo'})}><Icon name="image" size={17} color="var(--brand)"/> Photo</button>
              <button className="pa-btn" onClick={()=>onAction({type:'openCompose', preset:'video'})}><Icon name="video" size={17} color="var(--rose)"/> Video</button>
              <button className="pa-btn" onClick={()=>onAction({type:'openCompose', preset:'module'})}><Icon name="book" size={17} color="var(--amber)"/> Tie to module</button>
              <button className="pa-btn" onClick={()=>onAction({type:'openCompose', preset:'schedule'})}><Icon name="clock" size={17} color="var(--blue)"/> Schedule</button>
            </div>
          </div>

          {/* posts */}
          <div className="card" style={{ marginTop:16, overflow:'hidden' }}>
            {ordered.map(p => <PostCard key={p.id} post={p} reactionsEnabled={reactionsEnabled} onAction={onAction}/>)}
          </div>
        </>
      ) : (
        <div className="card" style={{ marginTop:16, overflow:'hidden' }}>
          {scheduledPosts.length===0 ? (
            <div className="empty"><div className="e-emoji">🕓</div><div style={{ fontWeight:700, color:'var(--ink)' }}>No scheduled posts</div><div>Posts you schedule for later will wait here.</div></div>
          ) : scheduledPosts.map(p => <PostCard key={p.id} post={p} reactionsEnabled={reactionsEnabled} onAction={onAction} scheduled/>)}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { FeedView, PostCard, Comment });
