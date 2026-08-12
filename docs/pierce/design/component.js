
const DEALS = [
  { name:'Project Falcon', client:'Harbourline Industrial', state:'Stale', stale:true, docs:'6 documents', findings:'7 differences', checked:'Checked 2 hours ago', note:'The model changed at 11:40 today.' },
  { name:'Project Meridian', client:'Castleford Group', state:'12 to review', docs:'9 documents', findings:'12 differences', checked:'Checked 40 minutes ago' },
  { name:'Project Ashgrove', client:'Denner & Vale', state:'3 to review', docs:'4 documents', findings:'3 differences', checked:'Checked yesterday, 18:20' },
  { name:'Project Kestrel', client:'Nordhavn Logistics', state:'Clean', docs:'5 documents', checked:'Checked yesterday, 09:05' },
  { name:'Project Tolland', client:'Brightmere Capital', state:'Clean', docs:'3 documents', checked:'Checked 4 days ago' },
  { name:'Project Ridgeway', client:'Saltbrook Materials', state:'Clean', docs:'7 documents', checked:'Checked 11 days ago' }
];

const GRID = (rows) => rows.map(r => ({ ...r, hl: r.hl || 'transparent' }));

const DECK = {
  facts: [
    { label:'Figures read', value:'128 across 9 slides', fg:'#1d1d1f' },
    { label:'Traced to the model', value:'121', fg:'#1d1d1f' },
    { label:'Not traced', value:'7', fg:'#1d1d1f' },
    { label:'Checked against an older model', value:'3', fg:'#c8790a' }
  ],
  hidden: [
    { label:'Speaker notes', count:'6 slides', detail:'Slide 12: “check against v14 before Thursday”' },
    { label:'Hidden slides', count:'2', detail:'Slides 22 and 23 — an earlier valuation range' },
    { label:'Cropped images', count:'3', detail:'Slide 7 — cropped chart from Model_v13.xlsx' },
    { label:'Folder paths', count:'2', detail:'\\\\\\\\hbl-fs01\\\\Deals\\\\Falcon\\\\Working\\\\Model_v13.xlsx' }
  ],
  findings: [
    { key:'f1', title:'FY2026E EBITDA', says:'The deck says $48.9mm · the model now says $49.4mm', where:'Slide 12 · Model!D26', dot:'#ff9f0a', kind:'slide',
      explain:'The slide was checked against the 09:12 read of the model. That cell changed at 11:40.', action:'Recheck' },
    { key:'f2', title:'Equity value', says:'The deck says $1,204mm · the model says $1,187mm', where:'Slide 18 · Model!F44', dot:'#0060d0', kind:'cell',
      explain:'Same label on both sides. The difference is $17mm.', action:'Rebase',
      grid: GRID([
        { n:'42', label:'Enterprise value', value:'1,462.0' },
        { n:'43', label:'Net debt', value:'(275.0)' },
        { n:'44', label:'Equity value', value:'1,187.0', hl:'rgba(255,159,10,.28)' },
        { n:'45', label:'Fully diluted shares', value:'64.2' }
      ]) },
    { key:'f3', title:'FY2025A revenue', says:'The deck says $412.6mm · the accounts say $409.1mm', where:'Slide 9 · Management accounts p.14', dot:'#0060d0', kind:'text',
      explain:'Same label on both sides. The difference is $3.5mm.', action:'Rebase',
      before:'Revenue for the year ended 30 June 2025 was ', mark:'$409.1mm', after:', an increase of 11.2% on the prior year.' }
  ]
};

const MEMO = {
  facts: [
    { label:'Figures read', value:'64 across 12 pages', fg:'#1d1d1f' },
    { label:'Traced to the model', value:'58', fg:'#1d1d1f' },
    { label:'Not traced', value:'6', fg:'#1d1d1f' },
    { label:'Checked against an older model', value:'2', fg:'#c8790a' }
  ],
  hidden: [
    { label:'Tracked changes', count:'11', detail:'Page 4 — leverage sentence rewritten twice' },
    { label:'Comments', count:'5', detail:'Page 7: “confirm with the client before IC”' },
    { label:'Hidden text', count:'1', detail:'Page 9 — an earlier fee footnote' },
    { label:'Author names', count:'4', detail:'Whitmore, Reagan, Anand, Ferreira' }
  ],
  findings: [
    { key:'m1', title:'Total debt', says:'The memo says $275.0mm · the model says $268.4mm', where:'Page 4 · Model!C31', dot:'#0060d0', kind:'cell',
      explain:'Same label on both sides. The difference is $6.6mm.', action:'Rebase',
      grid: GRID([
        { n:'29', label:'Term loan B', value:'190.0' },
        { n:'30', label:'Revolver drawn', value:'42.4' },
        { n:'31', label:'Total debt', value:'268.4', hl:'rgba(255,159,10,.28)' },
        { n:'32', label:'Cash', value:'(31.0)' }
      ]) },
    { key:'m2', title:'FY2026E EBITDA', says:'The memo says $48.9mm · the model now says $49.4mm', where:'Page 6 · Model!D26', dot:'#ff9f0a', kind:'text',
      explain:'The sentence was checked against the 09:12 read of the model. That cell changed at 11:40.', action:'Recheck',
      before:'On a run-rate basis the business is expected to deliver ', mark:'$48.9mm', after:' of EBITDA in FY2026.' }
  ]
};

