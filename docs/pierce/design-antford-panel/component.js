
const SHEETS = ['Cover','Inputs','Revenue','Opex','Costs','Funding','Debt','Tax','Cashflow','Covenants','Outputs'];

const COLS = [
  { l:'B', w:250 }, { l:'L', w:96 }, { l:'M', w:96 }, { l:'N', w:96 }, { l:'O', w:96 }, { l:'P', w:96 }
];

const R = (v) => ({ v, al:'r' });
const T = (v) => ({ v });

const ROWS = [
  { n:1881, cells:[T('Operating costs'), T(''), T(''), T(''), T(''), T('')] },
  { n:1882, cells:[T(''), R('FY2030'), R('FY2031'), R('FY2032'), R('FY2033'), R('FY2034')] },
  { n:1883, cells:[T('Indexation'), R('2.5%'), R('2.5%'), R('2.5%'), R('2.5%'), R('2.5%')] },
  { n:1884, cells:[T('Opex before indexation'), R('17,760'), R('18,293'), R('19,127'), R('19,420'), R('19,905')] },
  { n:1885, cells:[T('Opex'), R('18,204'), R('18,750'), R('19,100'), R('19,905'), R('20,403')] },
  { n:1886, cells:[T('Maintenance reserve'), R('1,240'), R('1,271'), R('1,303'), R('1,335'), R('1,369')] },
  { n:1887, cells:[T('Insurance'), R('5,900'), R('6,048'), R('6,199'), R('6,354'), R('6,513')] },
  { n:1888, cells:[T('Total operating costs'), R('25,344'), R('26,069'), R('26,602'), R('27,594'), R('28,285')] },
  { n:1889, cells:[T(''), T(''), T(''), T(''), T(''), T('')] },
  { n:1890, cells:[T('Revenue'), R('46,120'), R('47,273'), R('48,455'), R('49,666'), R('50,908')] },
  { n:1891, cells:[T('EBITDA'), R('20,776'), R('21,204'), R('21,853'), R('22,072'), R('22,623')] },
  { n:1892, cells:[T('EBITDA margin'), R('45.0%'), R('44.9%'), R('45.1%'), R('44.4%'), R('44.4%')] },
  { n:1893, cells:[T(''), T(''), T(''), T(''), T(''), T('')] },
  { n:1894, cells:[T('Tax charge'), R('2,914'), R('3,002'), R('3,141'), R('3,180'), R('3,286')] },
  { n:1895, cells:[T('Cash available for debt service'), R('24,900'), R('25,411'), R('26,244'), R('26,538'), R('27,190')] },
  { n:1896, cells:[T('Interest'), R('(9,480)'), R('(9,196)'), R('(8,904)'), R('(8,603)'), R('(8,293)')] }
];

const PROBLEMS = [
  { key:'p1', what:'A formula was replaced with a typed number', cell:"'Opex'!N1885", std:'FAST D3',
    row:1885, col:'N', formula:'19100', isNew:true },
  { key:'p2', what:'The row stops following its assumption line', cell:"'Opex'!O1885", std:'FAST D3',
    row:1885, col:'O', formula:'=O1884*$L$1883', isNew:true },
  { key:'p3', what:'A sum leaves out the row directly above it', cell:"'Opex'!L1888", std:'ICAEW 5',
    row:1888, col:'L', formula:'=SUM(L1884:L1886)', isNew:true },
  { key:'p4', what:'Interest changes sign between schedules', cell:"'Opex'!L1896", std:'FAST B2',
    row:1896, col:'L', formula:'=-Debt!L29', isNew:true },
  { key:'p5', what:'A margin divides by the wrong period', cell:"'Opex'!M1892", std:'ICAEW 9',
    row:1892, col:'M', formula:'=M1891/L1890', isNew:true },
  { key:'p6', what:'A reserve line is typed, not indexed', cell:"'Opex'!N1886", std:'FAST A1',
    row:1886, col:'N', formula:'1303', isNew:true }
];

