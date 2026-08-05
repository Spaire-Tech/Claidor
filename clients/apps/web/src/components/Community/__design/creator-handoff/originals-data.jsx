/* ============================================================
   SPAIRE ORIGINALS — MasterClass-style course
   "Carla Marín Teaches Championship Tennis"
   (fictional instructor)
   ============================================================ */
const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=1920&q=80&auto=format&fit=crop`;
const THUMB = (id) => `https://images.unsplash.com/photo-${id}?w=400&q=75&auto=format&fit=crop`;

window.SHOW = {
  brand: 'Spaire Originals',
  instructor: 'Carla Marín',
  teaches: 'Teaches Championship Tennis',
  courseTitle: 'Championship Tennis',
  portrait: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=320&q=80&auto=format&fit=crop',
  cover: 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=1600&q=80&auto=format&fit=crop',
  lessonsLabel: '11 Lessons',
  runtime: '3h 42m',
  level: 'All Levels',
  bio: 'Former world No. 2 and two-time Grand Slam champion.',
  freePreview: 3,           // lessons 1–3 are free; 4+ are locked
};

// pricing the creator sets for THIS course (single plan, creator-owned)
window.PRICING = {
  planName: 'Full course access',
  tag: 'Lifetime access · one-time',
  price: '$89',
  period: 'one-time',
  cta: 'Get the course · $89',
  note: 'One payment, billed by Carla Marín. Yours forever — including future updates.',
  features: [
    { icon:'play2', text:'All 11 lessons, self-paced' },
    { icon:'download', text:'Workbooks & drill sheets' },
    { icon:'bubble', text:'Private community with Carla' },
    { icon:'infinity', text:'Lifetime access, every device' },
  ],
};

// lesson stills (verified to load)
const STILLS = {
  intro:    '1554068865-24cecd4e34b8',
  mindset:  '1599058917212-d750089bc07e',
  grip:     '1622279457486-62dcc4a431d6',
  forehand: '1531315630201-bb15abeb1653',
  backhand: '1595435934249-5df7ed86e1c0',
  serve:    '1551773188-0801da12ddae',
  return:   '1530915365347-e35b749a0381',
  footwork: '1574680096145-d05b474e2155',
  point:    '1626224583764-f87db24ac4ea',
  mental:   '1542144582-1ba00456b5e3',
  matchday: '1554068865-24cecd4e34b8',
};

const durToSec = (s) => { const m = /(\d+)\s*min/.exec(s); return m ? parseInt(m[1])*60 : 600; };
const L = (n, title, dur, key, synopsis, state, progress) => ({
  id:'l'+n, n, title, dur, durSec: durToSec(dur), sub:`Lesson ${n} · ${dur}`,
  img: IMG(STILLS[key]), thumb: THUMB(STILLS[key]),
  synopsis, state: state||'unwatched', progress,
});

window.EPISODES = [
  L(1,'Introduction','3 min','intro',
    "Meet Carla and the philosophy behind championship tennis — what separates the players who win the big points from everyone else.", 'watched'),
  L(2,'The Athlete\u2019s Mindset','14 min','mindset',
    "Before technique, the mind. How champions think between points, manage doubt, and stay present when the match is on the line.", 'playing', 0.58),
  L(3,'Grip & Ready Position','18 min','grip',
    "The foundation everything is built on — how Carla holds the racquet, sets her base, and waits so she\u2019s ready for any ball.", 'unwatched'),
  L(4,'The Forehand','26 min','forehand',
    "Carla breaks down the modern forehand from the unit turn and load to contact and follow-through, with drills to groove it.", 'unwatched'),
  L(5,'The Backhand','24 min','backhand',
    "One hand or two — building a backhand you can trust under pressure, and choosing the version that fits your game.", 'unwatched'),
  L(6,'Serve Mechanics','29 min','serve',
    "The most important shot in tennis, deconstructed from the toss to the trophy pose. Power, placement, and disguise.", 'unwatched'),
  L(7,'Return of Serve','16 min','return',
    "Neutralize the serve and start every point on your terms. Reading the toss, the split step, and the first-ball decision.", 'unwatched'),
  L(8,'Footwork & Court Coverage','21 min','footwork',
    "The split step, the recovery step, and reading your opponent early so you\u2019re moving before they\u2019ve hit the ball.", 'unwatched'),
  L(9,'Constructing the Point','23 min','point',
    "Patterns, angles, and patience. How Carla builds a winning point and the high-percentage tennis behind it.", 'unwatched'),
  L(10,'The Mental Game','19 min','mental',
    "Pressure, nerves, and the inner voice. The routines Carla uses to win the points that actually decide matches.", 'unwatched'),
  L(11,'Match Day','17 min','matchday',
    "Warm-up, scouting, and the rituals that bring it all together — how to walk on court ready to compete.", 'unwatched'),
];