const RUN_SOURCED = {
  steps: [
    { label:'Reading the file', note:'9 slides' },
    { label:'Reading the model as it stands now', note:'v14 · 11:40' },
    { label:'Matching labels across both', note:'121 of 128' },
    { label:'Comparing the figures that matched', note:'3 differences' }
  ],
  tally: [
    { value:'128', label:'figures read', fg:'#1d1d1f' },
    { value:'121', label:'traced to the model', fg:'#1d1d1f' },
    { value:'7', label:'not traced', fg:'#1d1d1f' },
    { value:'3', label:'differences', fg:'#0060d0' }
  ],
  findings: [
    { key:'f1', title:'FY2026E EBITDA', says:'The deck says $48.9mm · the model says $49.4mm', where:'Slide 12 · Model!D26', dot:'#0060d0', action:'Rebase',
      explain:'Same label on both sides. The difference is $0.5mm.',
      aLabel:'In the deck', aValue:'$48.9mm', aWhere:'Slide 12', aSlide:true, aSlideTitle:'Trading performance',
      bLabel:'In the model', bValue:'$49.4mm', bWhere:'Model!D26', bGrid:true,
      grid: GRID([
        { n:'24', label:'Gross profit', value:'96.8' },
        { n:'25', label:'Operating costs', value:'(47.4)' },
        { n:'26', label:'FY2026E EBITDA', value:'49.4', hl:'rgba(255,159,10,.28)' },
        { n:'27', label:'Margin', value:'23.1%' }
      ]) },
    { key:'f2', title:'Equity value', says:'The deck says $1,204mm · the model says $1,187mm', where:'Slide 18 · Model!F44', dot:'#0060d0', action:'Rebase',
      explain:'Same label on both sides. The difference is $17mm.',
      aLabel:'In the deck', aValue:'$1,204mm', aWhere:'Slide 18 · equity bridge',
      bLabel:'In the model', bValue:'$1,187mm', bWhere:'Model!F44', bGrid:true,
      grid: DECK.findings[1].grid },
    { key:'f3', title:'FY2025A revenue', says:'The deck says $412.6mm · the accounts say $409.1mm', where:'Slide 9 · Management accounts p.14', dot:'#0060d0', action:'Rebase',
      explain:'Same label on both sides. The difference is $3.5mm.',
      aLabel:'In the deck', aValue:'$412.6mm', aWhere:'Slide 9',
      bLabel:'In the accounts', bValue:'$409.1mm', bWhere:'Management accounts p.14', bText:true,
      before:'Revenue for the year ended 30 June 2025 was ', mark:'$409.1mm', after:', an increase of 11.2% on the prior year.' }
  ]
};

const RUN_SOLO = {
  steps: [
    { label:'Reading the file', note:'9 slides' },
    { label:'Finding figures stated more than once', note:'14 repeated' },
    { label:'Checking that totals add up', note:'6 totals' },
    { label:'Comparing the file against itself', note:'2 differences' }
  ],
  tally: [
    { value:'128', label:'figures read', fg:'#1d1d1f' },
    { value:'14', label:'stated more than once', fg:'#1d1d1f' },
    { value:'6', label:'totals checked', fg:'#1d1d1f' },
    { value:'2', label:'differences', fg:'#0060d0' }
  ],
  findings: [
    { key:'s1', title:'FY2026E EBITDA', says:'Slide 12 says $48.9mm · slide 21 says $49.4mm', where:'Slide 12 · Slide 21', dot:'#0060d0', action:'Reconcile',
      explain:'The same label carries two figures in the same deck. Nothing outside the file was used.',
      aLabel:'Slide 12', aValue:'$48.9mm', aWhere:'Trading performance', aSlide:true, aSlideTitle:'Trading performance',
      bLabel:'Slide 21', bValue:'$49.4mm', bWhere:'Valuation summary' },
    { key:'s2', title:'Arrangement fee', says:'Slide 9 says $4.2mm · slide 21 says $4.8mm', where:'Slide 9 · Slide 21', dot:'#0060d0', action:'Reconcile',
      explain:'Both figures appear in footnotes. One of them is out of date.',
      aLabel:'Slide 9', aValue:'$4.2mm', aWhere:'Sources and uses', aText:true,
      before:'Assumes an arrangement fee of ', mark:'$4.2mm', after:' payable at close.',
      bLabel:'Slide 21', bValue:'$4.8mm', bWhere:'Fee footnote' }
  ]
};

const RUN = (s) => (s.against ? RUN_SOURCED : RUN_SOLO);

const CH = (rows) => rows.map((c, i) => ({ ...c, step: String(i + 1), rule: i === 0 ? '0' : '.5px solid #eff0f2' }));

const CHAT_EBITDA = {
  chain: CH([
    { what:'Slide 12, EBITDA row', value:'$48.9mm' },
    { what:'Model!D26 — formula, D24 less D25', value:'$49.4mm' },
    { what:'Inputs!B14 — operating costs, typed', value:'$47.4mm' },
    { what:'Management accounts, p.14', value:'$47.4mm' }
  ]),
  suggestions: ['Where does the model figure come from?', 'What changed, and when?', 'What else reads this cell?'],
  replies: [
    'The model cell is a formula, not a typed number: D26 is gross profit less operating costs.',
    'Operating costs in Inputs!B14 were replaced at 11:40 when the June accounts were pasted in. That flows straight into D26.',
    'Slides 14 and 21 read the same cell. Rebasing this figure alone would leave those two disagreeing with it.'
  ]
};

const CHAT_EQUITY = {
  chain: CH([
    { what:'Slide 18, equity bridge', value:'$1,204mm' },
    { what:'Model!F44 — formula, F42 less F43', value:'$1,187mm' },
    { what:'Model!F42 — enterprise value', value:'$1,462.0mm' },
    { what:'Model!F43 — net debt', value:'$(275.0)mm' }
  ]),
  suggestions: ['Where does the model figure come from?', 'Which side is out of date?', 'What else reads this cell?'],
  replies: [
    'F44 is a formula: enterprise value less net debt. Neither input is typed — both come from the schedules above it.',
    'The deck figure was written on 4 August, before net debt was moved to the June position. The model side is the current one.',
    'Slide 20 reads F44 as well. Rebase both or they will disagree with each other.'
  ]
};

const CHAT_REVENUE = {
  chain: CH([
    { what:'Slide 9, revenue line', value:'$412.6mm' },
    { what:'Management accounts, p.14 — stated total', value:'$409.1mm' }
  ]),
  suggestions: ['Where does the accounts figure come from?', 'Is the model involved?', 'Which side is out of date?'],
  replies: [
    'It is a stated total on page 14 of the accounts, not a calculation. Pierce read the text of the page.',
    'No. Revenue on slide 9 has no matching label in the model, so the accounts were the only source available.',
    'The accounts run to Jun-26 and were received on 1 August. The deck figure predates them.'
  ]
};

