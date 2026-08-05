/* ============================================================
   SPAIRE — mock data for the course community (instructor view)
   Course: "Persuasive Writing" by Mara Linwood — structured course
   ============================================================ */

// avatar fallback palette (muted, deterministic by name)
window.AV_COLORS = ['#6B7F73','#9C7A63','#6E7E96','#86729C','#9C7088','#7E8B66','#A98E5C','#5F8783','#9A6A6A','#717D9E'];
window.avColor = (name) => window.AV_COLORS[(name||'?').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % window.AV_COLORS.length];
window.initials = (name) => (name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();

// real headshots (keyed by name) — what makes it feel premium
const RU = (g,n) => `https://randomuser.me/api/portraits/${g}/${n}.jpg`;
window.PHOTOS = {
  'Mara Linwood':      RU('women',68),
  'Nadya Ramos':       RU('women',44),
  'Geily Romero':      RU('women',65),
  'Julie Klemens':     RU('women',12),
  'Tiffany Rivera':    RU('women',33),
  'Jason Hershkowitz': RU('men',32),
  'Priya Anand':       RU('women',52),
  'Marcus Webb':       RU('men',46),
  'Lena Park':         RU('women',79),
  'Devon Clarke':      RU('men',75),
  'Sofia Marchetti':   RU('women',90),
  'Andre Diallo':      RU('men',64),
};

window.COURSE = {
  title: 'Persuasive Writing',
  subtitle: 'Write so people actually move.',
  format: 'course',            // 'course' (modules) | 'series' (episodes)
  instructor: 'Mara Linwood',
  instructorRole: 'Instructor · Author of "The Quiet Argument"',
  members: 348,
  online: 12,
};

window.MODULES = [
  { id: 'm1', n: 1, title: 'Foundations of Persuasion', lessons: 5, unread: 3 },
  { id: 'm2', n: 2, title: 'Finding Your Argument',     lessons: 4, unread: 0 },
  { id: 'm3', n: 3, title: 'Structure & Flow',          lessons: 6, unread: 7 },
  { id: 'm4', n: 4, title: 'Voice & Style',             lessons: 5, unread: 0 },
  { id: 'm5', n: 5, title: 'Editing for Impact',        lessons: 4, unread: 0 },
];

window.MEMBERS = [
  { id:'u_mara', name:'Mara Linwood', role:'Instructor · Author of "The Quiet Argument"', tags:['Admin'], email:'mara@spaire.co', joined:'Founder', progress:100, you:true },
  { id:'u1', name:'Nadya Ramos',      role:'Brand strategist',        tags:['Moderator'], email:'nadya.r@gmail.com',    joined:'Mar 2', progress:72 },
  { id:'u2', name:'Geily Romero',     role:'Newsletter writer',       tags:[],            email:'geily@hey.com',         joined:'Mar 4', progress:48 },
  { id:'u3', name:'Julie Klemens',    role:'Founder, Klemens & Co.',  tags:[],            email:'julie.k@klemens.co',    joined:'Feb 19', progress:90 },
  { id:'u4', name:'Tiffany Rivera',   role:'Ghostwriter',             tags:[],            email:'t.rivera@gmail.com',    joined:'Mar 1', progress:35 },
  { id:'u5', name:'Jason Hershkowitz',role:'Copy lead, Northbeam',    tags:[],            email:'jason.h@northbeam.io',  joined:'Feb 28', progress:61 },
  { id:'u6', name:'Priya Anand',      role:'Content designer',        tags:[],            email:'priya@anand.design',    joined:'Mar 5', progress:22 },
  { id:'u7', name:'Marcus Webb',      role:'Founder',                 tags:[],            email:'marcus@webb.vc',        joined:'Mar 3', progress:55 },
  { id:'u8', name:'Lena Park',        role:'Substack writer',         tags:[],            email:'lena.park@gmail.com',   joined:'Feb 22', progress:80 },
  { id:'u9', name:'Devon Clarke',     role:'Product marketer',        tags:[],            email:'devon@clarke.xyz',      joined:'Mar 6', progress:14 },
  { id:'u10', name:'Sofia Marchetti', role:'Journalist',              tags:[],            email:'sofia.m@gmail.com',     joined:'Feb 25', progress:67 },
  { id:'u11', name:'Andre Diallo',    role:'Agency owner',            tags:[],            email:'andre@diallo.agency',   joined:'Mar 7', progress:9 },
];

window.REACTION_SET = [
  { key:'thumb', emoji:'👍', label:'Like',       color:'#2D74D6' },
  { key:'heart', emoji:'❤️', label:'Love',       color:'#E0335E' },
  { key:'clap',  emoji:'👏', label:'Celebrate',  color:'#15803F' },
  { key:'fire',  emoji:'🔥', label:'Fire',       color:'#F2602A' },
  { key:'idea',  emoji:'💡', label:'Insightful', color:'#E0A100' },
  { key:'pray',  emoji:'🙏', label:'Grateful',   color:'#7A5AC2' },
];

const m = (name)=>({ name });
window.INITIAL_POSTS = [
  {
    id:'p1', author:'Mara Linwood', role:'Instructor', badges:['Admin','Team'], time:'2h',
    pinned:true, module:'m3', commentMode:'open',
    body:[
      "Prompt of the week 🔥 — rewrite a sentence you're proud of so it's 30% shorter without losing the punch.",
      "Drop the before/after below. I'll feature my three favorites in Friday's live and break down exactly why they hit harder.",
    ],
    image:{ kind:'gradient', g:'linear-gradient(120deg,#243B53,#4A6B8A)', label:'PROMPT OF THE WEEK' },
    reactions:{ fire:['Nadya Ramos','Geily Romero','Jason Hershkowitz','Lena Park'], idea:['Julie Klemens','Priya Anand'], clap:['Marcus Webb'] },
    myReaction:null,
    comments:[
      { id:'c1', author:'Nadya Ramos', role:'Moderator', time:'1h', text:"Before: \"We are committed to delivering exceptional value to our customers.\" After: \"We make things people love.\" 😅", reactions:{thumb:['Mara Linwood','Lena Park']}, replies:[
        { id:'c1r1', author:'Mara Linwood', role:'Instructor', isInstructor:true, time:'52m', text:"This is the move. The original is a press release; the rewrite is a promise. Featuring this one.", reactions:{heart:['Nadya Ramos']}, replies:[] },
      ]},
      { id:'c2', author:'Jason Hershkowitz', role:'', time:'44m', text:"Mine cut 'in order to' three times and suddenly the whole paragraph could breathe.", reactions:{}, replies:[] },
    ],
  },
  {
    id:'p3b', author:'Mara Linwood', role:'Instructor', badges:['Admin','Team'], time:'8h', module:'m2', commentMode:'open',
    body:[ "Reminder: Thursday's workshop is hands-on. Bring one sentence you can't get right and we'll fix it live." ],
    reactions:{ thumb:['Tiffany Rivera','Devon Clarke','Marcus Webb'], fire:['Lena Park'] },
    myReaction:null, comments:[], commentMode:'open',
  },
  {
    id:'p3', author:'Mara Linwood', role:'Instructor', badges:['Admin','Team'], time:'1d', module:'m1', commentMode:'open',
    body:[
      "A lot of you asked about the difference between an argument and an opinion after Lesson 3.",
      "Quick rule I use: an opinion ends a conversation, an argument earns one. If your reader can't disagree with it, it's probably just a feeling dressed up in confident words.",
    ],
    reactions:{ idea:['Geily Romero','Tiffany Rivera','Devon Clarke','Sofia Marchetti','Andre Diallo'], thumb:['Marcus Webb'], heart:['Lena Park'] },
    myReaction:'idea',
    comments:[
      { id:'c3', author:'Tiffany Rivera', role:'', time:'22h', text:"Saving this. \"An opinion ends a conversation, an argument earns one\" is going on a sticky note.", reactions:{heart:['Mara Linwood']}, replies:[] },
    ],
  },
  {
    id:'p4', author:'Mara Linwood', role:'Instructor', badges:['Admin','Team'], time:'2d', commentMode:'read-only',
    body:[
      "Welcome to everyone who joined this week 👋 We crossed 340 writers.",
      "Start in #Introductions, then your first assignment is in Module 1. No lurking — the people who post are the people who improve.",
    ],
    reactions:{ heart:['Nadya Ramos','Geily Romero','Priya Anand','Lena Park','Devon Clarke'], clap:['Julie Klemens','Marcus Webb'] },
    myReactions:[], myReaction:null, comments:[],
  },
];

window.INITIAL_SCHEDULED = [
  { id:'ps1', author:'Mara Linwood', role:'Instructor', badges:['Admin','Team'],
    scheduledFor:'Mon, Jun 9 · 9:00 AM', module:'m4',
    body:["Monday warm-up: read your draft out loud. Every place you stumble is a place your reader will too. Where did you trip? 👇"],
    reactions:{}, comments:[], commentMode:'open' },
];

window.INITIAL_EVENTS = [
  {
    id:'e1', title:'Live Workshop: Rewriting the Boring Sentence', type:'Workshop',
    date:'Thu, Jun 12', time:'1:00 – 2:00 PM EDT', tz:'EDT',
    cover:'linear-gradient(120deg,#2E5E48,#5C9170)', tagLine:'live', tagWord:'WORKSHOP',
    desc:"Bring one sentence you can't get right. We'll rewrite a dozen of them live and pull out the repeatable moves. Recording shared after.",
    link:'https://meet.spaire.co/rewrite-workshop',
    rsvps:['Nadya Ramos','Geily Romero','Julie Klemens','Jason Hershkowitz','Lena Park','Sofia Marchetti','Marcus Webb','Priya Anand'],
    capacity:50, status:'upcoming',
    reminders:{ day:true, fifteen:true, live:true, confirm:true },
  },
  {
    id:'e2', title:'Office Hours with Mara', type:'Office Hours',
    date:'Thu, Jun 19', time:'1:00 – 2:00 PM EDT', tz:'EDT',
    cover:'linear-gradient(120deg,#3E5C7A,#7299B8)', tagLine:'office', tagWord:'HOURS',
    desc:"Open Q&A. Bring anything — a stuck paragraph, a positioning problem, a pep talk request. First come, first served.",
    link:'https://meet.spaire.co/office-hours',
    rsvps:['Tiffany Rivera','Devon Clarke','Andre Diallo','Lena Park','Nadya Ramos'],
    capacity:40, status:'upcoming',
    reminders:{ day:true, fifteen:true, live:false, confirm:true },
  },
  {
    id:'e3', title:'Guest Session: Editing with Dana Okafor', type:'Guest Session',
    date:'Thu, Jun 26', time:'1:00 – 2:00 PM EDT', tz:'EDT',
    cover:'linear-gradient(120deg,#6B4E7A,#A07FB5)', tagLine:'guest', tagWord:'SESSION',
    desc:"Dana Okafor (Senior Editor, The Atlantic) on the cuts that make writing sing. Live demo on submitted drafts.",
    link:'https://meet.spaire.co/guest-dana',
    rsvps:['Julie Klemens','Sofia Marchetti','Marcus Webb','Priya Anand','Lena Park','Jason Hershkowitz','Geily Romero','Nadya Ramos','Devon Clarke','Andre Diallo','Tiffany Rivera'],
    capacity:60, status:'upcoming',
    reminders:{ day:true, fifteen:true, live:true, confirm:true },
  },
  {
    id:'e4', title:'Cohort Kickoff Call', type:'Cohort Session',
    date:'Thu, May 29', time:'1:00 – 2:00 PM EDT', tz:'EDT',
    cover:'linear-gradient(120deg,#5A5A5A,#8A8A8A)', tagLine:'cohort', tagWord:'KICKOFF',
    desc:"Where we set intentions for the cohort and met the room. Recording in Module 1 resources.",
    link:'https://meet.spaire.co/kickoff',
    rsvps:['Nadya Ramos','Geily Romero','Julie Klemens','Jason Hershkowitz','Lena Park','Sofia Marchetti','Marcus Webb','Priya Anand','Tiffany Rivera','Devon Clarke'],
    capacity:50, status:'past',
    reminders:{ day:true, fifteen:true, live:true, confirm:true },
  },
];

window.INITIAL_ACTIVITIES = [
  {
    id:'a1', title:'Rewrite a sentence you over-wrote', module:'m3', type:'text',
    visibility:'group', status:'open', dueLabel:'Due Sun, Jun 15',
    prompt:"Find one sentence in your own writing that's trying too hard. Post the before and after, and one line on what you cut and why.",
    participants:34, submissions:[
      { id:'s1', author:'Nadya Ramos', time:'3h', kind:'text', content:"Before: \"At the end of the day, what really matters most is…\"  After: \"What matters is…\"  — Cut the throat-clearing. The reader was waiting for me to start.", visibility:'group', feedback:null, status:'new' },
      { id:'s2', author:'Jason Hershkowitz', time:'5h', kind:'text', content:"Before: \"We wanted to take a moment to reach out and let you know…\"  After: \"Quick update:\"  — Eleven words to two. Nobody missed the other nine.", visibility:'group', feedback:{ text:"This is the whole course in one edit. Featuring it Friday.", time:'2h' }, status:'reviewed' },
      { id:'s3', author:'Lena Park', time:'1d', kind:'text', content:"Before: \"It is important to note that the results were largely positive.\" After: \"The results were good.\" Cut hedging — I was apologizing for good news.", visibility:'private', feedback:null, status:'new' },
      { id:'s4', author:'Tiffany Rivera', time:'1d', kind:'text', content:"Before: a 41-word run-on. After: three sentences. I realized I was scared to use periods.", visibility:'group', feedback:null, status:'new' },
    ],
  },
  {
    id:'a2', title:'Share your one-line positioning', module:'m2', type:'text',
    visibility:'group', status:'open', dueLabel:'Due Wed, Jun 18',
    prompt:"In one sentence: who do you help, and what changes for them? No jargon. If your mom wouldn't get it, rewrite it.",
    participants:19, submissions:[
      { id:'s5', author:'Geily Romero', time:'6h', kind:'text', content:"I help newsletter writers turn lurkers into repliers.", visibility:'group', feedback:null, status:'new' },
      { id:'s6', author:'Marcus Webb', time:'8h', kind:'link', content:"https://marcuswebb.co/about", visibility:'group', feedback:null, status:'new' },
    ],
  },
  {
    id:'a3', title:'Record a 60-second pitch', module:'m4', type:'video',
    visibility:'private', status:'open', dueLabel:'Due Fri, Jun 20',
    prompt:"Pitch your idea to camera in under 60 seconds. Persuade me, don't inform me. Private to you and me.",
    participants:7, submissions:[
      { id:'s7', author:'Sofia Marchetti', time:'2h', kind:'video', content:'pitch-sofia.mp4', visibility:'private', feedback:null, status:'new' },
      { id:'s8', author:'Devon Clarke', time:'1d', kind:'video', content:'pitch-devon.mp4', visibility:'private', feedback:{ text:"Strong open, lost me at 0:35 — you started explaining features. Re-record the back half and lead with the outcome.", time:'20h' }, status:'reviewed' },
    ],
  },
  {
    id:'a4', title:'Headline teardown', module:'m5', type:'photo',
    visibility:'group', status:'closed', dueLabel:'Closed Jun 1',
    prompt:"Screenshot a headline in the wild and rewrite it. Show both.",
    participants:28, submissions:[],
  },
];

// notification feed for the bell
window.NOTIFS = [
  { id:'n1', who:'Nadya Ramos', text:'commented on your prompt of the week', time:'1h', unread:true },
  { id:'n2', who:'Jason Hershkowitz', text:'submitted to "Rewrite a sentence you over-wrote"', time:'5h', unread:true },
  { id:'n3', who:'Lena Park', text:'finished Module 2', time:'5h', unread:false },
  { id:'n4', who:'Sofia Marchetti', text:'RSVP\'d to Live Workshop', time:'7h', unread:false },
];
