const DEALS = [
  { name:'Northbank Bid Model', client:'Ollie Fenwick · version 22', file:'Northbank_Bid_Model_v22.xlsx', findings:true,
    state:'11 checks fail', dot:'#e8a33d', stateFg:'#c8790a', checked:'Checked Tuesday 11:52',
    since:'Model changed Tuesday 11:40. Two of the eleven failures are new since then.',
    line:'36 checks pass, 11 don\'t · checked Tuesday 11:52', pass:36, notRun:5, ver:'v22', docs:4, locker:4, failCount:11, main:true },
  { name:'Calder Rail Concession', client:'Priya Anand · version 8', file:'Calder_Concession_Model_v8.xlsx', findings:true,
    state:'4 checks fail', dot:'#e8a33d', stateFg:'#c8790a', checked:'Checked 09:15 today',
    since:'Saved twice since you last looked on Monday. The debt schedule moved both times.',
    line:'39 of 43 checks pass · checked 09:15 today', pass:39, notRun:2, ver:'v8', docs:0, locker:0, failCount:4 },
  { name:'Sefton Water AMP8', client:'Jack Ferreira · version 31', file:'Sefton_AMP8_Model_v31.xlsx', findings:true,
    state:'Changed since check', dot:'#0060d0', stateFg:'#0060d0', checked:'Last checked Friday',
    since:'Saved 40 minutes ago, so Friday\u2019s verdict no longer stands.',
    line:'Last verdict: 44 of 44 checks passed', pass:44, notRun:0, ver:'v31', docs:0, locker:0, failCount:0, stale:true },
  { name:'Tyne Crossing DBFM', client:'Tom Reagan · version 12', file:'Tyne_Crossing_Model_v12.xlsx',
    state:'All checks pass', stateFg:'#34c759', checked:'Checked yesterday 18:20', since:'Nothing has changed since you last looked on Tuesday.',
    line:'Every check passed · checked yesterday 18:20', pass:47, notRun:0, ver:'v12', docs:0, locker:0, failCount:0 },
  { name:'Ashgrove Energy from Waste', client:'You · version 5', file:'Ashgrove_EfW_Model_v5.xlsx',
    state:'52 checks pass', stateFg:'#34c759', checked:'Checked Monday 14:05', since:'One input changed on Monday and was rechecked.',
    line:'52 of 52 checks pass · checked Monday 14:05', pass:52, notRun:0, ver:'v5', docs:0, locker:0, failCount:0 },
  { name:'Glenmuir Offshore Wind', client:'Closed deal · filed copy', file:'Glenmuir_Close_Model_FINAL.xlsx', findings:true,
    state:'3 checks fail', dot:'#e8a33d', stateFg:'#c8790a', checked:'Checked 08:40 today',
    since:'Filed at financial close in March. Nothing in it has changed since.',
    line:'14 checks pass, 3 don\'t · checked 08:40 today', pass:14, notRun:19, ver:'v1', docs:0, locker:0,
    failKeys:['a4','a1','a2'], valuesOnly:true },
  { name:'Ridgeway Highways PPP', client:'Tom Reagan · version 19', file:'Ridgeway_PPP_Model_v19.xlsx',
    state:'46 checks pass', stateFg:'#34c759', checked:'Checked 1 August', since:'Untouched for eleven days.',
    line:'46 of 46 checks pass · checked 1 August', pass:46, notRun:0, ver:'v19', docs:0, locker:0, failCount:0 }
];

const CELLS = (rows) => rows.map((r, i) => ({ ...r, rule: i === 0 ? '0' : '.5px solid #eef0f2', hl: r.hl || 'transparent' }));

const SHEETS = ['Cover','Inputs','Revenue','Opex','Costs','Funding','Debt','Tax','Cashflow','Balance Sheet','Covenants','Outputs','Checks'];
const R = (v) => ({ v, al:'r' });
const RB = (v) => ({ v, al:'r', bad:true });