const OLDER = [
  { what:'Unused defined name', cell:"'Cover'!A4" },
  { what:'Column hidden without a note', cell:"'Debt'!AF1:AF40" },
  { what:'Rounded input carried as text', cell:"'Inputs'!B212" },
  { what:'Sheet has no time axis header', cell:"'Cover'" }
];

const PASS_COUNT = 41;
const PHASES = ['Reading the workbook', 'Following the formulas', 'Running the checks', 'Tracing each finding to its cell'];
const RC = 44, RL = 2 * Math.PI * RC;
const ringEl = (frac) => React.createElement('svg', {
    width: 96, height: 96, viewBox: '0 0 96 96',
    style: { position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }
  },
  React.createElement('circle', { cx: 48, cy: 48, r: RC, fill: 'none', stroke: '#f0eff2', strokeWidth: 1.5 }),
  React.createElement('circle', { cx: 48, cy: 48, r: RC, fill: 'none', stroke: '#1d1d1f', strokeWidth: 1.5,
    strokeLinecap: 'round', strokeDasharray: RL,
    strokeDashoffset: RL * (1 - Math.max(0.004, Math.min(1, frac))) })
);

const phaseEl = (frac) => {
  const i = Math.min(PHASES.length - 1, Math.floor(frac * PHASES.length));
  return React.createElement('div', {
    key: i,
    style: { fontSize: '15px', color: '#1d1d1f', letterSpacing: '-.01em', marginTop: '24px',
      textAlign: 'center', animation: 'antford-fade .45s ease both' }
  }, PHASES[i]);
};

