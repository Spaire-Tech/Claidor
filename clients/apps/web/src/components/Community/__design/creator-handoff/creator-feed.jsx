/* ============================================================
   SPAIRE ORIGINALS — Community · CREATOR · Feed tab
   The creator's running conversation with the room.
   LinkedIn information architecture, Apple restraint:
   rich author block · verified host · quiet single Like ·
   Comment / Repost / Send. No emoji reactions.
   Additive — exports CRFeedTab to window; nothing else touched.
   ============================================================ */
const { useState: usF, useRef: urF, useEffect: ueF } = React;
const GG = window.CGlyph, SFG = window.CSF;

/* line glyphs not already in CSF (monochrome, no emoji) */
const CRF = {
  globe:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M3.6 9h16.8 M3.6 15h16.8 M12 3c2.4 2.4 2.4 15.6 0 18 M12 3c-2.4 2.4-2.4 15.6 0 18',
  seal:   'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z M9 12l2 2 4-4',
  repost: 'M4 9.5V8a2.5 2.5 0 0 1 2.5-2.5H16 M13 2.5 16 5.5 13 8.5 M20 14.5V16a2.5 2.5 0 0 1-2.5 2.5H8 M11 21.5 8 18.5 11 15.5',
  heart:  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  pin:    'M12 17v5 M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z',
  comment:'M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.35-4.5A8 8 0 1 1 21 11.5Z',
  send:   'M21.5 3.5 2.8 11.3a.6.6 0 0 0 .05 1.12l7.05 2.2 2.2 7.05a.6.6 0 0 0 1.12.05L21.5 3.5Z M10 14l5.5-5.5',
  more:   'M5 12h.01 M12 12h.01 M19 12h.01',
};

/* people + roles */
function pf(who) { return who === 'host' ? window.CHOST : (window.CPPL[who] || { name: who, avatar: '' }); }
const ROLE = {};
(window.CMEMBERS || []).forEach(m => { ROLE[m.who] = m.role; });
function headlineFor(post) {
  if (post.who === 'carla' || post.who === 'host') return 'Host · Championship Tennis';
  return ROLE[post.who] || 'Member';
}
function verifiedFor(post) { return post.who === 'carla' || post.who === 'host' || post.badge === 'mod'; }