const FAILS = [
  { key:'r1', rule:'Hardcoded value in a formula row', std:'FAST D3', isNew:true,
    says:'Opex FY2032 is typed. Every other year in the row is calculated.',
    where:"'Opex'!N44",
    xl: { sheet:'Opex', sel:'N44', formula:'19100',
      cols:[{ l:'B', w:208 },{ l:'L', w:74 },{ l:'M', w:74 },{ l:'N', w:74 },{ l:'O', w:74 }],
      rows:[
        { n:41, cells:[{ v:'' }, R('FY2030'), R('FY2031'), R('FY2032'), R('FY2033')] },
        { n:42, cells:[{ v:'Indexation' }, R('2.5%'), R('2.5%'), R('2.5%'), R('2.5%')] },
        { n:43, cells:[{ v:'Opex before indexation' }, R('17,760'), R('18,293'), R('19,127'), R('19,420')] },
        { n:44, cells:[{ v:'Opex' }, R('18,204'), R('18,750'), RB('19,100'), R('19,905')] }
      ] },
    explain:'The typed figure sits £505k away from what the row would calculate. It will not move when the indexation assumption moves, so the bid price stops responding to inflation from FY2032 onward.',
    fig:'19,100', figUnit:'typed, where the row would calculate 19,605',
    standard:'FAST Standard D3: a calculation row carries one formula across its whole width.' },
  { key:'r2', rule:'Formula breaks across the row', std:'FAST D3', isNew:true,
    says:'Revenue switches formula at FY2029 and never switches back.',
    where:"'Revenue'!R11:AB11",
    xl: { sheet:'Revenue', sel:'R11', formula:'=R10*$Q$9',
      cols:[{ l:'B', w:208 },{ l:'Q', w:78 },{ l:'R', w:78 },{ l:'S', w:78 }],
      rows:[
        { n:8, cells:[{ v:'' }, R('FY2028'), R('FY2029'), R('FY2030')] },
        { n:9, cells:[{ v:'Tariff (£/MWh)' }, R('58.38'), R('59.90'), R('61.44')] },
        { n:10, cells:[{ v:'Volume (GWh)' }, R('790'), R('790'), R('790')] },
        { n:11, cells:[{ v:'Revenue' }, R('46,120'), RB('46,120'), R('46,120')] }
      ] },
    explain:'From FY2029 the row locks onto the FY2028 tariff. Eleven years of revenue are flat whatever the tariff assumption says.',
    fig:'FY2029', figUnit:'where the formula changes, and stays changed',
    standard:'FAST Standard D3: consistent formulas, one row at a time.' },
  { key:'r3', rule:'Sum range misses a row', std:'ICAEW 5', isNew:false,
    says:'Total project costs excludes the insurance line directly above it.',
    where:"'Costs'!J61",
    xl: { sheet:'Costs', sel:'J61', formula:'=SUM(J58:J59)',
      cols:[{ l:'B', w:246 },{ l:'J', w:110 }],
      rows:[
        { n:58, cells:[{ v:'Construction' }, R('412,900')] },
        { n:59, cells:[{ v:'Development' }, R('38,400')] },
        { n:60, cells:[{ v:'Insurance' }, RB('6,120')] },
        { n:61, cells:[{ v:'Total project costs' }, R('451,300')] }
      ] },
    explain:'Total project costs are understated by £6.12m, which flows into the funding requirement and the equity IRR.',
    fig:'6,120', figUnit:'left out of the total below it',
    standard:'ICAEW Twenty Principles, 5: check that ranges cover everything they claim to.' },
  { key:'r4', rule:'External link to a file outside the model', std:'ICAEW 18', isNew:false,
    says:'Two rate inputs read a workbook on a personal drive.',
    where:"'Funding'!C12, C13",
    xl: { sheet:'Funding', sel:'C12', formula:"='[Bank_case_Jul.xlsx]Sheet1'!B14",
      cols:[{ l:'B', w:246 },{ l:'C', w:110 }],
      rows:[
        { n:12, cells:[{ v:'Base rate (SONIA)' }, RB('4.85%')] },
        { n:13, cells:[{ v:'Credit spread' }, RB('1.35%')] },
        { n:14, cells:[{ v:'All-in cost of debt' }, R('6.20%')] }
      ] },
    explain:'The source file is not in the deal folder. Anyone else who opens the model gets the cached values with no way to refresh them.',
    fig:'2 inputs', figUnit:'read from a file outside the model',
    standard:'ICAEW Twenty Principles, 18: a model should be self-contained and its inputs visible.' },
  { key:'r5', rule:'Sign flips between schedules', std:'FAST B2', isNew:false,
    says:'Interest is negative in the cash flow and positive in the covenant test.',
    where:"'Cashflow'!H38 · 'Covenants'!H14",
    xl: { sheet:'Covenants', sel:'H14', formula:'=Debt!H29',
      cols:[{ l:'B', w:246 },{ l:'H', w:110 }],
      rows:[
        { n:13, cells:[{ v:'Cash available for debt service' }, R('24,900')] },
        { n:14, cells:[{ v:'Interest' }, RB('9,480')] },
        { n:15, cells:[{ v:'DSCR' }, R('2.63x')] }
      ] },
    explain:'The cash flow subtracts interest at Cashflow!H38 and the covenant test adds it. The reported cover ratio is 0.24x too high across the whole term.',
    fig:'0.24x', figUnit:'overstated cover, across the whole term',
    standard:'FAST Standard B2: one sign convention, applied everywhere.' },
  { key:'r6', rule:'Input typed into a calculation sheet', std:'FAST A1', isNew:false,
    says:'The tax rate is typed on the calculation sheet, not on Inputs.',
    where:"'Tax'!D9",
    xl: { sheet:'Tax', sel:'D9', formula:'0.19',
      cols:[{ l:'B', w:246 },{ l:'D', w:110 }],
      rows:[
        { n:9, cells:[{ v:'Corporation tax rate' }, RB('19.0%')] },
        { n:10, cells:[{ v:'Taxable profit' }, R('15,337')] },
        { n:11, cells:[{ v:'Tax charge' }, R('2,914')] }
      ] },
    explain:'Inputs!B47 carries 25.0% and the calculation uses this typed 19.0%. Changing the input sheet has no effect on the tax charge.',
    fig:'19.0%', figUnit:'used, while Inputs carries 25.0%',
    standard:'FAST Standard A1: inputs live in one place and nowhere else.' },
  { key:'a1', rule:'The balance sheet does not balance', std:'ICAEW 8', isNew:false, analytical:true,
    says:'Assets and claims part company from FY2031 onward.',
    where:"'Balance Sheet'!M52:U52",
    xl: { sheet:'Balance Sheet', sel:'M52', formula:'=M50-M51',
      cols:[{ l:'B', w:214 },{ l:'K', w:78 },{ l:'L', w:78 },{ l:'M', w:78 },{ l:'N', w:78 }],
      rows:[
        { n:48, cells:[{ v:'' }, R('FY2029'), R('FY2030'), R('FY2031'), R('FY2032')] },
        { n:50, cells:[{ v:'Total assets' }, R('486,200'), R('501,940'), R('517,880'), R('533,120')] },
        { n:51, cells:[{ v:'Total equity and liabilities' }, R('486,200'), R('501,940'), R('516,760'), R('531,910')] },
        { n:52, cells:[{ v:'Difference' }, R('0'), R('0'), RB('1,120'), RB('1,210')] }
      ] },
    fig:'1,120', figUnit:'apart in FY2031, and wider in every period after',
    explain:'The two sides agree until FY2030. From FY2031 they differ: 1,120 in FY2031, 1,210 in FY2032, and a difference in every one of the nine periods after that. The gap grows, so it is not a rounding difference.',
    standard:'ICAEW Twenty Principles, 8: the statements must reconcile to each other in every period.' },
  { key:'a2', rule:'Cash does not carry forward', std:'ICAEW 8', isNew:false, analytical:true,
    says:'Escrow account: closing 37,311 against opening 0.',
    where:"'Cashflow'!G60, H61",
    xl: { sheet:'Cashflow', sel:'H61', formula:'0',
      cols:[{ l:'B', w:246 },{ l:'G', w:96 },{ l:'H', w:96 }],
      rows:[
        { n:58, cells:[{ v:'' }, R('FY2031'), R('FY2032')] },
        { n:60, cells:[{ v:'Escrow — closing balance' }, R('37,311'), R('41,004')] },
        { n:61, cells:[{ v:'Escrow — opening balance' }, R('34,880'), RB('0')] }
      ] },
    fig:'37,311', figUnit:'closes FY2031, and the next period opens at nothing',
    explain:'FY2031 closes with 37,311 in the escrow account and FY2032 opens with nothing. The account restarts from zero, so 37,311 leaves the model without ever being spent or distributed.',
    standard:'ICAEW Twenty Principles, 8: a balance carried between periods must be the same number on both sides of the join.' },
  { key:'a3', rule:'The debt does not repay to zero', std:'FAST C4', isNew:false, analytical:true,
    says:'Senior debt ends at 4.2m against a peak of 120m.',
    where:"'Debt'!AJ29",
    xl: { sheet:'Debt', sel:'AJ29', formula:'=AI29-AJ28',
      cols:[{ l:'B', w:246 },{ l:'AH', w:90 },{ l:'AI', w:90 },{ l:'AJ', w:90 }],
      rows:[
        { n:26, cells:[{ v:'' }, R('FY2046'), R('FY2047'), R('FY2048')] },
        { n:28, cells:[{ v:'Scheduled repayment' }, R('4,220'), R('4,210'), R('4,210')] },
        { n:29, cells:[{ v:'Senior debt — closing balance' }, R('12,640'), R('8,430'), RB('4,220')] }
      ] },
    fig:'4.22m', figUnit:'still outstanding at maturity, against a peak of 120m',
    explain:'FY2048 is the final period of the facility and the balance is still 4.22m. The amortisation row stops one period short, so 3.5% of the loan is never repaid and the exit is overstated by the same amount.',
    standard:'FAST Standard C4: a debt schedule repays in full by its maturity date.' },
  { key:'a4', rule:"The model's own checks are firing", std:'Own checks', isNew:false, analytical:true,
    says:'“Check: cash ties to BS” reads 2,431. It should read zero.',
    where:"'Checks'!F13",
    xl: { sheet:'Checks', sel:'F13', formula:'=Cashflow!F60-\'Balance Sheet\'!F44',
      cols:[{ l:'B', w:268 },{ l:'E', w:90 },{ l:'F', w:90 }],
      rows:[
        { n:12, cells:[{ v:'Check: balance sheet balances' }, R('0'), R('0')] },
        { n:13, cells:[{ v:'Check: cash ties to BS' }, R('0'), RB('2,431')] },
        { n:14, cells:[{ v:'Check: debt repaid at maturity' }, R('0'), R('0')] }
      ] },
    fig:'2,431', figUnit:'on the model’s own “Check: cash ties to BS” row, which was built to read zero',
    explain:'The modeller built this row to show zero whenever the model agrees with itself. Three of the 226 check rows in this file are returning a non-zero value, and this one has read 2,431 since the version that was filed. Nobody has opened the Checks sheet since.',
    standard:'The model’s own convention: a check row shows zero when the model agrees with itself.' },
  { key:'a5', rule:'Period columns out of order', std:'FAST B1', isNew:false, analytical:true,
    says:'The timeline dips at FY2034, then jumps to FY2036.',
    where:"'Inputs'!R7",
    xl: { sheet:'Inputs', sel:'R7', formula:'FY2032',
      cols:[{ l:'B', w:214 },{ l:'P', w:74 },{ l:'Q', w:74 },{ l:'R', w:74 },{ l:'S', w:74 }],
      rows:[
        { n:7, cells:[{ v:'Period end' }, R('FY2033'), R('FY2034'), RB('FY2032'), R('FY2036')] },
        { n:8, cells:[{ v:'Period number' }, R('9'), R('10'), RB('8'), R('12')] }
      ] },
    fig:'FY2032', figUnit:'in column R, between FY2034 and FY2036',
    explain:'Column R sits out of sequence: FY2034 is followed by FY2032, and then the row jumps to FY2036. Anything that reads the timeline in order — indexation, debt amortisation, the tax pools — reads it wrong from column R onward.',
    standard:'FAST Standard B1: one time axis, running in order, shared by every sheet.' }
];