class Component extends DCLogic {
  state = { auth: null, sel: 'p1', noting: null, noteText: '', fine: [], oldOpen: false, rechecked: false, ran: 0.001 };
  raf = null; runTimer = null;
  stopRun = () => { cancelAnimationFrame(this.raf); clearTimeout(this.runTimer); this.raf = null; this.runTimer = null; };
  componentWillUnmount() { this.stopRun(); }
  runCheck = () => {
    this.stopRun();
    this.setState({ auth: 'checking', ran: 0 });
    const dur = 3800, t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 2.2);
      this.setState({ ran: eased });
      if (p < 1) { this.raf = requestAnimationFrame(tick); }
      else { this.runTimer = setTimeout(() => this.setState({ auth: 'in' }), 600); }
    };
    this.raf = requestAnimationFrame(tick);
  };

  renderVals() {
    const s = this.state;
    const startMap = { 'Log in': 'out', 'Authorize': 'auth', 'Checking': 'checking', 'Findings': 'in' };
    const auth = s.auth || startMap[this.props.startScreen] || 'out';
    const isStale = !!this.props.modelEdited && !s.rechecked;
    const live = PROBLEMS.filter(p => s.fine.indexOf(p.key) === -1);
    const ranAll = auth === 'in';
    const sel = ranAll ? (live.find(p => p.key === s.sel) || live[0] || null) : null;
    const selRow = sel ? sel.row : (ranAll ? 1885 : 1881);
    const selCol = sel ? sel.col : 'B';
    const passing = PASS_COUNT + s.fine.length;
    const HB = '#f5f5f5', HF = '#4a4a4a', SB = '#e2efe7', SF = '#0e6c39';
    const badCells = {};
    if (ranAll) { live.forEach(p => { badCells[p.col + p.row] = true; }); }

    return {
      isOut: auth === 'out', isAuth: auth === 'auth', isIn: auth === 'in', isChecking: auth === 'checking',
      toAuth: () => this.setState({ auth: 'auth' }),
      toIn: this.runCheck,
      toOut: () => { this.stopRun(); this.setState({ auth: 'out' }); },
      ring: ringEl(s.ran),
      phaseLine: phaseEl(s.ran),

      scopes: [
        { what:'Read this workbook', why:'Formulas, values and sheet structure. Read only.', rule:'0' },
        { what:'Select cells', why:'So a finding can take you to the cell it came from.', rule:'.5px solid #f0eff1' },
        { what:'Keep your notes', why:'Anything you mark deliberate is stored with the file.', rule:'.5px solid #f0eff1' }
      ],

      failLabel: live.length === 0 ? 'Nothing to fix' : (live.length === 1 ? '1 finding' : live.length + ' findings'),
      passLabel: passing + ' checks pass · 11:42',
      fresh: !isStale, stale: isStale,
      recheck: () => this.setState({ rechecked: true }),

      hasFine: s.fine.length > 0,
      fineLine: s.fine.length === 1
        ? '1 finding marked deliberate.'
        : s.fine.length + ' findings marked deliberate.',
      footNote: 'Against FAST and ICAEW · v22',

      noteText: s.noteText,
      noteType: (e) => this.setState({ noteText: e.target.value }),
      saveBg: s.noteText.trim().length > 2 ? '#1d1d1f' : '#d8d8dc',

      problems: live.map((p, i) => ({
        key: p.key, what: p.what, std: p.std,
        cellRef: p.col + p.row,
        cellFg: s.sel === p.key ? '#1d1d1f' : '#0060d0',
        isSel: s.sel === p.key && s.noting !== p.key,
        noting: s.noting === p.key,
        dot: '#ff3b30',
        rule: (i === 0 || s.sel === p.key || (live[i - 1] && s.sel === live[i - 1].key)) ? '0' : '.5px solid #f0eff1',
        bg: s.sel === p.key ? '#fbfcfe' : 'transparent',
        box: s.sel === p.key ? '0 0 0 1px #0060d0' : 'none',
        padX: s.sel === p.key ? '12px' : '0px',
        jump: () => this.setState({ sel: p.key, noting: null, noteText: '' }),
        fine: () => this.setState({ noting: p.key, noteText: '' }),
        cancel: () => this.setState({ noting: null, noteText: '' }),
        save: () => { if (this.state.noteText.trim().length <= 2) return;
          const rest = live.filter(o => o.key !== p.key);
          const next = rest.length ? rest[0].key : null;
          this.setState(st => ({ fine: st.fine.concat(p.key), noting: null, noteText: '', sel: next })); }
      })),

      older: OLDER.map(o => ({ ...o, jump: () => {} })),
      oldOpen: s.oldOpen,
      spinOld: s.oldOpen ? 'rotate(90deg)' : 'none',
      toggleOld: () => this.setState(st => ({ oldOpen: !st.oldOpen })),

      selName: selCol + selRow,
      selFormula: sel ? sel.formula : (ranAll ? '' : 'Operating costs'),
      sheets: SHEETS.map(n => ({ name:n, fg: n === 'Opex' ? SF : '#5f5f5f', fw: n === 'Opex' ? 500 : 400, bd: n === 'Opex' ? '#107c41' : 'transparent' })),
      cols: COLS.map(c => ({ l:c.l, w:c.w + 'px', bg: c.l === selCol ? SB : HB, fg: c.l === selCol ? SF : HF, bd: c.l === selCol ? '#107c41' : '#d0d0d0' })),
      rows: ROWS.map(r => ({
        n: r.n,
        numBg: r.n === selRow ? SB : HB,
        numFg: r.n === selRow ? SF : HF,
        numBd: r.n === selRow ? '#107c41' : '#d0d0d0',
        cells: r.cells.map((c, i) => {
          const L = COLS[i].l, bad = !!badCells[L + r.n], isSel = L === selCol && r.n === selRow;
          return { v: c.v, w: COLS[i].w + 'px', jc: c.al === 'r' ? 'flex-end' : 'flex-start',
            bg: bad ? '#ffeb9c' : '#ffffff', fg: bad ? '#9c5700' : '#1a1a1a',
            sh: isSel ? 'inset 0 0 0 2px #107c41' : 'none' };
        })
      }))
    };
  }
}
