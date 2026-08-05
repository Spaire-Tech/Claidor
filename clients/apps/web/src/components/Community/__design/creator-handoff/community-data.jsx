/* ============================================================
   SPAIRE ORIGINALS — Community hub · data + shared glyphs
   World: "Carla Marín Teaches Championship Tennis"
   (same fictional course as the watch experience)
   ============================================================ */
const RU = (g, n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
const UNSPLASH = (id, w=900) => `https://images.unsplash.com/photo-${id}?w=${w}&q=80&auto=format&fit=crop`;

/* ---------- people ---------- */
const HOST = { name: 'Carla Marín', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80&auto=format&fit=crop', role: 'host' };
const VIEWER = { name: 'You', avatar: RU('men', 41) };

const PPL = {
  carla:  HOST,
  amara:  { name: 'Amara Okeke',   avatar: RU('women', 44) },
  diego:  { name: 'Diego Fuentes', avatar: RU('men', 32) },
  priya:  { name: 'Priya Nair',    avatar: RU('women', 68) },
  sam:    { name: 'Sam Tan',       avatar: RU('men', 75) },
  lena:   { name: 'Lena Brandt',   avatar: RU('women', 12) },
  marco:  { name: 'Marco Bianchi', avatar: RU('men', 18) },
  yuki:   { name: 'Yuki Sato',     avatar: RU('women', 29) },
  tom:    { name: 'Tom Reilly',    avatar: RU('men', 52) },
  nadia:  { name: 'Nadia Haddad',  avatar: RU('women', 90) },
  ben:    { name: 'Ben Okafor',    avatar: RU('men', 64) },
};

window.CVIEWER = VIEWER;
window.CHOST = HOST;

/* ---------- community identity ---------- */
window.COMMUNITY = {
  brand: 'Spaire Originals',
  course: 'Championship Tennis',
  title: 'The Baseline',
  tagline: 'Carla Marín’s private community',
  cover: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1600&q=80&auto=format&fit=crop',
  members: 2841,
  online: 63,
  about: 'A court-side room for everyone taking the course. Share your reps, ask Carla anything, and play the weekly challenges together.',
  guidelines: [
    { icon: 'heart',  text: 'Be generous — everyone’s mid-rebuild.' },
    { icon: 'target', text: 'Post reps, wins, and honest questions.' },
    { icon: 'bubble', text: 'Carla drops in every week.' },
  ],
};

/* ---------- topics / filters ---------- */
window.CTOPICS = ['All', 'Wins', 'Technique', 'Match stories', 'Questions', 'From Carla'];

/* ---------- feed ---------- */
const cmt = (who, time, text, likes=0, liked=false, replies=[]) =>
  ({ id: 'k'+(cmt._i=(cmt._i||0)+1), who, time, text, likes, liked, replies });

window.CPOSTS = [
  {
    id: 'p1', who: 'carla', badge: 'host', topic: 'From Carla', pinned: true, time: '2d',
    text: "Welcome to The Baseline.\n\nThis is our room — not a broadcast channel. Post your reps even when they’re ugly, ask the question you think is too basic (it isn’t), and tell us when something finally clicks.\n\nI’m here every week: a live Q&A, a drill session, and I read every thread. Let’s build games that hold up when the match is on the line.",
    likes: 214, liked: true,
    comments: [
      cmt('priya', '2d', "Couldn’t be more in. Day one and already less alone in the rebuild.", 18, true),
      cmt('diego', '1d', "The ‘too basic’ line is exactly why I’m here. Thank you, Carla.", 11, false, [
        cmt('carla', '1d', "That’s the whole point, Diego. The basics are the ceiling, not the floor.", 9, false),
      ]),
    ],
  },
  {
    id: 'p2', who: 'sam', badge: 'mod', topic: 'Wins', time: '6h',
    text: "Held serve at 4–5 in the third today and closed it out. Six months ago I’d have double-faulted twice and shaken hands. The pre-serve breathing routine from Lesson 2 is unreal.",
    media: UNSPLASH('1551773188-0801da12ddae', 1000),
    likes: 96, liked: false,
    comments: [
      cmt('carla', '5h', "THIS. The point you used to lose, you now win — that’s the whole game. Proud of you, Sam.", 24, true),
      cmt('amara', '4h', "Saving this. 4–5 in the third is exactly my nightmare scenario.", 7, false),
      cmt('lena', '3h', "What count were you on? Trying to picture the breathing between first and second serve.", 2, false),
    ],
  },
  {
    id: 'p3', who: 'amara', topic: 'Questions', time: '11h',
    text: "Backhand people — one hand or two? I’ve fought a two-hander for years but my reach feels stuck. Lesson 5 made me wonder if I should rebuild. Anyone made the switch as an adult?",
    likes: 41, liked: false,
    comments: [
      cmt('marco', '10h', "Switched to one-hander at 34. Brutal for three months, best decision since. The slice alone was worth it.", 13, true),
      cmt('carla', '8h', "Don’t switch for reach — switch for the shot you want to hit under pressure. Rewatch 9:30 in Lesson 5, then tell me which one you trust at 30–40.", 31, true, [
        cmt('amara', '7h', "Okay that reframe just saved me three months of pain. The two-hander is the one I trust. Staying.", 6, false),
      ]),
    ],
  },
  {
    id: 'p4', who: 'yuki', topic: 'Technique', time: '1d',
    text: "Filmed my forehand against the wall drill from Lesson 4. The unit turn at 2:20 was the whole thing — I was arming every ball and never knew it. 50 reps a morning this week.",
    media: UNSPLASH('1531315630201-bb15abeb1653', 1000),
    likes: 58, liked: true,
    comments: [
      cmt('diego', '1d', "Same drill, same revelation. We should start a 50-reps thread.", 9, false),
      cmt('priya', '20h', "The wall is the most honest coach I’ve ever had.", 14, true),
    ],
  },
  {
    id: 'p5', who: 'tom', topic: 'Match stories', time: '2d',
    text: "Played my first tournament in nine years on Saturday. Lost in three, but I constructed points instead of just hitting hard and hoping. Walked off actually proud. The point-construction lesson lives rent-free in my head now.",
    likes: 73, liked: false,
    comments: [
      cmt('carla', '2d', "First tournament in nine years is the win. The scoreline is just feedback. Go again.", 28, true),
      cmt('nadia', '1d', "‘Hitting hard and hoping’ — felt that in my soul. Congrats Tom.", 5, false),
    ],
  },
];

/* ---------- events (creator-hosted) ---------- */
window.CEVENTS = [
  {
    id: 'e0', live: true, type: 'qa', typeLabel: 'Live Q&A',
    mo: 'JUN', dy: '13', wd: 'Today', timeText: 'Live now · started 9 min ago',
    img: UNSPLASH('1542144582-1ba00456b5e3', 1400),
    title: 'Office Hours: Ask Carla Anything',
    desc: 'Bring your questions on serve, nerves, or your last match. Carla’s answering live on camera right now.',
    going: 312, attendees: ['amara','diego','priya','sam','lena'], rsvp: false,
  },
  {
    id: 'e1', type: 'watch', typeLabel: 'Watch Party',
    mo: 'JUN', dy: '16', wd: 'Mon', timeText: 'Mon, Jun 16 · 7:00 PM',
    img: UNSPLASH('1551773188-0801da12ddae', 1000),
    title: 'Premiere: “Serve Mechanics” + live breakdown',
    desc: 'We watch Lesson 6 together, then Carla breaks down three members’ serves submitted this week.',
    going: 148, attendees: ['yuki','marco','tom','nadia'], rsvp: true,
  },
  {
    id: 'e2', type: 'drill', typeLabel: 'Drill Session',
    mo: 'JUN', dy: '19', wd: 'Thu', timeText: 'Thu, Jun 19 · 8:00 AM',
    img: UNSPLASH('1574680096145-d05b474e2155', 1000),
    title: 'Live Footwork & Court Coverage',
    desc: 'A 30-minute movement session you do along with Carla. Sneakers on, racquet optional.',
    going: 96, attendees: ['ben','priya','diego'], rsvp: false,
  },
  {
    id: 'e3', type: 'qa', typeLabel: 'Live Q&A',
    mo: 'JUN', dy: '24', wd: 'Tue', timeText: 'Tue, Jun 24 · 6:30 PM',
    img: UNSPLASH('1595435934249-5df7ed86e1c0', 1000),
    title: 'Mental Game Clinic',
    desc: 'Pressure, nerves, and the inner voice — a focused session on the six seconds between points.',
    going: 71, attendees: ['amara','lena','tom','sam','nadia'], rsvp: false,
  },
];

window.CRECORDINGS = [
  { id: 'r1', title: 'Match Analysis: The 2019 Final, point by point', meta: 'Jun 4 · 1h 12m · 904 watched', img: UNSPLASH('1622279457486-62dcc4a431d6', 400) },
  { id: 'r2', title: 'Q&A: Fixing the double fault', meta: 'May 28 · 47m · 1,210 watched', img: UNSPLASH('1530915365347-e35b749a0381', 400) },
  { id: 'r3', title: 'Watch Party: “The Forehand” premiere', meta: 'May 21 · 58m · 1,488 watched', img: UNSPLASH('1574680096145-d05b474e2155', 400) },
];

/* ---------- activities / challenges ---------- */
window.CCHALLENGES = [
  {
    id: 'a1', span: true, icon: 'target', color: 'red', tag: 'WEEKLY CHALLENGE', tag2: 'Ends Sunday',
    img: UNSPLASH('1551773188-0801da12ddae', 1000),
    title: '100 Serves a Day', desc: 'Log 100 serves every day this week. Track your toss consistency, not just the count — quality reps beat tired ones.',
    yours: 4, total: 7, unit: 'days', people: 418, attendees: ['sam','amara','diego','yuki','priya'], joined: true,
  },
  {
    id: 'a2', icon: 'bolt', color: 'blue', tag: 'DAILY DRILL',
    title: 'Backhand down the line ×30', desc: 'Thirty backhands to the deuce corner. Film one, post it in the feed.',
    yours: 0, total: 1, unit: 'today', people: 207, attendees: ['marco','lena','tom'], joined: false,
  },
  {
    id: 'a3', icon: 'flame', color: 'green', tag: 'STREAK', tag2: 'Your best: 9',
    title: 'Practice streak', desc: 'Show up and log a session each day. Don’t break the chain.',
    yours: 6, total: 7, unit: 'days', people: 1130, attendees: ['nadia','ben','priya'], joined: true,
  },
  {
    id: 'a4', icon: 'trophy', color: 'violet', tag: 'COMMUNITY GOAL',
    title: '10,000 practice minutes', desc: 'A shared goal — every logged minute counts toward the room’s total. We’re almost there.',
    yours: 7400, total: 10000, unit: 'min', people: 2841, attendees: ['amara','sam','diego','tom','lena'], joined: true, goal: true,
  },
];

window.CLEADERBOARD = [
  { who: 'sam',   sub: '11-day streak', score: 1240, badge: 'mod' },
  { who: 'amara', sub: '9-day streak',  score: 1115 },
  { who: 'yuki',  sub: '8-day streak',  score: 980 },
  { who: 'diego', sub: '7-day streak',  score: 870 },
  { who: 'priya', sub: '6-day streak',  score: 815 },
];

/* ---------- members ---------- */
window.CMEMBERS = [
  { who: 'carla', badge: 'host',     role: 'Host · Championship Tennis', streak: 52, posts: 38, joined: 'Founder' },
  { who: 'sam',   badge: 'mod',      role: 'Moderator', streak: 11, posts: 64, joined: 'Mar 2025' },
  { who: 'amara', badge: 'founding', role: 'Founding member', streak: 9, posts: 51, joined: 'Mar 2025' },
  { who: 'diego', badge: 'founding', role: 'Founding member', streak: 7, posts: 47, joined: 'Mar 2025' },
  { who: 'priya', role: 'Member', streak: 6, posts: 29, joined: 'Apr 2025' },
  { who: 'yuki',  role: 'Member', streak: 8, posts: 33, joined: 'Apr 2025' },
  { who: 'marco', role: 'Member', streak: 4, posts: 22, joined: 'Apr 2025' },
  { who: 'tom',   role: 'Member', streak: 3, posts: 18, joined: 'May 2025' },
  { who: 'lena',  role: 'Member', streak: 5, posts: 15, joined: 'May 2025' },
  { who: 'nadia', role: 'Member', streak: 2, posts: 12, joined: 'May 2025' },
  { who: 'ben',   role: 'Member', streak: 1, posts: 9,  joined: 'Jun 2025' },
];

window.CPPL = PPL;

/* ============================================================ GLYPHS */
const CSF = {
  play:   'M7 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 7 5.5Z',
  check:  'm5 12.5 4.5 4.5L19 6.5',
  close:  'M6 6l12 12M18 6 6 18',
  bubble: 'M21 11.5a8 8 0 0 1-11.5 7.2L4 20.5l1.35-4.5A8 8 0 1 1 21 11.5Z',
  heart:  'M12 20.2s-7.2-4.4-9.4-9.2C1.2 7.8 3 4.4 6.6 4.4c2 0 3.3 1.2 3.6 1.9.3-.7 1.6-1.9 3.6-1.9 3.6 0 5.4 3.4 4 6.6C19.2 15.8 12 20.2 12 20.2Z',
  send:   'M21 3 3 11l7 2.6L13 21l8-18Z',
  plus:   'M12 5v14 M5 12h14',
  image:  'M4 5.5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1z M8.4 11a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2 M21 15.5l-5-5-8 7.5',
  poll:   'M6 20v-6 M12 20V4 M18 20v-9',
  calendar:'M7 3v3 M17 3v3 M4.5 9.5h15 M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z',
  clock:  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 7.5V12l3 2',
  users:  'M9 11.4a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4 M3.5 19c.5-3 2.7-4.7 5.5-4.7s5 1.7 5.5 4.7 M16 5.3a3 3 0 0 1 0 6 M17.6 14.7c2.2.4 3.5 1.9 3.9 4.3',
  bolt:   'M13 3 5 13.5h5l-1 7.5 8-10.5h-5l1-7.5Z',
  flame:  'M12 3.5c2.5 2.8 3.4 4.8 3.4 6.6 0 1-.4 1.9-1 2.5.3-1.6-.5-3-1.6-3.9.2 2.2-1.2 3.3-2.2 4.3-.8.8-1.5 1.7-1.5 3a4.4 4.4 0 1 0 8.6 0c0-3.6-2.6-6.9-5.7-12.5Z',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18 M12 16.6a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2 M12 13.1a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2',
  trophy: 'M8 4h8v3.5a4 4 0 0 1-8 0V4Z M8 5H5.4A2.4 2.4 0 0 0 8 7.6 M16 5h2.6A2.4 2.4 0 0 1 16 7.6 M9.5 20h5 M12 11.5V14',
  dots:   'M5 12h.01 M12 12h.01 M19 12h.01',
  pin:    'M14.5 3.5 20.5 9.5 M16.5 5.5l-7 2-5 5 9.5 9.5 5-5 2-7 M9.5 14.5 4 20',
  share:  'M17 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M7 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M17 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5 M9.2 11.2l5.6-3 M9.2 12.8l5.6 3',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M20 20l-4-4',
  moon:   'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  sun:    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  bell:   'M18 16V11a6 6 0 0 0-12 0v5l-2 2.5h16L18 16Z M9.5 19a2.5 2.5 0 0 0 5 0',
  add:    'M12 8v8 M8 12h8 M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
};

function CGlyph({ d, size=24, stroke=2, fill='none' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={fill==='none'?'currentColor':'none'} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => <path key={i} d={(i?'M':'')+seg}/>)}
    </svg>
  );
}

function useEscClose(onClose) {
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

Object.assign(window, { CSF, CGlyph, useEscClose });
