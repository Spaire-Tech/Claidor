/* ============================================================
   SPAIRE ORIGINALS — Community · Feed
   Words over icons. Neutral roles. Quiet actions.
   Comments mirror the in-player discussion.
   ============================================================ */
const { useState: useStateF, useRef: useRefF } = React;

const ROLE_LABEL = { host: 'Host', mod: 'Moderator', founding: 'Founding member' };
function roleText(badge) { return ROLE_LABEL[badge] || null; }
function P(who) { return window.CPPL[who] || { name: who, avatar: '' }; }

/* ---------- a single comment — mirrors the player's discussion row ---------- */
function CComment({ c, depth = 0, onLike, onReply }) {
  const [replying, setReplying] = useStateF(false);
  const [text, setText] = useStateF('');
  const person = P(c.who);
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
          <button className={c.liked ? 'on' : ''} onClick={() => onLike(c.id)}>
            {c.liked ? 'Liked' : 'Like'}{c.likes > 0 ? ` · ${c.likes}` : ''}
          </button>
          {depth === 0 && <button onClick={() => setReplying(r => !r)}>Reply</button>}
        </div>

        {replying && (
          <div className="cmt-compose" style={{ marginTop: 10 }}>
            <img src={window.CVIEWER.avatar} alt="You"/>
            <input autoFocus value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder={`Reply to ${person.name.split(' ')[0]}…`}/>
            <button className="cmt-send" disabled={!text.trim()} onClick={submit}>Post</button>
          </div>
        )}

        {c.replies && c.replies.length > 0 && (
          <div className="cmt-thread">
            {c.replies.map(r => <CComment key={r.id} c={r} depth={depth + 1} onLike={onLike} onReply={onReply}/>)}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- post ---------- */
function CPostCard({ post, onAction }) {
  const [open, setOpen] = useStateF(post.pinned);
  const [text, setText] = useStateF('');
  const author = P(post.who);
  const role = roleText(post.badge);
  const count = (post.comments || []).reduce((a, c) => a + 1 + (c.replies ? c.replies.length : 0), 0);
  const submit = () => { if (!text.trim()) return; onAction({ type: 'comment', postId: post.id, text: text.trim() }); setText(''); setOpen(true); };

  const summary = [];
  if (post.likes > 0) summary.push(`${post.likes} ${post.likes === 1 ? 'like' : 'likes'}`);

  return (
    <article className="card post fade-in">
      {post.pinned && <div className="post-pin">Pinned by Carla</div>}

      <header className="post-head">
        <img className="av" src={author.avatar} alt={author.name}/>
        <div className="post-id">
          <div className="post-name">{author.name}{role && <span className="role">{role}</span>}</div>
          <div className="post-meta">{post.time}<span className="sep">·</span>{post.topic}</div>
        </div>
        <button className="post-more" aria-label="More"><CGlyph d={CSF.dots} size={18} stroke={2.4}/></button>
      </header>

      <div className="post-text">{post.text}</div>
      {post.media && <div className="post-media"><img src={post.media} alt=""/></div>}

      {(summary.length > 0 || count > 0) && (
        <div className="post-rx">
          {summary.join('')}
          {summary.length > 0 && count > 0 && <span className="sep"> · </span>}
          {count > 0 && <button onClick={() => setOpen(o => !o)}>{count} {count === 1 ? 'comment' : 'comments'}</button>}
        </div>
      )}

      <div className="post-actions">
        <button className={`act ${post.liked ? 'on' : ''}`} onClick={() => onAction({ type: 'likePost', postId: post.id })}>
          {post.liked ? 'Liked' : 'Like'}
        </button>
        <button className="act" onClick={() => setOpen(o => !o)}>Comment</button>
        <button className="act" onClick={() => onAction({ type: 'toast', msg: 'Link copied' })}>Share</button>
      </div>

      {open && (
        <div className="comments">
          {(post.comments || []).map(c => (
            <CComment key={c.id} c={c}
              onLike={(cid) => onAction({ type: 'likeComment', postId: post.id, commentId: cid })}
              onReply={(cid, t) => onAction({ type: 'reply', postId: post.id, commentId: cid, text: t })}/>
          ))}
          <div className="cmt-compose">
            <img src={window.CVIEWER.avatar} alt="You"/>
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder="Add to the discussion…"/>
            <button className="cmt-send" disabled={!text.trim()} onClick={submit}>Post</button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------- composer ---------- */
const COMPOSE_TOPICS = ['Wins', 'Technique', 'Match stories', 'Questions'];

function CComposer({ onPost }) {
  const [open, setOpen] = useStateF(false);
  const [text, setText] = useStateF('');
  const [topic, setTopic] = useStateF('Wins');
  const taRef = useRefF();

  const expand = () => { setOpen(true); setTimeout(() => taRef.current && taRef.current.focus(), 0); };
  const submit = () => { if (!text.trim()) return; onPost({ text: text.trim(), topic }); setText(''); setOpen(false); };

  if (!open) {
    return (
      <div className="card composer">
        <div className="composer-row">
          <img src={window.CVIEWER.avatar} alt="You"/>
          <button className="composer-fake" onClick={expand}>Share a rep, a win, or a question…</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card composer composer-open">
      <div className="composer-row" style={{ alignItems: 'flex-start' }}>
        <img src={window.CVIEWER.avatar} alt="You"/>
        <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)} placeholder="Share a rep, a win, or a question…"/>
      </div>
      <div className="composer-foot">
        <span className="topic-sel">Posting in&nbsp;
          <select value={topic} onChange={e => setTopic(e.target.value)}>
            {COMPOSE_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </span>
        <button className="text-btn">Add photo</button>
        <span className="sp"></span>
        <button className="btn btn-quiet btn-sm" onClick={() => { setOpen(false); setText(''); }}>Cancel</button>
        <button className="btn btn-primary btn-sm" disabled={!text.trim()} style={!text.trim() ? { opacity: .4 } : null} onClick={submit}>Post</button>
      </div>
    </div>
  );
}

Object.assign(window, { CPostCard, CComposer, CComment, roleText, Cperson: P });