const XL = (f) => {
  if (!f || !f.xl) return { name:'', formula:'', cols:[], rows:[], sheets:[] };
  const x = f.xl, sc = x.sel.replace(/[0-9]+/g, ''), sr = x.sel.replace(/[^0-9]/g, '');
  const HB = '#f5f5f5', HF = '#4a4a4a', SB = '#e2efe7', SF = '#0e6c39';
  return {
    name: x.sel, formula: x.formula,
    frameW: (34 + x.cols.reduce((t, c) => t + c.w, 0)) + 'px',
    cols: x.cols.map(c => ({ l:c.l, w:c.w + 'px', bg: c.l === sc ? SB : HB, fg: c.l === sc ? SF : HF, bd: c.l === sc ? '#107c41' : '#d0d0d0' })),
    rows: x.rows.map(r => {
      const isR = String(r.n) === sr;
      return { n:r.n, numBg: isR ? SB : HB, numFg: isR ? SF : HF, numBd: isR ? '#107c41' : '#d0d0d0',
        cells: r.cells.map((c, i) => ({
          v: c.v, w: x.cols[i].w + 'px', jc: c.al === 'r' ? 'flex-end' : 'flex-start',
          bg: c.bad ? '#ffeb9c' : '#ffffff', fg: c.bad ? '#9c5700' : '#1a1a1a',
          sh: (x.cols[i].l === sc && isR) ? 'inset 0 0 0 2px #107c41' : 'none' })) };
    }),
    sheets: (() => {
      const W = 5, ai = SHEETS.indexOf(x.sheet);
      const start = ai < 0 ? 0 : Math.max(0, Math.min(ai - 2, SHEETS.length - W));
      return SHEETS.slice(start, start + W).map(s => ({ name:s, on: s === x.sheet ? 'true' : 'false',
        fg: s === x.sheet ? SF : '#5f5f5f', fw: s === x.sheet ? 600 : 400, bd: s === x.sheet ? '#107c41' : 'transparent' }));
    })()
  };
};