// ---------- discussion ----------
const RU = (g,n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
window.VIEWER = { name:'You', avatar: RU('men',41) };

const C = (id, name, avatar, time, text, likes, liked) => ({ id, name, avatar, time, text, likes:likes||0, liked:!!liked, replies:[] });
window.COMMENTS = {
  l1: [
    C('c1','Amara Okeke', RU('women',44), '2d', "Three minutes in and I already feel like I understand why I keep losing close matches. The bit about ‘deciding points’ hit home.", 12, true),
    C('c2','Diego Fuentes', RU('men',32), '1d', "Coming back to tennis after 10 years off. This is exactly the reset I needed. Carla explains the ‘why’, not just the ‘how’.", 5),
    C('c3','Priya N.', RU('women',68), '19h', "Anyone else rewatching with a notebook? 😄", 3),
  ],
  l2: [
    C('c4','Sam Tan', RU('men',75), '3d', "The reframe of nerves as ‘readiness’ genuinely changed my last match. Stayed calm at 4–5 down and held.", 21, true),
    C('c5','Amara Okeke', RU('women',44), '2d', "Bookmarking the breathing routine at 8:40. Going to use it before serving.", 9),
  ],
  l4: [
    C('c6','Diego Fuentes', RU('men',32), '1d', "The unit turn cue finally made my forehand click. Stopped arming the ball.", 14),
    C('c7','Priya N.', RU('women',68), '11h', "Drill at 18:20 is gold. Did 50 reps this morning. 🎾", 6),
  ],
};

// ---------- lesson overview (instructor-authored notes, chapters, media, resources) ----------
const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
const OVERVIEW = {
  l2: {
    body: [
      "Most players think matches are won with the forehand or the serve. They're not — they're won in the six seconds between points, in the story you tell yourself after a missed shot.",
      "In this lesson I'll share the exact mental routine I used on tour: how I reset after errors, how I narrow my focus before the biggest points, and how I stopped my own nerves from beating me before my opponent could.",
      "Work through the breathing drill at the end with me. Don't just watch it — do it. The players who practice the mind the way they practice the forehand are the ones who hold serve at 4–5 in the third.",
    ],
    learn: [
      "A 4-step reset routine to use after every point",
      "How to turn nerves into 'readiness' instead of fear",
      "A pre-serve breathing pattern that lowers your heart rate",
      "The one question to ask yourself before a big point",
    ],
    chapters: [ {t:0,label:'Why the mind comes first'}, {t:130,label:'The 6-second reset'}, {t:330,label:'Reframing nerves'}, {t:520,label:'The pre-serve routine'}, {t:700,label:'Breathing drill (do it with me)'} ],
    resources: [
      { name:'Mental Game Workbook', type:'pdf', meta:'PDF · 6 pages' },
      { name:'Pre-Serve Breathing Audio', type:'audio', meta:'MP3 · 4:10' },
    ],
  },
  l4: {
    body: [
      "The modern forehand is a chain, not a swing. Power comes from the ground up — legs, hips, core, then the arm last. If you lead with the arm, you'll never get free, repeatable racquet-head speed.",
      "We'll build it in order: the unit turn, the load, the contact point out in front, and the relaxed follow-through. I'll show each piece slowly, then full speed, then we'll groove it with a wall drill you can do anywhere.",
      "Pay attention to the unit turn at 2:20 — it's the single most common thing I fix in students. Get that right and half of your forehand problems disappear on their own.",
    ],
    learn: [
      "Sequence the forehand from the ground up for effortless power",
      "Use the unit turn to prepare early and stay balanced",
      "Find a contact point out in front, every time",
      "A wall drill to groove the motion in 10 minutes a day",
    ],
    chapters: [ {t:0,label:'The forehand as a chain'}, {t:140,label:'The unit turn'}, {t:420,label:'Loading the legs'}, {t:900,label:'Contact out in front'}, {t:1300,label:'The follow-through'}, {t:1500,label:'Wall drill'} ],
    resources: [
      { name:'Forehand Drill Sheet', type:'pdf', meta:'PDF · 3 pages' },
      { name:'Slow-motion reference clip', type:'video', meta:'MP4 · 1:20' },
      { name:'Recommended string tension guide', type:'link', meta:'spaire.co/strings' },
    ],
  },
};
window.getOverview = (lesson) => {
  const o = OVERVIEW[lesson.id];
  if (o) return o;
  // graceful fallback generated from the synopsis + scaled generic chapters
  const d = lesson.durSec;
  const marks = [0, .14, .42, .72, .9].map(p => Math.round(d*p));
  const labels = ['Introduction','Demonstration','Breakdown','Putting it together','Drill & recap'];
  return {
    body: [
      lesson.synopsis,
      "Watch the full demonstration first, then go back and work through each section at your own pace. Use the chapters below to jump to the part you want to practice.",
    ],
    learn: [
      'The core technique for '+lesson.title.toLowerCase(),
      'Common mistakes and how to fix them',
      'A simple drill to practice on your own',
    ],
    chapters: marks.map((t,i)=>({ t, label: labels[i] })),
    resources: [ { name: lesson.title+' Workbook', type:'pdf', meta:'PDF · download' } ],
  };
};
window.fmtTime = fmt;