const CHAT_DEBT = {
  chain: CH([
    { what:'Page 4, leverage paragraph', value:'$275.0mm' },
    { what:'Model!C31 — formula, C29 plus C30', value:'$268.4mm' },
    { what:'Model!C29 — term loan B', value:'$190.0mm' },
    { what:'Model!C30 — revolver drawn', value:'$42.4mm' }
  ]),
  suggestions: ['Where does the model figure come from?', 'Which side is out of date?', 'What else states this figure?'],
  replies: [
    'C31 sums the two debt lines above it. Neither is typed in the memo — both come from the debt schedule.',
    'The paragraph predates the revolver being redrawn on 28 July.',
    'Page 9 states total debt again, and it agrees with the memo rather than the model.'
  ]
};

const CHAT_SOLO_EBITDA = {
  chain: CH([
    { what:'Slide 12, trading performance', value:'$48.9mm' },
    { what:'Slide 21, valuation summary', value:'$49.4mm' }
  ]),
  suggestions: ['Which slide was saved later?', 'Does any other slide state this?', 'How was the match made?'],
  replies: [
    'Slide 21 was saved two revisions after slide 12. Pierce cannot say which figure is right, only that the deck states both.',
    'No. These two slides are the only places FY2026E EBITDA appears in the file.',
    'On the label. Both slides read “FY2026E EBITDA”, so the figures are comparable. Nothing outside the file was used.'
  ]
};

const CHAT_SOLO_FEE = {
  chain: CH([
    { what:'Slide 9, sources and uses footnote', value:'$4.2mm' },
    { what:'Slide 21, fee footnote', value:'$4.8mm' }
  ]),
  suggestions: ['Which slide was saved later?', 'Where exactly do these appear?', 'How was the match made?'],
  replies: [
    'Slide 21 was saved later than slide 9.',
    'Both are footnotes — one under the sources and uses table, one under the fee summary.',
    'On the label. Both read “arrangement fee”. Nothing outside the file was used.'
  ]
};

const SP = {
  '': [
    { name:'Investment Banking' },
    { name:'Corporate Finance' }
  ],
  'Investment Banking': [
    { name:'Deals' },
    { name:'Coverage' },
    { name:'_templates', dim:true, sub:'3 files' }
  ],
  'Investment Banking/Deals': [
    { name:'Falcon' },
    { name:'Meridian' },
    { name:'Ashgrove' },
    { name:'Tolland_2024', dim:true },
    { name:'_templates', sub:'5 files', dim:true }
  ],
  'Corporate Finance': [
    { name:'Restructuring' },
    { name:'ECM' }
  ],
  'Investment Banking/Coverage': [
    { name:'Industrials', sub:'22 files' },
    { name:'Consumer', sub:'17 files' }
  ]
};

const FOLDER_INFO = {
  Falcon: { files:8, sheets:2, decks:4, other:2, models:['Falcon_Operating_Model_v14.xlsx', 'Falcon_Working_v3.xlsx'] },
  Meridian: { files:11, sheets:3, decks:5, other:3, models:['Meridian_Model_v9.xlsx', 'Meridian_Sensitivities.xlsx', 'Meridian_Comps.xlsx'] },
  Ashgrove: { files:4, sheets:1, decks:2, other:1, models:['Ashgrove_Model_v2.xlsx'] },
  Tolland_2024: { files:6, sheets:1, decks:3, other:2, models:['Tolland_Model_v7.xlsx'], stale:'last changed 14 months ago' }
};

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

const FILES = {
  Falcon: [
    { name:'Falcon Operating Model v14', kind:'xls', sub:'Edited 11:40 today' },
    { name:'Falcon Working Model', kind:'xls', sub:'Edited yesterday' },
    { name:'Falcon Management Presentation', kind:'ppt', sub:'Edited 2 hours ago' },
    { name:'Falcon Valuation Summary', kind:'ppt', sub:'Edited yesterday' },
    { name:'Falcon Committee Deck', kind:'ppt', sub:'Edited 4 August' },
    { name:'Falcon Teaser', kind:'ppt', sub:'Edited 4 days ago' },
    { name:'Falcon IC Memo', kind:'doc', sub:'Edited 20 minutes ago' },
    { name:'Falcon disclosure schedule', kind:'mail', sub:'Received 1 August' }
  ],
  Meridian: [
    { name:'Meridian Model v9', kind:'xls', sub:'Edited 40 minutes ago' },
    { name:'Meridian Sensitivities', kind:'xls', sub:'Edited yesterday' },
    { name:'Meridian Comps', kind:'xls', sub:'Edited 3 August' },
    { name:'Meridian Management Presentation', kind:'ppt', sub:'Edited today' },
    { name:'Meridian Valuation Summary', kind:'ppt', sub:'Edited yesterday' },
    { name:'Meridian Board Update', kind:'ppt', sub:'Edited 5 August' },
    { name:'Meridian Teaser', kind:'ppt', sub:'Edited 2 August' },
    { name:'Meridian Process Letter', kind:'ppt', sub:'Edited 1 August' },
    { name:'Meridian IC Memo', kind:'doc', sub:'Edited yesterday' },
    { name:'Meridian NDA', kind:'doc', sub:'Edited 28 July' },
    { name:'Meridian diligence request', kind:'mail', sub:'Received 30 July' }
  ],
  Ashgrove: [
    { name:'Ashgrove Model v2', kind:'xls', sub:'Edited yesterday' },
    { name:'Ashgrove Teaser', kind:'ppt', sub:'Edited Tuesday' },
    { name:'Ashgrove Management Presentation', kind:'ppt', sub:'Edited 2 August' },
    { name:'Ashgrove IC Memo', kind:'doc', sub:'Edited 1 August' }
  ],
  Tolland_2024: [
    { name:'Tolland Model v7', kind:'xls', sub:'Edited 14 months ago' },
    { name:'Tolland Management Presentation', kind:'ppt', sub:'Edited 14 months ago' },
    { name:'Tolland Valuation Summary', kind:'ppt', sub:'Edited 15 months ago' },
    { name:'Tolland Teaser', kind:'ppt', sub:'Edited 15 months ago' },
    { name:'Tolland IC Memo', kind:'doc', sub:'Edited 14 months ago' },
    { name:'Tolland closing note', kind:'mail', sub:'Received 15 months ago' }
  ]
};

Object.keys(FILES).forEach(k => { SP['Investment Banking/Deals/' + k] = FILES[k]; });