const PASSES = [
  { name:'No circular references', std:'ICAEW 12', count:'214,061 cells' },
  { name:'One formula per calculation row', std:'FAST D3', count:'1,842 of 1,844 rows' },
  { name:'No hidden sheets or hidden rows', std:'ICAEW 18', count:'31 sheets' },
  { name:'Sum ranges cover their blocks', std:'ICAEW 5', count:'611 of 612 totals' },
  { name:'Units labelled on every input', std:'FAST A2', count:'308 inputs' },
  { name:'No error values anywhere in the workbook', std:'ICAEW 14', count:'0 errors' },
  { name:'Cash carries forward', std:'ICAEW 8', count:'102 of 103 accounts', analytical:true },
  { name:'Retained earnings roll forward', std:'ICAEW 8', count:'86 periods', analytical:true },
  { name:'Interest accrues on the opening balance', std:'FAST C4', count:'3 tranches', analytical:true },
  { name:'Depreciation stays within the asset base', std:'ICAEW 8', count:'86 periods', analytical:true },
  { name:"The model's own checks", std:'Own checks', count:'223 of 226 rows clean', analytical:true }
];

const COVERAGE = [
  { label:'Macros and VBA', count:'2 modules', why:'Antford reads formulas, not code. Both modules are named in the report so a human can look.' },
  { label:'Assumption reasonableness', count:'308 inputs', why:'Whether a 2.4% inflation rate is right is a judgement, not a check.' },
  { label:'Linked bank case workbook', count:'1 file', why:'Not in the folder Antford watches, so its contents were never read.' },
  { label:'Working capital carry-forward', count:'2 accounts', why:'Our arithmetic and the model’s own check row disagree — not reported.' },
  { label:'Distribution waterfall', count:'1 schedule', why:'The order of payments could not be established with certainty, so nothing was tested against it.' },
  { label:'How the model is built', count:'6 checks', why:'This copy carries values only. With no formulas left in the file, there is nothing to read about how it was made.', only:'values' }
];

const VERSIONS = [
  { tag:'v22', what:'Opex indexation reworked · FY32 overwritten', when:'Tuesday 11:40' },
  { tag:'v21', what:'June construction drawdown pasted in', when:'Monday 16:05' },
  { tag:'v20', what:'Debt sized to the July bank case', when:'8 August' }
];