/* ---------- comment (reuses shared .cmt styles) ---------- */
function CRFComment({ c, depth = 0, onLike, onReply }) {
  const [replying, setReplying] = usF(false);
  const [text, setText] = usF('');
  const person = pf(c.who);
  const role = c.who === 'carla' ? 'Host' : null;
  const submit = () => { if (!text.trim()) return; onReply(c.id, text.trim()); setText(''); setReplying(false); };
  return (
    <div className="cmt">
      <img className={`cmt-av${depth ? ' sm' : ''}`} src={person.avatar} alt={person.name}/>
      <div className="cmt-main">
        <div className="cmt-bubble">
          <div className="cmt-name">{person.name}{role && <span className="role">{role}</span>}</div>
          <div className="cmt-text">{c.text}</div>
        </div>
        <div className="cmt-actions">
          <span className="t">{c.time}</span>
          <button className={c.liked ? 'on' : ''} onClick={() => onLike(c.id)}>{c.liked ? 'Liked' : 'Like'}{c.likes > 0 ? ` · ${c.likes}` : ''}</button>
          {depth === 0 && <button onClick={() => setReplying(r => !r)}>Reply</button>}
        </div>
        {replying && (
          <div className="cmt-compose" style={{ marginTop: 10 }}>
            <img src={window.CHOST.avatar} alt="Carla"/>
            <input autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder={`Reply to ${person.name.split(' ')[0]}…`}/>
            <button className="cmt-send" disabled={!text.trim()} onClick={submit}>Reply</button>
          </div>
        )}
        {c.replies && c.replies.length > 0 && (
          <div className="cmt-thread">
            {c.replies.map(r => <CRFComment key={r.id} c={r} depth={depth + 1} onLike={onLike} onReply={onReply}/>)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- post card ---------- */
const CRF_TRUNC = 280;
function CRFPost({ post, onAction, viewer = 'host' }) {
  const [open, setOpen] = usF(post.pinned);
  const [text, setText] = usF('');
  const [expanded, setExpanded] = usF(false);
  const [menu, setMenu] = usF(false);
  const author = pf(post.who);
  const count = (post.comments || []).reduce((a, c) => a + 1 + (c.replies ? c.replies.length : 0), 0);
  const submit = () => { if (!text.trim()) return; onAction({ type: 'comment', postId: post.id, text: text.trim() }); setText(''); setOpen(true); };

  const long = post.text.length > CRF_TRUNC;
  const shownText = long && !expanded ? post.text.slice(0, post.text.lastIndexOf(' ', CRF_TRUNC)) + '…' : post.text;
  const isHost = post.who === 'carla' || post.who === 'host';
  const isMember = viewer === 'member';
  const mine = post.who === viewer;

  return (
    <article className="crf-post">
      {post.pinned && <div className="crf-pin"><GG d={CRF.pin} size={13} stroke={1.9}/> Pinned to the top of the feed</div>}

      <header className="crf-head">
        <img className={`crf-av${isHost ? ' host' : ''}`} src={author.avatar} alt={author.name}/>
        <div className="crf-id">
          <div className="crf-name">
            {author.name}
            {verifiedFor(post) && <span className="crf-seal" title="Verified host"><GG d={CRF.seal} size={14} stroke={1.7}/></span>}
          </div>
          <div className="crf-headline">{headlineFor(post)}</div>
          <div className="crf-meta">{post.time}<span className="dot">·</span><GG d={CRF.globe} size={12} stroke={1.7}/></div>
        </div>
        {!isMember && (
        <button className={`crf-pinbtn${post.pinned ? ' on' : ''}`} onClick={() => onAction({ type: 'pin', postId: post.id })} aria-label={post.pinned ? 'Unpin from feed' : 'Pin to top'} title={post.pinned ? 'Unpin from feed' : 'Pin to top'}>
          <GG d={CRF.pin} size={18} stroke={1.9} fill={post.pinned ? 'currentColor' : 'none'}/>
        </button>
        )}
        <div className="crf-menu-wrap">
          <button className="crf-more" aria-label="Post options" onClick={() => setMenu(m => !m)}><GG d={CRF.more} size={18} stroke={2.4}/></button>
          {menu && (
            <React.Fragment>
              <div className="crf-menu-scrim" onClick={() => setMenu(false)}></div>
              <div className="crf-menu">
                {!isMember && (
                <button onClick={() => { onAction({ type: 'pin', postId: post.id }); setMenu(false); }}>
                  <GG d={CRF.pin} size={16} stroke={1.8}/> {post.pinned ? 'Unpin from feed' : 'Pin to top'}
                </button>
                )}
                <button onClick={() => { onAction({ type: 'toast', msg: 'Link to post copied' }); setMenu(false); }}>
                  <GG d={SFG.share} size={16} stroke={1.8}/> Copy link
                </button>
                {!isMember && !isHost && (
                  <button onClick={() => { onAction({ type: 'toast', msg: `Highlighted ${author.name.split(' ')[0]}'s post` }); setMenu(false); }}>
                    <GG d={SFG.bolt} size={16} stroke={1.8}/> Feature this post
                  </button>
                )}
                {isMember && !mine && (
                  <button onClick={() => { onAction({ type: 'toast', msg: 'Report sent to the moderators' }); setMenu(false); }}>
                    <GG d="M4 21V4 M4 4h13l-2 4 2 4H4" size={16} stroke={1.8}/> Report post
                  </button>
                )}
                {(!isMember || mine) && (
                <button className="danger" onClick={() => { onAction({ type: 'remove', postId: post.id }); setMenu(false); }}>
                  <GG d="M5 7h14 M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2 M7 7l1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13" size={16} stroke={1.8}/> {isMember ? 'Delete post' : 'Remove post'}
                </button>
                )}
              </div>
            </React.Fragment>
          )}
        </div>
      </header>

      <div className="crf-text">
        {shownText}
        {long && !expanded && <button className="crf-morelink" onClick={() => setExpanded(true)}>more</button>}
      </div>

      {post.media && <div className="crf-media"><img src={post.media} alt=""/></div>}
      {window.PostExtras && <window.PostExtras post={post} onAction={onAction}/>}

      {(post.likes > 0 || count > 0) && (
        <div className="crf-proof">
          <span className="crf-proof-l">
            {post.likes > 0 && (
              <React.Fragment>
                <span className="crf-rxdot"><GG d={CRF.heart} size={11} fill="currentColor"/></span>
                <span className="crf-proof-t">{post.likes.toLocaleString()}</span>
              </React.Fragment>
            )}
          </span>
          {count > 0 && <button className="crf-proof-r" onClick={() => setOpen(o => !o)}>{count} {count === 1 ? 'comment' : 'comments'}</button>}
        </div>
      )}

      <div className="crf-bar">
        <button className={`crf-act${post.liked ? ' on' : ''}`} onClick={() => onAction({ type: 'likePost', postId: post.id })}>
          <GG d={CRF.heart} size={20} stroke={post.liked ? 1.9 : 1.8} fill={post.liked ? 'currentColor' : 'none'}/><span>{post.liked ? 'Liked' : 'Like'}</span>
        </button>
        <button className="crf-act" onClick={() => setOpen(o => !o)}><GG d={CRF.comment} size={20} stroke={1.8}/><span>Comment</span></button>
      </div>

      {open && (
        <div className="comments">
          {(post.comments || []).map(c => (
            <CRFComment key={c.id} c={c}
              onLike={(cid) => onAction({ type: 'likeComment', postId: post.id, commentId: cid })}
              onReply={(cid, t) => onAction({ type: 'reply', postId: post.id, commentId: cid, text: t })}/>
          ))}
          <div className="cmt-compose">
            <img src={window.CHOST.avatar} alt="Carla"/>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="Reply as Carla…"/>
            <button className="cmt-send" disabled={!text.trim()} onClick={submit}>Post</button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------- composer (the creator posts as the host) ---------- */
const CRF_TOPICS = ['Announcement', 'From Carla', 'Technique', 'Match stories', 'Questions'];
function CRFComposer({ open, setOpen, onPost }) {
  const [text, setText] = usF('');
  const [topic, setTopic] = usF('Announcement');
  const taRef = urF();
  ueF(() => { if (open && taRef.current) taRef.current.focus(); }, [open]);
  const expand = () => setOpen(true);
  const submit = () => { if (!text.trim()) return; onPost({ text: text.trim(), topic }); setText(''); setOpen(false); };

  if (!open) {
    return (
      <div className="card crf-composer">
        <div className="crf-comp-row">
          <img src={window.CHOST.avatar} alt="Carla"/>
          <button className="crf-comp-fake" onClick={expand}>Share an update with your community…</button>
        </div>
        <div className="crf-comp-quick">
          <button onClick={expand}><GG d={SFG.image} size={18} stroke={1.8}/> Photo</button>
          <button onClick={expand}><GG d={SFG.poll} size={18} stroke={1.9}/> Poll</button>
          <button onClick={expand}><GG d={SFG.calendar} size={18} stroke={1.8}/> Event</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card crf-composer open">
      <div className="crf-comp-head">
        <img src={window.CHOST.avatar} alt="Carla"/>
        <div className="crf-comp-who">
          <div className="n">{window.CHOST.name}</div>
          <span className="crf-comp-topic">Posting as host in&nbsp;
            <select value={topic} onChange={e => setTopic(e.target.value)}>
              {CRF_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </span>
        </div>
        <button className="crf-more" onClick={() => { setOpen(false); setText(''); }} aria-label="Close"><GG d={SFG.close} size={18} stroke={2}/></button>
      </div>
      <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} placeholder="Share an update, a prompt, or a thank-you with your members…"/>
      <div className="crf-comp-foot">
        <div className="crf-comp-tools">
          <button title="Add photo"><GG d={SFG.image} size={20} stroke={1.8}/></button>
          <button title="Add a poll"><GG d={SFG.poll} size={20} stroke={1.9}/></button>
          <button title="Add an event"><GG d={SFG.calendar} size={20} stroke={1.8}/></button>
        </div>
        <span className="sp"></span>
        <button className="btn btn-primary btn-sm" disabled={!text.trim()} style={!text.trim() ? { opacity: .4 } : null} onClick={submit}>Post</button>
      </div>
    </div>
  );
}

/* ---------- the tab ---------- */
function CRFeedTab({ showToast, onPosted, events = [] }) {
  const [posts, setPosts] = usF([]);
  const [composerOpen, setComposerOpen] = usF(false);

  const newComment = (who, text) => ({ id: 'k' + Date.now() + Math.random().toString(36).slice(2, 5), who, time: 'now', text, likes: 0, liked: false, replies: [] });

  const onAction = (a) => {
    if (a.type === 'toast') { showToast(a.msg); return; }
    setPosts(prev => {
      let list = prev.map(p => {
        if (p.id !== a.postId) return p;
        if (a.type === 'likePost') return { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) };
        if (a.type === 'comment') return { ...p, comments: [...(p.comments || []), newComment('host', a.text)] };
        if (a.type === 'likeComment') {
          const tog = (c) => c.id === a.commentId ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) } : { ...c, replies: (c.replies || []).map(tog) };
          return { ...p, comments: (p.comments || []).map(tog) };
        }
        if (a.type === 'reply') {
          return { ...p, comments: (p.comments || []).map(c => c.id === a.commentId ? { ...c, replies: [...(c.replies || []), newComment('host', a.text)] } : c) };
        }
        if (a.type === 'pin') return { ...p, pinned: !p.pinned };
        if (a.type === 'vote') return p.poll && p.poll.voted == null ? { ...p, poll: { ...p.poll, voted: a.optionId, options: p.poll.options.map(o => o.id === a.optionId ? { ...o, votes: o.votes + 1 } : o) } } : p;
        return p;
      });
      if (a.type === 'remove') list = list.filter(p => p.id !== a.postId);
      /* pinned posts float to the top, order otherwise preserved */
      return [...list].sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0));
    });
    if (a.type === 'pin') showToast('Feed order updated');
    if (a.type === 'remove') showToast('Post removed');
  };

  const addPost = (payload) => {
    const p = { id: 'np' + Date.now(), who: 'host', badge: 'host', time: 'now', likes: 0, liked: false, comments: [], ...payload };
    setPosts(prev => [p, ...prev].sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)));
    showToast('Posted to your community');
    if (onPosted) onPosted();
  };

  return (
    <React.Fragment>
      <div className="cr-head">
        <div>
          <div className="h">Feed</div>
          <div className="s">The running conversation at the heart of your community. Post announcements and prompts as the host, pin what matters, and reply right in the thread — exactly as your members will see it.</div>
        </div>
      </div>

      <window.RichComposer onPost={addPost} events={events} showToast={showToast} placeholder="Share an update with your community…"/>

      {posts.length === 0 ? (
        <div className="card crf-empty">
          <span className="crf-empty-ic"><GG d={SFG.bubble} size={26} stroke={1.7}/></span>
          <h3>Your feed is quiet — for now</h3>
          <p>Post a welcome so members arrive to a room that already feels alive. Introduce yourself, set the tone, and tell them what to do first.</p>
          <button className="btn btn-primary" onClick={() => showToast('Use the box above to write your first post')}>Write a welcome post</button>
        </div>
      ) : (
        <div className="crf-stack">
          {posts.map(p => <CRFPost key={p.id} post={p} onAction={onAction}/>)}
        </div>
      )}
    </React.Fragment>
  );
}

window.CRFeedTab = CRFeedTab;
window.CRFPost = CRFPost;