Object.keys(FOLDER_INFO).forEach(k => {
  const i = FOLDER_INFO[k];
  i.sub = plural(i.files, 'file', 'files') + ' · ' + plural(i.sheets, 'spreadsheet', 'spreadsheets')
    + ', ' + plural(i.decks, 'deck', 'decks') + ', ' + i.other + ' other';
  i.short = i.stale ? i.stale.charAt(0).toUpperCase() + i.stale.slice(1) : plural(i.files, 'file', 'files');
});

const AUDIT_RULES = [
  'Hardcoded values in formula rows',
  'Formulas inconsistent across a row',
  'Broken or external links',
  'Sign flips between schedules',
  'Circular references',
  'Sum ranges that miss a row',
  'Inputs typed into calculation cells',
  'Duplicated line items',
  'Unused inputs',
  'Growth rates outside a set range'
];

const DEAL_CHAT = {
  chain: [],
  suggestions: [
    'Which three figures went stale in the presentation?',
    'What changed when the model updated at 11:40?',
    'Why did Priya keep $48.9mm on slide 12?'
  ],
  replies: [
    'FY2026E EBITDA on slide 12, the margin on slide 14 and the valuation range on slide 21. All three read cells that moved when v14 was saved.',
    'Two cells: operating costs in Inputs!B14 and net debt in Model!F43. Between them they touch seven figures across the presentation, the IC memo and the valuation summary.',
    'Her note on the decision log reads: different figure to the model — pre-IFRS 16 EBITDA, agreed with the client. She kept it an hour ago.'
  ]
};

const FILE_CHAT = {
  chain: [],
  suggestions: [
    'What even is a very hidden sheet?',
    'Does this actually matter?',
    'How do I get rid of it?'
  ],
  replies: [
    'A sheet hidden so it does not show in the tab list or the unhide menu. It can only be revealed from the VBA window, so most people never know it is in the file — but it travels with the file.',
    'It depends who receives it. The contents are readable by anyone who opens the file properly, so treat it as sent.',
    'In PowerPoint: File, then Info, then Check for Issues, then Inspect Document. Tick hidden content and remove it. Save a copy first — the removal cannot be undone.',
    'I only have this one file — that is a question for a deal.'
  ]
};

const SCOPE = (s) => (s.view === 'check' ? FILE_CHAT : DEAL_CHAT);

const DEAL_INTENT = /\\bwe\\b|\\bour\\b|falcon|meridian|ashgrove|kestrel|tolland|ridgeway|the model|model!|accounts|memo|deal|slide 4|decided|decision|kept|keep|who |other document|elsewhere/i;

const BOUNDARY = 'I only have this one file \\u2014 that\\u2019s a question for a deal. Open Falcon in the workspace and I can answer it there.';

const FILE_TOPICS = [
  { re: /hidden|very hidden|sheet|slide|speaker note|note/i, i: 0 },
  { re: /matter|serious|risk|care|important|recipient|see|read/i, i: 1 },
  { re: /remove|get rid|delete|strip|clean|fix|how do i/i, i: 2 }
];

const pickReply = (c, text, n, isFile) => {
  if (isFile) {
    const topic = FILE_TOPICS.find(t => t.re.test(text));
    if (topic) return c.replies[topic.i];
    if (DEAL_INTENT.test(text)) return BOUNDARY;
  }
  return c.replies[n % c.replies.length];
};

const KEYCHAT = { f1: CHAT_EBITDA, f2: CHAT_EQUITY, f3: CHAT_REVENUE, m1: CHAT_DEBT, m2: CHAT_EBITDA, s1: CHAT_SOLO_EBITDA, s2: CHAT_SOLO_FEE };

const PANEL = (s) => (s.doc && s.doc.kind === 'doc' ? MEMO : DECK);

const LABELS = { deals:'Deals', check:'Check a file', settings:'Settings', account:'Account' };