const LOCKER = [
  { initials:'PA', bg:'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg:'#275c39', cell:"'Costs'!J61",
    text:'Accepted the missing insurance line for now. It is carried separately in the bid schedule and the client asked us not to double count it.', when:'Priya Anand · 1 hour ago' },
  { initials:'TR', bg:'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg:'#8a4526', cell:"'Cashflow'!H38",
    text:'Fixed the interest sign in the covenant test. DSCR now reads 1.31x at the low point.', when:'Tom Reagan · yesterday 19:40' },
  { initials:'JF', bg:'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg:'#553a7a', cell:"'Funding'!C12",
    text:'Moved the bank case rates into the model as inputs. The external link is gone in v23.', when:'Jack Ferreira · yesterday 16:05' },
  { initials:'EW', bg:'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg:'#2c4a80', cell:'Whole model',
    text:'Set Northbank to be checked on every save until the bid goes in.', when:'You · 2 days ago' }
];

const FRONT_FACTS = [
  { value:'3m 41s', label:'to read a 31-sheet, 214,000-formula model' },
  { value:'Every', label:'check cites the standard behind it' },
  { value:'0', label:'setup steps before the first verdict' }
];

const STANDARDS = [
  { tag:'FAST', name:'FAST Standard 02b — structure, formulas and formatting' },
  { tag:'ICAEW', name:'ICAEW Twenty Principles for Good Spreadsheet Practice' },
  { tag:'SMI', name:'Spreadsheet Modelling Institute best practice rules' },
  { tag:'House', name:'Your own rules, added in Settings' }
];


const GRID = (rows) => rows.map(r => ({ ...r, hl: r.hl || 'transparent' }));

const DECK = {
  facts: [
    { label:'Figures read', value:'128', fg:'#1d1d1f' },
    { label:'Traced to the model', value:'121', fg:'#1d1d1f' },
    { label:'Not traced', value:'7', fg:'#1d1d1f' },
    { label:'Checked against an older model', value:'3', fg:'#c8790a' }
  ],
  hidden: [
    { label:'Speaker notes', count:'6 slides', detail:'Slide 12: “check against v14 before Thursday”' },
    { label:'Hidden slides', count:'2', detail:'Slides 22 and 23 — an earlier valuation range' },
    { label:'Cropped images', count:'3', detail:'Slide 7 — cropped chart from Model_v13.xlsx' },
    { label:'Folder paths', count:'2', detail:'\\\\hbl-fs01\\Deals\\Falcon\\Working\\Model_v13.xlsx' }
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
    { label:'Figures read', value:'64', fg:'#1d1d1f' },
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
    { label:'Opening the workbook', note:'31 sheets' },
    { label:'Mapping the formula grid', note:'214,061 cells' },
    { label:'Running the checks', note:'41 pass, 6 fail' },
    { label:'Tracing each failure to its cell', note:'6 cells' }
  ],
  tally: [
    { value:'41', label:'pass', fg:'#1d1d1f' },
    { value:'6', label:'fail', fg:'#c8790a' },
    { value:'3', label:'not checked', fg:'#aeaeb2' }
  ],
  findings: []
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
    'It is a stated total on page 14 of the accounts, not a calculation. Antford read the text of the page.',
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
    'Slide 21 was saved two revisions after slide 12. Antford cannot say which figure is right, only that the deck states both.',
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
  'Growth rates outside a set range',
  'Balance sheet does not balance',
  'Cash does not carry forward between periods',
  'Debt does not repay to zero at maturity',
  'The model’s own check rows are firing',
  'Period columns out of order'
];

const DEAL_CHAT = {
  chain: [],
  suggestions: [
    'Which two failures are new since Tuesday?',
    'What does the hardcode in Opex FY32 actually change?',
    'Why did Priya accept the missing insurance line?'
  ],
  replies: [
    'The Opex FY32 hardcode and the broken revenue formula from FY29. Both arrived with version 22 when the indexation was reworked at 11:40 on Tuesday.',
    'It freezes one year of operating cost at £19.1m, £494k above the calculated figure, and it stops responding to the inflation assumption. Bid price moves by about 0.3% when you flex inflation, where it should move by 1.1%.',
    'Her note in the evidence locker reads: carried separately in the bid schedule, the client asked us not to double count it. She accepted it an hour ago and the reason travels with the report.'
  ]
};

const FILE_CHAT = {
  chain: [],
  suggestions: [
    'What is a hardcode, in plain terms?',
    'Does this actually matter?',
    'How do I fix the Opex row?'
  ],
  replies: [
    'A number typed straight into a row that everything else in that row calculates. It looks identical to a calculated figure on screen, and it stops responding when the assumption behind the row moves.',
    'For the two new ones, yes. The Opex hardcode and the broken revenue formula both sit upstream of the bid price, so the price stops moving when inflation and tariff move.',
    "Copy the formula from the cell to its left across the rest of the row, then check the row against the assumption line above it. Antford rechecks it the next time the file is saved.",
    'I only have this one file, so I cannot tell you what else reads it. Keep the model watched and I can.'
  ]
};

const SCOPE = (s) => (s.view === 'check' ? FILE_CHAT : DEAL_CHAT);

const DEAL_INTENT = /\bwe\b|\bour\b|falcon|meridian|ashgrove|kestrel|tolland|ridgeway|the model|model!|accounts|memo|deal|slide 4|decided|decision|kept|keep|who |other document|elsewhere/i;

const BOUNDARY = 'I only have this one file \u2014 that\u2019s a question about a watched model. Keep this one watched and I can answer it.';

const FILE_TOPICS = [
  { re: /hardcode|hard-code|typed|formula|cell/i, i: 0 },
  { re: /matter|serious|risk|care|important|recipient|see|read/i, i: 1 },
  { re: /remove|get rid|delete|repair|clean|fix|how do i/i, i: 2 }
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

const LABELS = { deals:'Models', check:'Check a model', settings:'Settings', account:'Account' };

class Component extends DCLogic {
  state = { view: 'deals', deal: null, doc: null, finding: null,
    cPhase: 'idle', cStep: 0, cStartedAt: 0, askOpen: false, accepted: [], noteFor: null, noteText: '', cFinding: null, fail: null, sec: null, reportOpen: false, reportOff: [],
    chat: null, chatMsgs: [], prompt: '', asked: 0, against: null, menuOpen: false, sTab: 'conn', round: 'Group separately', write: { range: '$455–528mm', fy: 'FY2025A', unit: 'mm', neg: '(139.2)' },
    acctOpen: false, conn: 'none', newOpen: false, ndStep: 'browse', ndPath: ['Investment Banking', 'Deals'], ndPicks: [], ndMeta: {}, ndStep2: 0, inviteOpen: false, inviteEmail: '', invitePicks: ['Project Falcon'],
    sw: { grounding: true, audit: true, statements: true }, auditOpen: false, offRules: ['Growth rates outside a set range'] };
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
  runTimers = [];
  stopRun = () => {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.runTimers.forEach(clearTimeout);
    this.runTimers = [];
  };
  beginRun = (n) => {
    this.stopRun();
    for (let i = 1; i < n; i += 1) {
      this.runTimers.push(setTimeout(() => this.setState({ cStep: i }), i * 950));
    }
    this.runTimers.push(setTimeout(() => this.setState({ cPhase: 'done', cStep: n }), n * 950));
  };
  componentWillUnmount() { this.stopRun(); this.clearChatTimer(); this.clearNdTimer(); }
  renderVals() {
    const s = this.state;
    const sel = FAILS.find(f => f.key === s.fail) || null;
    const rv = sel || FAILS[0];
    const rvx = XL(rv);
    const dFails = s.deal
      ? (s.deal.failKeys ? s.deal.failKeys.map(k => FAILS.find(f => f.key === k)).filter(Boolean) : FAILS.slice(0, s.deal.failCount || 0))
      : FAILS;
    const liveFails = dFails.filter(f => s.accepted.indexOf(f.key) === -1);
    const dVerLabel = 'version ' + String(s.deal ? s.deal.ver : 'v22').replace('v', '');
    const buildFails = liveFails.filter(f => !f.analytical);
    const stateFails = liveFails.filter(f => f.analytical);
    const CARD = (f) => {
      const open = s.fail === f.key, x = XL(f);
      return { key:f.key, rule:f.rule, std:f.std, where:f.where, says:f.says,
        explain:f.explain, standard:f.standard, isNew:f.isNew, open,
        age: f.isNew ? 'New since Tuesday, when version 22 was saved.' : 'Open since before Tuesday.',
        tag: (f.isNew ? 'New since ' : 'Open before ') + dVerLabel,
        tagShort: f.isNew ? 'New' : '',
        dot: '#ff3b30',
        hasFig: !!f.fig, fig: f.fig || '', figUnit: f.figUnit || '', figCap: f.figCap || '',
        hasQuote: !!f.quoteLabel, quoteLabel: f.quoteLabel || '', quoteVal: f.quoteVal || '',
        xName:x.name, xFormula:x.formula, xCols:x.cols, xRows:x.rows, xSheets:x.sheets,
        pick: () => this.setState({ fail: open ? null : f.key }) };
    };
    const dValuesOnly = !!(s.deal && s.deal.valuesOnly);
    const dClean = !!(s.deal && !s.deal.findings);
    const dStale = !!(s.deal && s.deal.stale);
    const WORDS = ['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve'];
    const on = (k) => s.view === k ? 'rgba(21,23,27,.055)' : 'transparent';
    const ink = (k) => s.view === k ? '#0060d0' : '#5b6068';
    const fw = (k) => s.view === k ? 500 : 400;
    const sh = (k) => 'none';
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
        { name:'Northbank Bid Submission', sub:'Priya Anand · edited 20 minutes ago', kind:'doc', state:'3 stale figures', fg:'#c8790a' },
        { name:'Northbank Board Paper', sub:'You · edited 2 hours ago', kind:'ppt', state:'1 stale figure', fg:'#c8790a' },
        { name:'Northbank Funding Competition', sub:'Tom Reagan · edited yesterday', kind:'ppt', state:'Agrees with the model', fg:'#34c759' },
        { name:'Northbank sensitivity pack', sub:'Jack Ferreira · edited yesterday', kind:'xls', state:'Agrees with the model', fg:'#34c759' }
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
      dealLog: LOCKER.map((l, i) => ({ ...l, rule: i === 0 ? '0' : '.5px solid #f0eff1' })),
      ruleTop: '0',
      selOpen: !!sel,
      selRule: sel ? sel.rule : '', selStd: sel ? sel.std : '', selSays: sel ? sel.says : '',
      selExplain: sel ? sel.explain : '', selStandard: sel ? sel.standard : '',
      selAge: sel ? (sel.isNew ? 'New since Tuesday, when version 22 was saved.' : 'Open since before Tuesday.') : '',
      selWhere: sel ? sel.where : '',
      xlName: XL(sel).name, xlFormula: XL(sel).formula, xlCols: XL(sel).cols, xlRows: XL(sel).rows, xlSheets: XL(sel).sheets,
      closeSel: () => this.setState({ fail: null }),
      secPass: s.sec === 'pass', secCov: s.sec === 'cov', secLog: s.sec === 'log', secModel: s.sec === 'model', secDocs: s.sec === 'docs',
      spinPass: s.sec === 'pass' ? 'rotate(90deg)' : 'none',
      spinCov: s.sec === 'cov' ? 'rotate(90deg)' : 'none',
      spinLog: s.sec === 'log' ? 'rotate(90deg)' : 'none',
      spinModel: s.sec === 'model' ? 'rotate(90deg)' : 'none',
      spinDocs: s.sec === 'docs' ? 'rotate(90deg)' : 'none',
      togglePass: () => this.setState(st => ({ sec: st.sec === 'pass' ? null : 'pass' })),
      toggleCov: () => this.setState(st => ({ sec: st.sec === 'cov' ? null : 'cov' })),
      toggleLog: () => this.setState(st => ({ sec: st.sec === 'log' ? null : 'log' })),
      toggleModel: () => this.setState(st => ({ sec: st.sec === 'model' ? null : 'model' })),
      toggleDocs: () => this.setState(st => ({ sec: st.sec === 'docs' ? null : 'docs' })),
      fails: FAILS.map((f, i) => ({ ...f, open: s.fail === f.key,
        rule0: i === 0 ? '0' : '.5px solid #eceaec',
        spin: s.fail === f.key ? 'rotate(90deg)' : 'none',
        dot: f.isNew ? '#e8a33d' : '#d2d2d7',
        age: f.isNew ? 'New since Tuesday, when version 22 was saved.' : 'Open since before Tuesday.',
        toggle: () => this.setState(st => ({ fail: st.fail === f.key ? null : f.key })) })),
      rvFails: liveFails.map(CARD), rvBuild: buildFails.map(CARD), rvState: stateFails.map(CARD),
      hasBuild: !dClean && !dStale && buildFails.length > 0,
      hasState: !dClean && !dStale && stateFails.length > 0,
      verdictLine: liveFails.length === 0 ? 'Everything checked passes.' : (WORDS[liveFails.length] || liveFails.length) + (liveFails.length === 1 ? " check doesn't pass." : " checks don't pass."),
      acceptedCount: s.accepted.length,
      hasAccepted: s.accepted.length > 0,
      acceptedLine: s.accepted.length === 1 ? '1 failure accepted with a note' : s.accepted.length + ' failures accepted with a note',
      hasLiveFails: liveFails.length > 0,
      dealClean: dClean, dealStale: dStale,
      notClean: !dClean && !dStale,
      showFailGrid: !dClean && !dStale && liveFails.length > 0,
      dPass: s.deal ? s.deal.pass : 41,
      dVer: s.deal ? s.deal.ver : 'v22',
      dNotRun: s.deal ? s.deal.notRun : 3,
      hasNotRun: s.deal ? s.deal.notRun > 0 : true,
      dDocs: s.deal ? s.deal.docs : 4,
      dLocker: s.deal ? s.deal.locker : 4,
      dealMain: !!(s.deal && s.deal.main),
      dealValuesOnly: !!(s.deal && s.deal.valuesOnly),
      dealSince: s.deal ? s.deal.since : '',
      dealCleanLine: s.deal ? s.deal.line : '',
      noteOpen: !!s.noteFor, notNote: !s.noteFor, noteText: s.noteText,
      noteType: (e) => this.setState({ noteText: e.target.value }),
      startNote: () => this.setState({ noteFor: rv.key, noteText: '' }),
      cancelNote: () => this.setState({ noteFor: null, noteText: '' }),
      canSaveNote: s.noteText.trim().length > 2,
      saveBg: s.noteText.trim().length > 2 ? '#0060d0' : '#c9d6e8',
      saveNote: () => { if (s.noteText.trim().length <= 2) return;
        this.setState(st => ({ accepted: st.accepted.concat(st.noteFor), noteFor: null, noteText: '', fail: null })); },
      rvRule: rv.rule, rvStd: rv.std, rvSays: rv.says, rvExplain: rv.explain, rvStandard: rv.standard,
      rvWhere: rv.where, rvAge: rv.isNew ? 'New since Tuesday, when version 22 was saved.' : 'Open since before Tuesday.',
      rvName: rvx.name, rvFormula: rvx.formula, rvFrameW: rvx.frameW, rvCols: rvx.cols, rvRows: rvx.rows, rvSheets: rvx.sheets,
      passes: PASSES.filter(p => !dValuesOnly || p.analytical)
        .map((p, i) => ({ ...p, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      coverage: COVERAGE.filter(c => !c.only || dValuesOnly)
        .map((c, i) => ({ ...c, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      mdVersions: VERSIONS,
      mdVersionsShown: (s.deal && !s.deal.main) ? [] : VERSIONS,
      mdFile: s.deal ? s.deal.file : 'Northbank_Bid_Model_v22.xlsx',
      mdFileSub: s.deal && !s.deal.main ? s.deal.checked : '31 sheets · 214,061 formulas · saved Tuesday 11:40',
      frontFacts: FRONT_FACTS,
      standards: STANDARDS.map((st, i) => ({ ...st, rule: i === 0 ? '0' : '.5px solid #eceaec' })),
      reportOpen: s.reportOpen,
      openReport: () => this.setState({ reportOpen: true }),
      closeReport: () => this.setState({ reportOpen: false }),
      reportLines: FAILS.map(f => ({ rule: f.rule, std: f.std, where: f.where })),
      reportOpts: ['The eleven failing checks, with the cells', 'The thirty-six checks that pass', 'What was not checked, and why', 'The evidence locker'].map((label, i) => {
        const on = s.reportOff.indexOf(label) === -1;
        return { label, on, rule: i === 0 ? '0' : '.5px solid #f0eff1',
          boxBg: on ? '#0060d0' : 'transparent', boxBd: on ? '#0060d0' : '#d4d4d8',
          flip: () => this.setState(st => ({ reportOff: st.reportOff.indexOf(label) === -1 ? st.reportOff.concat(label) : st.reportOff.filter(n => n !== label) })) };
      }),
      vCheck: s.view === 'check',
      cIdle: s.cPhase === 'idle' && !this.props.notConnected,
      cFirst: s.cPhase === 'idle' && !!this.props.notConnected,
      cRunning: s.cPhase === 'running',
      cDone: s.cPhase === 'done',
      cDoneBar: s.view === 'check' && s.cPhase === 'done',
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
        const n = RUN({ ...s, cPhase: 'running' }).steps.length;
        this.setState({ cPhase: 'running', cStep: 0, cStartedAt: Date.now() });
        this.beginRun(n);
      },
      cCancel: () => { this.stopRun(); this.setState({ cPhase: 'idle', cStep: 0 }); },
      cReset: () => this.setState({ cPhase: 'idle', cStep: 0, cFinding: null, askOpen: false }),
      cSourced: !!s.against,
      mainOpen: !(s.view === 'deals' && s.deal && s.doc && s.chat),
      chatOpen: ((s.view === 'deals' && !!s.deal && (s.askOpen || (!!s.doc && !!s.chat))) || (s.view === 'check' && s.cPhase === 'done' && s.askOpen)) && !(s.view === 'deals' && s.deal && s.doc && !s.chat),
      askClosable: true,
      openAsk: () => this.setState({ askOpen: true }),
      closeAsk: () => this.setState({ askOpen: false }),
      chatTitle: s.chat ? s.chat.title : (s.view === 'check' ? 'Falcon Management Presentation' : (s.deal ? s.deal.name : 'Antford')),
      chatWhere: s.chat ? s.chat.where : (s.view === 'check' ? 'This file only' : 'This deal · 6 documents, the model and the decision log'),
      chatHasWhere: true,
      chatEmpty: s.chatMsgs.length === 0,
      chatGreeting: s.view === 'check' ? 'Ask me about this model.' : 'Ask me about this model.',
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
      ].map(t => ({ ...t, bg: s.sTab === t.key ? '#ffffff' : 'transparent', sh: s.sTab === t.key ? '0 1px 2px rgba(16,20,28,.10)' : 'none', fw: s.sTab === t.key ? 500 : 400, fg: s.sTab === t.key ? '#0060d0' : '#5b6068', go: () => this.setState({ sTab: t.key }) })),
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
        fw: i === arr.length - 1 ? 500 : 400,
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
        return { label, bg: on ? '#fff' : 'transparent', sh: on ? '0 2px 8px rgba(16,20,28,.14)' : 'none', fg: on ? '#0060d0' : '#5b6068', fw: on ? 500 : 400,
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
        { key:'audit', name:'Model audit rules', sub:'Hardcodes, broken links, formulas that break across a row', hasRules:true },
        { key:'statements', name:'Statement checks', sub:'Whether the accounts hold together: balancing, cash carried forward, debt repaid, and the model’s own check rows' }
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
        { name:'Elena Whitmore', initials:'EW', role:'You', models:'All six models', bg:'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg:'#2c4a80' },
        { name:'Tom Reagan', initials:'TR', role:'Vice President', models:'Northbank, Tyne Crossing, Ridgeway', bg:'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg:'#8a4526' },
        { name:'Priya Anand', initials:'PA', role:'Associate', models:'Northbank, Calder Rail', bg:'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg:'#275c39' },
        { name:'Jack Ferreira', initials:'JF', role:'Analyst', models:'Northbank', bg:'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg:'#553a7a' }
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
      summary: 'Six models kept ready. Northbank has six checks failing.',
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
      open: DEALS.filter(d => d.findings).map((d, i) => ({ ...d,
        rule: i === 0 ? '0' : '.5px solid #eceaec',
        go: () => this.setState({ deal: d, askOpen: false, fail: null }) })),
      clean: DEALS.filter(d => !d.findings).map((d, i) => ({ ...d,
        rule: i === 0 ? '0' : '.5px solid #eceaec',
        go: () => this.setState({ deal: d, askOpen: false, fail: null }) }))
    };
  }
}