class Component extends DCLogic {
  state = { view: 'deals', deal: null, doc: null, finding: null,
    cPhase: 'idle', cStep: 0, cFinding: null,
    chat: null, chatMsgs: [], prompt: '', asked: 0, against: null, menuOpen: false, sTab: 'conn', round: 'Group separately', write: { range: '$455–528mm', fy: 'FY2025A', unit: 'mm', neg: '(139.2)' },
    acctOpen: false, conn: 'none', newOpen: false, ndStep: 'browse', ndPath: ['Investment Banking', 'Deals'], ndPicks: [], ndMeta: {}, ndStep2: 0, inviteOpen: false, inviteEmail: '', invitePicks: ['Project Falcon'],
    sw: { grounding: true, audit: true }, auditOpen: false, offRules: ['Growth rates outside a set range'] };
  go = (v) => () => { this.clearChatTimer(); this.setState({ view: v, doc: null, finding: null, chat: null, chatMsgs: [], asked: 0, prompt: '' }); };
  clearChatTimer = () => { if (this.ctimer) { clearTimeout(this.ctimer); this.ctimer = null; } };
  ndReady = () => {
    const s = this.state;
    if (s.ndStep === 'browse') return s.ndPicks.length > 0;
    if (s.ndStep === 'confirm') return s.ndPicks.every(p => ((s.ndMeta[p] || {}).client || '').trim());
    return true;
  };
  ndSteps = () => {
    const picks = this.state.ndPicks.map(p => FOLDER_INFO[p.split('/').pop()]).filter(Boolean);
    const files = picks.reduce((t, i) => t + i.files, 0);
    return [
      { label:'Syncing the folders', note: plural(files, 'file', 'files') },
      { label:'Reading the models', note: plural(picks.length, 'model', 'models') },
      { label:'Matching figures across the documents', note:'first pass' }
    ];
  };
  clearNdTimer = () => { if (this.ndtimer) { clearInterval(this.ndtimer); clearTimeout(this.ndtimer); this.ndtimer = null; } };
  newChatSilent = () => { this.clearChatTimer(); this.setState({ chat: null, chatMsgs: [], asked: 0 }); };
  openChat = (f) => {
    const c = KEYCHAT[f.key];
    this.clearChatTimer();
    this.setState({
      chat: { title: f.title, where: f.where, chat: c },
      prompt: '', asked: 0,
      chatMsgs: [{ role:'working', text:'Reading the chain' }]
    });
    this.ctimer = setTimeout(() => this.setState({
      chatMsgs: [
        { role:'tools', text:'Followed ' + c.chain.length + ' steps' },
        { role:'agent', text: f.says + '. ' + f.explain },
        { role:'chain', chain: c.chain }
      ]
    }), 1100);
  };
  ask = (text) => {
    const t = (text || '').trim();
    if (!t) return;
    this.clearChatTimer();
    const c = this.state.chat ? this.state.chat.chat : SCOPE(this.state);
    const n = this.state.asked;
    this.setState(st => ({ prompt: '', asked: st.asked + 1,
      chatMsgs: st.chatMsgs.concat({ role:'user', text: t }, { role:'working', text:'Checking' }) }));
    this.ctimer = setTimeout(() => this.setState(st => ({
      chatMsgs: st.chatMsgs.slice(0, -1).concat({ role:'agent', text: pickReply(c, t, n, this.state.view === 'check' && !this.state.chat) })
    })), 1300);
  };
  stopRun = () => { if (this.timer) { clearInterval(this.timer); this.timer = null; } };
  componentWillUnmount() { this.stopRun(); this.clearChatTimer(); this.clearNdTimer(); }
  renderVals() {
    const s = this.state;
    const on = (k) => s.view === k ? '#ffffff' : 'transparent';
    const ink = (k) => s.view === k ? '#0060d0' : '#5b6068';
    const fw = (k) => s.view === k ? 600 : 400;
    const sh = (k) => s.view === k ? '0 2px 8px rgba(16,20,28,.14)' : 'none';
    return {
      vDealsList: s.view === 'deals' && !s.deal && !this.props.notConnected,
      vDealsEmpty: s.view === 'deals' && !s.deal && !!this.props.notConnected,
      hasDeal: s.view === 'deals' && !!s.deal,
      noDeal: !(s.view === 'deals' && !!s.deal),
      back: () => this.setState({ deal: null, doc: null, finding: null }),
      dealName: s.deal ? s.deal.name : '',
      dealClient: s.deal ? s.deal.client : '',
      dealStale: !!(s.deal && s.deal.stale),
      dealSources: [
        { name:'Falcon Operating Model v14', sub:'Shared Models · read 09:12 today', state:'Changed 11:40', fg:'#c8790a', rule:'0' },
        { name:'Management accounts to Jun-26', sub:'Falcon — Deal Documents · read yesterday', state:'Current', fg:'#86868b', rule:'.5px solid #eceaec' }
      ],
      dealDocs: [
        { name:'Falcon IC Memo', sub:'Priya Anand · edited 20 minutes ago', kind:'doc', state:'4 differences', fg:'#0060d0' },
        { name:'Falcon Management Presentation', sub:'You · edited 2 hours ago', kind:'ppt', state:'3 stale', fg:'#c8790a' },
        { name:'Falcon Valuation Summary', sub:'Tom Reagan · edited yesterday', kind:'ppt', state:'Clean', fg:'#34c759' },
        { name:'Falcon Working Model', sub:'Jack Ferreira · edited yesterday', kind:'xls', state:'Clean', fg:'#34c759' },
        { name:'Falcon disclosure schedule', sub:'Received 1 August', kind:'mail', state:'Clean', fg:'#34c759' },
        { name:'Falcon Teaser', sub:'You · edited 4 days ago', kind:'doc', state:'Clean', fg:'#34c759' }
      ].map((d, i) => ({ ...d, rule: i === 0 ? '0' : '.5px solid #eceaec',
        isPpt: d.kind === 'ppt', isDoc: d.kind === 'doc', isXls: d.kind === 'xls', isMail: d.kind === 'mail',
        rowBg: s.doc && s.doc.name === d.name ? '#eef1f6' : 'transparent',
        open: () => this.setState({ doc: d, finding: null }) })),
      docOpen: s.view === 'deals' && !!s.deal && !!s.doc,
      closeDoc: () => this.setState({ doc: null, finding: null }),
      docName: s.doc ? s.doc.name : '',
      docIsPpt: !!(s.doc && s.doc.kind === 'ppt'),
      docIsDoc: !!(s.doc && s.doc.kind === 'doc'),
      docIsXls: !!(s.doc && s.doc.kind === 'xls'),
      docIsMail: !!(s.doc && s.doc.kind === 'mail'),
      docOpenLabel: s.doc ? ({ ppt:'Open in PowerPoint', doc:'Open in Word', xls:'Open in Excel', mail:'Open in Outlook' })[s.doc.kind] : '',
      docFacts: PANEL(s).facts.map((f, i) => ({ ...f, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      docVersions: [
        { tag:'v5', what:'3 figures moved', when:'Today, 09:20' },
        { tag:'v4', what:'Valuation section added', when:'Yesterday' },
        { tag:'v3', what:'First full draft', when:'4 August' }
      ].map((v, i) => ({ ...v, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      docHidden: PANEL(s).hidden.map((h, i) => ({ ...h, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      docFindings: PANEL(s).findings.map(f => ({ ...f, open: s.finding === f.key,
        cardBg: s.finding === f.key ? 'rgba(255,255,255,.62)' : '#fff',
        cardBlur: s.finding === f.key ? 'blur(30px) saturate(1.8)' : 'none',
        cardBd: s.finding === f.key ? '1px solid rgba(255,255,255,.95)' : '0',
        cardRadius: s.finding === f.key ? '17px' : '13px',
        cardSh: s.finding === f.key
          ? '0 16px 40px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.05), inset 0 1px 0 rgba(255,255,255,.95)'
          : '0 1px 2px rgba(0,0,0,.05), 0 0 0 .5px rgba(0,0,0,.06)',
        isSlide: f.kind === 'slide', isCell: f.kind === 'cell', isText: f.kind === 'text',
        toggle: () => { const closing = this.state.finding === f.key; this.setState({ finding: closing ? null : f.key }); if (closing) { this.newChatSilent(); } else { this.openChat(f); } } })),
      dealLog: [
        { initials:'PA', bg:'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg:'#275c39', text:'Kept $48.9mm on slide 12. Different figure to the model — pre-IFRS 16 EBITDA, agreed with the client.', when:'Priya Anand · 1 hour ago' },
        { initials:'TR', bg:'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg:'#8a4526', text:'Rebased the equity bridge on slide 18 to the v14 model.', when:'Tom Reagan · yesterday, 19:40' },
        { initials:'JF', bg:'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg:'#553a7a', text:'Fixed the Schedule 7 cross-reference in the memo. It pointed at Schedule 6.', when:'Jack Ferreira · yesterday, 16:05' },
        { initials:'EW', bg:'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg:'#2c4a80', text:'Connected the management accounts folder.', when:'You · 2 days ago' }
      ].map((l, i) => ({ ...l, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      vCheck: s.view === 'check',
      cIdle: s.cPhase === 'idle' && !this.props.notConnected,
      cFirst: s.cPhase === 'idle' && !!this.props.notConnected,
      cRunning: s.cPhase === 'running',
      cDone: s.cPhase === 'done',
      cAgainst: (s.cPhase === 'running' ? 'Checking ' : 'Checked ') + (s.against ? 'against ' + s.against : 'on its own'),
      cPct: Math.round((s.cStep / RUN(s).steps.length) * 100) + '%',
      cSteps: RUN(s).steps.map((st, i) => ({
        label: st.label,
        note: i < s.cStep ? st.note : '',
        done: i < s.cStep, now: i === s.cStep, wait: i > s.cStep,
        fg: i <= s.cStep ? '#1d1d1f' : '#aeaeb2'
      })),
      cTally: RUN(s).tally,
      cStart: () => {
        this.stopRun();
        this.setState({ cPhase: 'running', cStep: 0 });
        const n = RUN(this.state).steps.length;
        this.timer = setInterval(() => this.setState(st => {
          if (st.cStep + 1 >= n) { this.stopRun(); return { cPhase: 'done', cStep: n }; }
          return { cStep: st.cStep + 1 };
        }), 950);
      },
      cCancel: () => { this.stopRun(); this.setState({ cPhase: 'idle', cStep: 0 }); },
      cReset: () => this.setState({ cPhase: 'idle', cStep: 0, cFinding: null }),
      cSourced: !!s.against,
      mainOpen: !(s.view === 'deals' && s.deal && s.doc && s.chat),
      chatOpen: ((s.view === 'deals' && !!s.deal) || (s.view === 'check' && s.cPhase === 'done')) && !(s.view === 'deals' && s.deal && s.doc && !s.chat),
      chatTitle: s.chat ? s.chat.title : (s.view === 'check' ? 'Falcon Management Presentation' : (s.deal ? s.deal.name : 'Pierce')),
      chatWhere: s.chat ? s.chat.where : (s.view === 'check' ? 'This file only' : 'This deal · 6 documents, the model and the decision log'),
      chatHasWhere: true,
      chatEmpty: s.chatMsgs.length === 0,
      chatGreeting: s.view === 'check' ? 'Ask me about this file.' : 'Ask me about Falcon.',
      chatFresh: s.asked === 0 && (!s.chat || s.chatMsgs.length > 1),
      newChat: () => { this.clearChatTimer(); this.setState({ chat: null, chatMsgs: [], asked: 0, prompt: '' }); },
      chatMsgs: s.chatMsgs.map(m => ({ ...m,
        isUser: m.role === 'user', isAgent: m.role === 'agent', isChain: m.role === 'chain',
        isTools: m.role === 'tools', isWorking: m.role === 'working' })),
      chatSuggestions: (s.chat ? s.chat.chat.suggestions : SCOPE(s).suggestions).map(text => ({ text, ask: () => this.ask(text) })),
      prompt: s.prompt,
      setPrompt: (e) => this.setState({ prompt: e.target.value }),
      onKey: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.ask(this.state.prompt); } },
      send: () => this.ask(this.state.prompt),
      cFindings: RUN(s).findings.map(f => ({ ...f, open: s.cFinding === f.key,
        cardBg: s.cFinding === f.key ? 'rgba(255,255,255,.62)' : '#fff',
        cardBlur: s.cFinding === f.key ? 'blur(30px) saturate(1.8)' : 'none',
        cardBd: s.cFinding === f.key ? '1px solid rgba(255,255,255,.95)' : '0',
        cardRadius: s.cFinding === f.key ? '17px' : '13px',
        cardSh: s.cFinding === f.key
          ? '0 16px 40px rgba(16,20,28,.18), 0 0 0 1px rgba(16,20,28,.05), inset 0 1px 0 rgba(255,255,255,.95)'
          : '0 1px 2px rgba(0,0,0,.05), 0 0 0 .5px rgba(0,0,0,.06)',
        toggle: () => { const closing = this.state.cFinding === f.key; this.setState({ cFinding: closing ? null : f.key }); if (closing) { this.newChatSilent(); } else { this.openChat(f); } } })),
      vSettings: s.view === 'settings',
      vOther: s.view !== 'deals' && s.view !== 'check' && s.view !== 'settings',
      sTabs: [
        { key:'conn', label:'Connections' },
        { key:'rules', label:'House rules' },
        { key:'people', label:'People' }
      ].map(t => ({ ...t, bg: s.sTab === t.key ? '#ffffff' : 'transparent', sh: s.sTab === t.key ? '0 2px 8px rgba(16,20,28,.14)' : 'none', fw: s.sTab === t.key ? 600 : 400, fg: s.sTab === t.key ? '#0060d0' : '#5b6068', go: () => this.setState({ sTab: t.key }) })),
      sConn: s.sTab === 'conn',
      sRules: s.sTab === 'rules',
      sPeople: s.sTab === 'people',
      connNone: s.conn === 'none',
      connWait: s.conn === 'wait',
      connDone: s.conn === 'done',
      connBack: () => { this.clearNdTimer(); this.setState({ conn: 'none' }); },
      connect: () => { this.setState({ conn: 'wait' }); this.clearNdTimer(); this.ndtimer = setTimeout(() => this.setState({ conn: 'done' }), 1600); },
      newOpen: s.newOpen,
      openNew: () => this.setState({ newOpen: true, ndStep: 'browse', ndPath: ['Investment Banking', 'Deals'], ndPicks: [], ndMeta: {}, ndStep2: 0 }),
      closeNew: () => { this.clearNdTimer(); this.setState({ newOpen: false }); },
      ndBrowse: s.ndStep === 'browse',
      ndConfirm: s.ndStep === 'confirm',
      ndRunning: s.ndStep === 'running',
      ndHead: s.ndStep === 'browse' ? 'Choose folders' : (s.ndStep === 'confirm' ? (s.ndPicks.length > 1 ? s.ndPicks.length + ' new deals' : 'New deal') : 'Setting up'),
      ndCrumbs: ['SharePoint'].concat(s.ndPath).map((name, i, arr) => ({
        name, more: i < arr.length - 1,
        fw: i === arr.length - 1 ? 600 : 400,
        fg: i === arr.length - 1 ? '#1d1d1f' : '#0060d0',
        go: () => this.setState({ ndPath: s.ndPath.slice(0, i) })
      })),
      ndRows: (SP[s.ndPath.join('/')] || []).map((r, i) => {
        const path = s.ndPath.concat(r.name).join('/');
        const on = s.ndPicks.indexOf(path) !== -1;
        return { name: r.name, rule: i === 0 ? '0' : '.5px solid #eceaec',
          sub: r.sub || (FOLDER_INFO[r.name] ? FOLDER_INFO[r.name].short : (SP[path] ? plural(SP[path].length, 'folder', 'folders') : '')),
          folderFill: r.dim ? '#c7c7cc' : '#5aa9f0',
          isFolder: !r.kind, isFile: !!r.kind,
          cursor: r.kind ? 'default' : 'pointer', hoverBg: r.kind ? 'transparent' : '#f7f7f9',
          isPpt: r.kind === 'ppt', isDoc: r.kind === 'doc', isXls: r.kind === 'xls', isMail: r.kind === 'mail',
          on, fg: r.dim ? '#86868b' : '#1d1d1f',
          boxBg: on ? '#0060d0' : 'transparent', boxBd: on ? '#0060d0' : '#c7c7cc',
          tick: () => { if (r.kind) return; this.setState(st => ({ ndPicks: st.ndPicks.indexOf(path) !== -1 ? st.ndPicks.filter(p => p !== path) : st.ndPicks.concat(path) })); },
          open: () => this.setState({ ndPath: s.ndPath.concat(r.name) }) };
      }),
      ndPicked: s.ndPicks.map(path => {
        const parts = path.split('/');
        const name = parts[parts.length - 1];
        const info = FOLDER_INFO[name] || { sub: '', models: [] };
        const meta = s.ndMeta[path] || {};
        return { name, path: '/' + path + '/', sub: info.sub,
          client: meta.client || '',
          setClient: (e) => { const v = e.target.value; this.setState(st => ({ ndMeta: { ...st.ndMeta, [path]: { ...(st.ndMeta[path] || {}), client: v } } })); },
          needsModel: info.models.length > 1,
          models: info.models.map(m => {
            const on = (meta.model || info.models[0]) === m;
            return { name: m, on, fg: on ? '#1d1d1f' : '#8a8a8e',
              pick: () => this.setState(st => ({ ndMeta: { ...st.ndMeta, [path]: { ...(st.ndMeta[path] || {}), model: m } } })) };
          }) };
      }),
      ndSteps: this.ndSteps().map((st, i) => ({ label: st.label, note: i < s.ndStep2 ? st.note : '', rule: i === 0 ? '0' : '.5px solid #e6e6ea',
        done: i < s.ndStep2, now: i === s.ndStep2, wait: i > s.ndStep2,
        fg: i <= s.ndStep2 ? '#1d1d1f' : '#aeaeb2' })),
      ndBackLabel: s.ndStep === 'confirm' ? 'Back' : (s.ndStep === 'running' ? 'Close' : 'Cancel'),
      ndBack: () => {
        if (s.ndStep === 'confirm') this.setState({ ndStep: 'browse' });
        else { this.clearNdTimer(); this.setState({ newOpen: false }); }
      },
      ndNextLabel: s.ndStep === 'browse' ? 'Next' : (s.ndStep === 'confirm' ? 'Create' : 'Done'),
      ndNextInk: this.ndReady() ? '#0060d0' : '#c4c4c9',
      ndNextCur: this.ndReady() ? 'pointer' : 'default',
      ndNext: () => {
        if (!this.ndReady()) return;
        if (s.ndStep === 'browse') { this.setState({ ndStep: 'confirm' }); return; }
        if (s.ndStep === 'confirm') {
          this.setState({ ndStep: 'running', ndStep2: 0 });
          this.clearNdTimer();
          const n = this.ndSteps().length;
          this.ndtimer = setInterval(() => this.setState(st => {
            if (st.ndStep2 + 1 >= n) { this.clearNdTimer(); return { ndStep2: n }; }
            return { ndStep2: st.ndStep2 + 1 };
          }), 900);
          return;
        }
        this.clearNdTimer();
        this.setState({ newOpen: false });
      },
      inviteOpen: s.inviteOpen,
      openInvite: () => this.setState({ inviteOpen: true }),
      closeInvite: () => this.setState({ inviteOpen: false }),
      inviteEmail: s.inviteEmail,
      setEmail: (e) => this.setState({ inviteEmail: e.target.value }),
      inviteDeals: DEALS.map((d, i) => {
        const on = s.invitePicks.indexOf(d.name) !== -1;
        return { name: d.name, on, rule: i === 0 ? '0' : '.5px solid #f0eff1',
          boxBg: on ? '#0060d0' : 'transparent', boxBd: on ? '#0060d0' : '#d4d4d8',
          flip: () => this.setState(st => ({ invitePicks: st.invitePicks.indexOf(d.name) !== -1 ? st.invitePicks.filter(n => n !== d.name) : st.invitePicks.concat(d.name) })) };
      }),
      rounding: ['List with everything else', 'Group separately'].map(label => {
        const on = s.round === label;
        return { label, bg: on ? '#fff' : 'transparent', sh: on ? '0 2px 8px rgba(16,20,28,.14)' : 'none', fg: on ? '#0060d0' : '#5b6068', fw: on ? 600 : 400,
          pick: () => this.setState({ round: label }) };
      }),
      writing: [
        { key:'range', name:'Ranges', opts:['$455–528mm', '$455mm to $528mm'] },
        { key:'fy', name:'Fiscal years', opts:['FY2025A', 'FY25A'] },
        { key:'unit', name:'Units', opts:['mm', 'm', 'million'] },
        { key:'neg', name:'Negatives', opts:['(139.2)', '−139.2'] }
      ].map((w, i) => ({
        name: w.name, rule: i === 0 ? '0' : '.5px solid #eceaec',
        opts: w.opts.map(label => {
          const on = s.write[w.key] === label;
          return { label, bg: on ? '#fff' : 'transparent', sh: on ? '0 2px 8px rgba(16,20,28,.14)' : 'none', fg: on ? '#0060d0' : '#5b6068', fw: on ? 500 : 400,
            pick: () => this.setState(st => ({ write: { ...st.write, [w.key]: label } })) };
        })
      })),
      checks: [
        { key:'grounding', name:'Model inputs against sources', sub:'Typed inputs traced back to the audited accounts' },
        { key:'audit', name:'Model audit rules', sub:'Hardcodes, broken links, formulas that break across a row', hasRules:true }
      ].map(x => {
        const on = s.sw[x.key];
        return { ...x, track: on ? '#34c759' : '#e9e9eb', justify: on ? 'flex-end' : 'flex-start',
          hasRules: !!x.hasRules,
          rulesLabel: (AUDIT_RULES.length - s.offRules.length) + ' of ' + AUDIT_RULES.length + ' rules',
          showRules: !!x.hasRules && s.auditOpen && on,
          expand: () => this.setState(st => ({ auditOpen: !st.auditOpen })),
          flip: () => this.setState(st => ({ sw: { ...st.sw, [x.key]: !st.sw[x.key] } })) };
      }),
      auditRules: AUDIT_RULES.map(name => {
        const on = s.offRules.indexOf(name) === -1;
        return { name, on, boxBg: on ? '#0060d0' : 'transparent', boxBd: on ? '#0060d0' : '#c7c7cc', fg: on ? '#1d1d1f' : '#86868b',
          flip: () => this.setState(st => ({ offRules: st.offRules.indexOf(name) === -1 ? st.offRules.concat(name) : st.offRules.filter(n => n !== name) })) };
      }),
      soonChecks: [
        { name:'Cross-references', sub:'Schedule and exhibit numbers that point at the wrong place' },
        { name:'Defined terms', sub:'Terms used before they are defined, or never defined' },
        { name:'House style', sub:'Ranges, units and negatives written the firm’s way' }
      ],
      team: [
        { name:'Elena Whitmore', initials:'EW', role:'You', deals:'All six deals', bg:'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg:'#2c4a80' },
        { name:'Tom Reagan', initials:'TR', role:'Vice President', deals:'Falcon, Meridian, Kestrel', bg:'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg:'#8a4526' },
        { name:'Priya Anand', initials:'PA', role:'Associate', deals:'Falcon, Ashgrove', bg:'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg:'#275c39' },
        { name:'Jack Ferreira', initials:'JF', role:'Analyst', deals:'Falcon', bg:'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg:'#553a7a' }
      ].map((x, i) => ({ ...x, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      menuOpen: s.menuOpen,
      toggleMenu: () => this.setState(st => ({ menuOpen: !st.menuOpen })),
      closeMenu: () => this.setState({ menuOpen: false }),
      pickedName: s.against ? DEALS.find(d => d.name === s.against).name : 'Nothing selected',
      pickedInk: s.against ? '#1d1d1f' : '#8e8e93',
      against: DEALS.map(d => ({
        name: d.name,
        on: s.against === d.name,
        pick: () => this.setState(st => ({ against: st.against === d.name ? null : d.name, menuOpen: false }))
      })),
      recent: [
        { name:'Kestrel Committee Deck', ext:'pptx', sub:'Checked against Project Kestrel', when:'Yesterday' },
        { name:'Ashgrove Teaser', ext:'docx', sub:'Checked on its own', when:'Tuesday' },
        { name:'Tolland Operating Model', ext:'xlsx', sub:'Checked against Project Tolland', when:'2 August' },
        { name:'Falcon disclosure schedule', ext:'msg', sub:'Checked against Project Falcon', when:'1 August' }
      ].map((r, i) => {
        const ext = r.ext;
        return { ...r, rule: i === 0 ? '0' : '.5px solid #eceaec',
          isPpt: ext === 'pptx', isDoc: ext === 'docx', isXls: ext === 'xlsx', isMail: ext === 'msg' };
      }),
      tabLabel: LABELS[s.view],
      summary: 'Six live deals. Falcon went stale two hours ago.',
      goDeals: this.go('deals'), goCheck: this.go('check'), goSettings: this.go('settings'),
      goAccount: () => this.setState(st => ({ acctOpen: !st.acctOpen })),
      acctOpen: s.acctOpen,
      closeAcct: () => this.setState({ acctOpen: false }),
      acctItems: [
        { label:'Notifications', fg:'#1d1d1f', go: () => this.setState({ acctOpen: false }) },
        { label:'Settings', fg:'#1d1d1f', go: () => this.setState({ acctOpen: false, view:'settings' }) },
        { label:'Sign out', fg:'#ff3b30', go: () => this.setState({ acctOpen: false }) }
      ],
      dock: { deals:on('deals'), check:on('check'), settings:on('settings'), account:on('account') },
      dockInk: { deals:ink('deals'), check:ink('check'), settings:ink('settings') },
      dockFw: { deals:fw('deals'), check:fw('check'), settings:fw('settings') },
      dockSh: { deals:sh('deals'), check:sh('check'), settings:sh('settings') },
      open: DEALS.filter(d => d.findings).map((d, i) => ({
        ...d,
        sub: d.stale ? d.note : [d.client, d.docs].join(' · '),
        dot: d.stale ? '#ff9f0a' : '#0060d0',
        stateFg: d.stale ? '#c8790a' : '#0060d0',
        stateFw: 500,
        rule: i === 0 ? '0' : '.5px solid #eceaec',
        go: () => this.setState({ deal: d })
      })),
      clean: DEALS.filter(d => !d.findings).map((d, i) => ({
        ...d,
        sub: [d.client, d.docs].join(' · '),
        rule: i === 0 ? '0' : '.5px solid #eceaec',
        go: () => this.setState({ deal: d })
      }))
    };
  }
}
<\u002Fscript>


<\u002Fbody><\u002Fhtml>"
  