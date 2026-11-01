import { ChartView } from './chart';
import { loadSeries } from './data';
import { Indicators } from './indicators';
import { Replay, buildPath, partialAt } from './replay';
import type { Bar, Raw } from './types';
import { money, pct, tone } from './ui';
import { PLACES, centroid, countryById, renderMap, type MapDot } from './worldmap';

const PRE = 60;
const PLAY = 120;
const START_CASH = 100_000;
const SLIPPAGE = 0.0005;
const FEE = 1;
/** Gross exposure (longs + shorts) may not exceed this multiple of equity. */
const MAX_GROSS = 2;

export const BASKET = [
  { id: 'world', sym: 'SPY', name: 'World Index', blurb: 'The whole stock market. Your benchmark.' },
  { id: 'defense', sym: 'ITA', name: 'Defense', blurb: 'Arms makers and aerospace. Tends to rise when tensions do.' },
  { id: 'energy', sym: 'XLE', name: 'Energy', blurb: 'Oil and gas producers. Moves with supply scares.' },
  { id: 'gold', sym: 'GLD', name: 'Gold', blurb: 'The classic safe haven when people get scared.' },
  { id: 'airlines', sym: 'JETS', name: 'Airlines', blurb: 'Hates closed airspace, expensive fuel and nervous travelers.' },
  { id: 'tech', sym: 'XLK', name: 'Tech', blurb: 'Growth stocks. Sensitive to supply chains and risk appetite.' },
] as const;
type InstId = (typeof BASKET)[number]['id'];

interface Crisis {
  id: string;
  start: string;
  op: string;
  a: string;
  b: string[];
  bName: string;
  neutral: string;
  story: string;
  real: string;
}

/** Each fictional crisis plays over the real prices of a real geopolitical episode, revealed at the end. */
const CRISES: Crisis[] = [
  {
    id: 'chill',
    start: '2022-01-18',
    op: 'Operation Big Chill',
    a: 'bearlandia',
    b: ['autobahnia', 'bonjouria', 'tealand'],
    bName: 'the Snack Pact',
    neutral: 'cricketania',
    story: "Bearlandia has massed troops along the Snack Pact's border. Diplomats are working overtime, energy traders are not sleeping, and everyone is checking the price of gas.",
    real: "Russia's invasion of Ukraine, January to July 2022",
  },
  {
    id: 'tantrum',
    start: '2025-02-18',
    op: 'The Great Tariff Tantrum',
    a: 'murica',
    b: ['dragonia', 'canadia', 'bonjouria'],
    bName: 'basically everyone',
    neutral: 'savannia',
    story: "'Murica has discovered tariffs and likes them very much. Dragonia, Canadia and Bonjouria are drafting strongly worded spreadsheets in response.",
    real: 'The 2025 US tariff shock, February to August 2025',
  },
  {
    id: 'spat',
    start: '2018-09-20',
    op: 'Trade Spat, Season One',
    a: 'murica',
    b: ['dragonia'],
    bName: 'Dragonia',
    neutral: 'sunrisia',
    story: "'Murica and Dragonia are arguing over who owes whom for the last few hundred billion phones. Both sides keep raising tariffs, \"just a little.\"",
    real: 'The 2018 US–China trade war and the late-2018 selloff, September 2018 to March 2019',
  },
  {
    id: 'hmmuz',
    start: '2023-09-20',
    op: 'Operation Hmm-uz',
    a: 'petrolia',
    b: ['murica', 'tealand'],
    bName: 'the Snack Pact navies',
    neutral: 'cricketania',
    story: 'Fighting has flared near Petrolia, and everyone is staring nervously at the Strait of Hmm-uz, where a big share of the world’s oil sails past every day.',
    real: 'The October 2023 Middle East conflict, September 2023 to March 2024',
  },
];

type Tone = MapDot['tone'];
type Lights = Record<string, 'red' | 'amber' | 'green'>;

interface Rule {
  inst: InstId;
  dir: 1 | -1;
  z: number;
  tone: Tone;
  where(c: Crisis): string;
  headlines: string[];
  detail: string;
  watch: string;
  lights(c: Crisis, where: string): Lights;
}

const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const fromB = (c: Crisis) => pickOne(c.b);
const name = (id: string) => (id in PLACES ? PLACES[id].name : countryById(id).name);
const conflictLights = (c: Crisis): Lights => Object.fromEntries([[c.a, 'red'], ...c.b.map((b) => [b, 'amber'])]);
const calmLights = (c: Crisis): Lights => Object.fromEntries([c.a, ...c.b].map((x) => [x, 'green']));

/**
 * News is written from the real prices: each rule watches one instrument (the
 * world index on its own, sectors relative to the world), and fires on the bars
 * where that instrument made an unusual move.
 */
const RULES: Rule[] = [
  {
    inst: 'world', dir: -1, z: 2.2, tone: 'conflict', where: (c) => c.a,
    headlines: ['{A} and {B} trade threats; markets tumble', 'Emergency summit collapses as {A} walks out', '{A} escalates; stocks slide worldwide'],
    detail: 'Fear is spreading across every market at once. In moments like this, nearly everything falls together except the safe havens.',
    watch: 'World Index, Gold, Defense', lights: conflictLights,
  },
  {
    inst: 'world', dir: 1, z: 2.2, tone: 'calm', where: (c) => c.neutral,
    headlines: ['Talks open in neutral {N}; relief rally', 'Back-channel deal between {A} and {B} reported; stocks jump', '{A} signals a pause; buyers rush back'],
    detail: 'Hope is back, at least for today. Relief rallies can be violent, and shorts get squeezed. The question is whether it lasts.',
    watch: 'World Index, Airlines, Tech', lights: calmLights,
  },
  {
    inst: 'energy', dir: 1, z: 2, tone: 'conflict', where: () => 'strait',
    headlines: ['Tankers dodge the Strait of Hmm-uz; oil spikes', '{A} threatens pipeline flows; energy surges', 'Insurers hike rates for ships near the Strait of Hmm-uz'],
    detail: 'Supply scares push oil producers up and hurt anyone who burns fuel, airlines first of all.',
    watch: 'Energy, Airlines', lights: (c) => ({ petrolia: 'amber', [c.a]: 'red' }),
  },
  {
    inst: 'energy', dir: -1, z: 2, tone: 'econ', where: () => 'petrolia',
    headlines: ['Petrolia opens the taps to calm prices; crude slides', 'Oil glut fears return as {N} boosts output'],
    detail: 'More supply means cheaper oil: bad for producers, a gift for airlines.',
    watch: 'Energy, Airlines', lights: () => ({ petrolia: 'green' }),
  },
  {
    inst: 'defense', dir: 1, z: 1.8, tone: 'econ', where: fromB,
    headlines: ['{W} votes record defense budget; arms makers rally', '{W} orders a very large number of very expensive jets', 'Snack Pact pledges to spend more on defense'],
    detail: 'Governments ordering weapons is direct revenue for defense companies, often for years.',
    watch: 'Defense', lights: (_c, w) => ({ [w]: 'amber' }),
  },
  {
    inst: 'gold', dir: 1, z: 1.8, tone: 'econ', where: () => 'tealand',
    headlines: ['Gold vaults in Tealand run short of shelf space', 'Investors flee to gold as the {A} standoff drags on'],
    detail: 'When people get scared, they buy things that have held value for thousands of years.',
    watch: 'Gold', lights: () => ({ tealand: 'amber' }),
  },
  {
    inst: 'airlines', dir: -1, z: 2, tone: 'conflict', where: (c) => c.a,
    headlines: ['Airspace over {A} closed; airlines ground flights', 'Travelers cancel trips as the {A} crisis deepens'],
    detail: 'Closed routes, pricier fuel and nervous passengers all hit airlines at once.',
    watch: 'Airlines, Energy', lights: (c) => ({ [c.a]: 'red' }),
  },
  {
    inst: 'airlines', dir: 1, z: 2, tone: 'calm', where: (c) => c.neutral,
    headlines: ['Borders reopen; vacation bookings soar', 'Fuel prices ease and airlines take off'],
    detail: 'When travel looks safe and cheap again, airline stocks rebound fast.',
    watch: 'Airlines', lights: (c) => ({ [c.neutral]: 'green' }),
  },
  {
    inst: 'tech', dir: -1, z: 2, tone: 'econ', where: () => 'dragonia',
    headlines: ['Chip shipments from Dragonia stall; tech sells off', 'New export rules hit gadget makers'],
    detail: 'Tech depends on long global supply chains. Any disruption shows up in the price.',
    watch: 'Tech', lights: () => ({ dragonia: 'amber' }),
  },
  {
    inst: 'tech', dir: 1, z: 2, tone: 'calm', where: () => 'sunrisia',
    headlines: ['Tech giants shrug off the crisis with blowout sales', 'Investors pile back into growth stocks'],
    detail: 'Risk appetite is back. Growth stocks lead when fear fades.',
    watch: 'Tech', lights: () => ({ sunrisia: 'green' }),
  },
];

interface WarEvent {
  id: number;
  idx: number;
  headline: string;
  detail: string;
  watch: string;
  tone: Tone;
  at: [number, number];
  place: string;
  lights: Lights;
  major: boolean;
}

interface Inst {
  id: InstId;
  name: string;
  sym: string;
  blurb: string;
  bars: Bar[];
  ind: Indicators;
  path: number[];
  partial: Bar;
}

class Portfolio {
  cash = START_CASH;
  qty: Record<string, number> = {};
  avg: Record<string, number> = {};
  realized: Record<string, number> = {};
  peak = START_CASH;
  maxDrawdown = 0;
  trades = 0;

  equity(price: (id: string) => number) {
    return this.cash + Object.entries(this.qty).reduce((s, [id, q]) => s + q * price(id), 0);
  }

  gross(price: (id: string) => number) {
    return Object.entries(this.qty).reduce((s, [id, q]) => s + Math.abs(q * price(id)), 0);
  }

  pnl(id: string, price: number) {
    return (this.realized[id] ?? 0) + (this.qty[id] ?? 0) * (price - (this.avg[id] ?? price));
  }

  trade(id: string, dq: number, price: number) {
    if (!dq) return;
    const fill = price * (1 + Math.sign(dq) * SLIPPAGE);
    const q = this.qty[id] ?? 0;
    const next = q + dq;
    // The part of the trade that closes an existing position realizes P&L.
    if (q !== 0 && Math.sign(dq) !== Math.sign(q)) {
      const closing = Math.min(Math.abs(dq), Math.abs(q)) * Math.sign(q);
      this.realized[id] = (this.realized[id] ?? 0) + closing * (fill - this.avg[id]);
    }
    if (next === 0) delete this.avg[id];
    else if (q === 0 || Math.sign(next) !== Math.sign(q)) this.avg[id] = fill;
    else if (Math.abs(next) > Math.abs(q)) this.avg[id] = (this.avg[id] * q + fill * dq) / next;
    this.qty[id] = next;
    this.cash -= dq * fill + FEE;
    this.realized[id] = (this.realized[id] ?? 0) - FEE;
    this.trades++;
  }

  mark(eq: number) {
    this.peak = Math.max(this.peak, eq);
    this.maxDrawdown = Math.max(this.maxDrawdown, (this.peak - eq) / this.peak);
  }
}

const etMonthDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const etMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short' });

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export class WarRoom {
  private crisis!: Crisis;
  private insts: Inst[] = [];
  private labels: string[] = [];
  private ticks: string[] = [];
  private events: WarEvent[] = [];
  private revealed: WarEvent[] = [];
  private replay: Replay | null = null;
  private port = new Portfolio();
  private cur = PRE - 1;
  private selected: InstId = 'world';
  private size = 10_000;
  private speed = 2;
  private phase: 'loading' | 'briefing' | 'playing' | 'paused' | 'done' = 'loading';
  private tension = 20;
  private baseVol = 1;
  private chart: ChartView;
  private lastCrisis = '';

  constructor() {
    this.chart = new ChartView($('#war-chart-main'), $('#war-chart-macd'));
    $('#view-war').addEventListener('click', (e) => this.onClick(e));
  }

  /** Called when the tab is shown for the first time. */
  async ensureStarted() {
    if (this.phase === 'loading' && !this.insts.length) await this.newCrisis();
  }

  pause() {
    if (this.phase === 'playing') {
      this.replay?.pause();
      this.setPhase('paused');
    }
  }

  applyTheme() {
    this.chart.applyTheme();
  }

  private async newCrisis() {
    this.replay?.pause();
    this.setPhase('loading');
    const pool = CRISES.filter((c) => c.id !== this.lastCrisis);
    this.crisis = pickOne(pool);
    this.lastCrisis = this.crisis.id;
    const raws = await Promise.all(BASKET.map((b) => loadSeries('daily', b.sym)));
    const startTs = Date.parse(`${this.crisis.start}T21:00:00Z`) / 1000;
    const p = raws[0].findIndex((r) => r[0] >= startTs);
    const ts = raws[0].slice(p - PRE, p + PLAY).map((r) => r[0]);

    this.insts = BASKET.map((b, k) => {
      const byTs = new Map(raws[k].map((r) => [r[0], r]));
      let last: Raw = raws[k].find((r) => r[0] >= ts[0]) ?? raws[k][0];
      const rows = ts.map((t) => (last = byTs.get(t) ?? [t, last[4], last[4], last[4], last[4], 0]));
      const scale = Math.round(20 + Math.random() * 180) / rows[PRE - 1][4];
      const bars = rows.map(([, o, h, l, c, v]) => ({
        o: Math.round(o * scale * 100) / 100,
        h: Math.round(h * scale * 100) / 100,
        l: Math.round(l * scale * 100) / 100,
        c: Math.round(c * scale * 100) / 100,
        v,
      }));
      return { ...b, bars, ind: new Indicators(bars), path: [], partial: bars[PRE - 1] };
    });

    let lastMonth = '';
    this.labels = [];
    this.ticks = [];
    ts.forEach((t, i) => {
      const d = new Date(t * 1000);
      const m = etMonth.format(d);
      this.labels.push(`${i < PRE ? 'Before' : `Day ${i - PRE + 1}`} · ${etMonthDay.format(d)}`);
      this.ticks.push(m !== lastMonth ? m : etMonthDay.format(d));
      lastMonth = m;
    });

    const world = this.insts[0].bars;
    const rets = world.slice(1, PRE).map((b, i) => Math.log(b.c / world[i].c));
    this.baseVol = Math.sqrt(rets.reduce((s, r) => s + r * r, 0) / rets.length) || 0.01;
    this.events = this.buildEvents();
    this.revealed = [];
    this.port = new Portfolio();
    this.cur = PRE - 1;
    this.tension = 25;
    this.replay = new Replay(world, PRE, {
      onBarOpen: (i) => this.onBarOpen(i),
      onTick: (i) => this.onTick(i),
      onBarClose: (i) => this.onBarClose(i),
      onEnd: () => this.onEnd(),
    });
    this.replay.speed = this.speed;
    this.select('world');
    this.renderBasket(true);
    this.renderMap();
    this.renderLog();
    this.renderHead();
    this.setPhase('briefing');
    $('#sitrep').innerHTML = this.sitrep();
    $('#sitrep').hidden = false;
    $('#war-pop').hidden = true;
  }

  private buildEvents(): WarEvent[] {
    const world = this.insts[0].bars;
    const ret = (bars: Bar[], i: number) => Math.log(bars[i].c / bars[i - 1].c);
    const sigma = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length) || 0.01;
    const relSigma: Record<string, number> = {};
    for (const inst of this.insts) {
      const xs = [];
      for (let i = 1; i < PRE; i++) xs.push(inst.id === 'world' ? ret(world, i) : ret(inst.bars, i) - ret(world, i));
      relSigma[inst.id] = sigma(xs);
    }
    const cands: { i: number; rule: Rule; z: number }[] = [];
    for (let i = PRE; i < world.length; i++) {
      for (const rule of RULES) {
        const inst = this.insts.find((x) => x.id === rule.inst)!;
        const r = rule.inst === 'world' ? ret(world, i) : ret(inst.bars, i) - ret(world, i);
        const z = r / relSigma[rule.inst];
        if (rule.dir * z >= rule.z) cands.push({ i, rule, z: Math.abs(z) / rule.z });
      }
    }
    cands.sort((a, b) => b.z - a.z);
    const out: WarEvent[] = [];
    for (const c of cands) {
      if (out.length >= 14) break;
      if (out.some((e) => Math.abs(e.idx - c.i) < 3)) continue;
      const where = c.rule.where(this.crisis);
      const base = where in PLACES ? PLACES[where].at : centroid(countryById(where));
      const jitter = () => (Math.random() - 0.5) * 22;
      const headline = pickOne(c.rule.headlines)
        .replace('{A}', name(this.crisis.a))
        .replace('{B}', this.crisis.bName)
        .replace('{N}', name(this.crisis.neutral))
        .replace('{W}', name(where));
      out.push({
        id: out.length,
        idx: c.i,
        headline,
        detail: c.rule.detail,
        watch: c.rule.watch,
        tone: c.rule.tone,
        at: [base[0] + jitter(), base[1] + jitter()],
        place: name(where),
        lights: c.rule.lights(this.crisis, where),
        major: c.z >= 1.5,
      });
    }
    return out.sort((a, b) => a.idx - b.idx);
  }

  // ---------- Replay ----------

  private onBarOpen(i: number) {
    this.cur = i;
    for (const inst of this.insts) inst.path = buildPath(inst.bars[i]);
  }

  private onTick(i: number) {
    const k = this.replay!.k;
    for (const inst of this.insts) inst.partial = partialAt(inst.bars[i], inst.path, k);
    const sel = this.inst(this.selected);
    this.chart.update(i, sel.partial, sel.ind.at(i, sel.partial.c));
    const eq = this.port.equity((id) => this.price(id));
    this.port.mark(eq);
    // News lands mid-bar: part of the move has happened, the rest is still to come.
    if (k === 4) for (const e of this.events) if (e.idx === i) this.reveal(e);
    this.renderBasket();
  }

  private onBarClose(i: number) {
    const world = this.insts[0].bars;
    const recent = world.slice(Math.max(1, i - 9), i + 1).map((b, j, a) => (j ? Math.log(b.c / a[j - 1].c) : 0)).slice(1);
    const vol = Math.sqrt(recent.reduce((s, r) => s + r * r, 0) / (recent.length || 1));
    const news = this.revealed.filter((e) => e.idx > i - 10).reduce((s, e) => s + (e.tone === 'conflict' ? 9 : e.tone === 'calm' ? -7 : 2), 0);
    const target = Math.max(0, Math.min(100, 15 + 30 * (vol / this.baseVol - 0.6) + news));
    this.tension += (target - this.tension) * 0.35;
    this.renderMap();
    this.renderHead();
  }

  private onEnd() {
    this.setPhase('done');
    $('#debrief .modal-card').innerHTML = this.debrief();
    $('#debrief').hidden = false;
  }

  private reveal(e: WarEvent) {
    this.revealed.push(e);
    this.renderMap();
    this.renderLog();
    if (e.major && this.phase === 'playing') {
      this.pause();
      this.openPop(e);
    }
  }

  // ---------- Trading ----------

  private inst(id: string) {
    return this.insts.find((x) => x.id === id)!;
  }

  private price(id: string) {
    return this.inst(id).partial.c;
  }

  private canTrade() {
    return this.phase === 'playing' || this.phase === 'paused';
  }

  private trade(id: string, dollars: number) {
    if (!this.canTrade()) return this.flash('Trading opens when the crisis starts.');
    const px = this.price(id);
    const dq = Math.trunc(dollars / px);
    const after = this.port.gross((x) => this.price(x)) - Math.abs((this.port.qty[id] ?? 0) * px) + Math.abs(((this.port.qty[id] ?? 0) + dq) * px);
    if (after > MAX_GROSS * this.port.equity((x) => this.price(x))) return this.flash(`Limit reached: total positions can't exceed ${MAX_GROSS}× your equity.`);
    this.port.trade(id, dq, px);
    this.renderBasket(true);
  }

  private closePos(id: string) {
    const q = this.port.qty[id] ?? 0;
    if (q && this.canTrade()) {
      this.port.trade(id, -q, this.price(id));
      this.renderBasket(true);
    }
  }

  private select(id: InstId) {
    this.selected = id;
    const inst = this.inst(id);
    const count = this.phase === 'playing' || this.phase === 'paused' ? this.cur : this.cur + 1;
    this.chart.reset(inst.bars, inst.ind.points, count, this.labels, this.ticks);
    if (count === this.cur) this.chart.update(this.cur, inst.partial, inst.ind.at(this.cur, inst.partial.c));
    $('#wc-head').innerHTML = `<b>${inst.name}</b> <span class="muted">${inst.blurb}</span>`;
    document.querySelectorAll('#basket-rows tr').forEach((r) => r.classList.toggle('sel', (r as HTMLElement).dataset.inst === id));
  }

  // ---------- Controls ----------

  private setPhase(p: WarRoom['phase']) {
    this.phase = p;
    const btn = $('#war-play') as HTMLButtonElement;
    btn.textContent = { loading: 'Start', briefing: 'Start', playing: 'Pause', paused: 'Resume', done: 'New crisis' }[p];
    btn.disabled = p === 'loading';
    if (p !== 'briefing') $('#sitrep').hidden = true;
  }

  private togglePlay() {
    if (!this.replay) return;
    if (this.phase === 'done') return void this.newCrisis();
    if (this.phase === 'briefing' || this.phase === 'paused') {
      $('#war-pop').hidden = true;
      this.setPhase('playing');
      this.replay.play();
    } else if (this.phase === 'playing') this.pause();
  }

  private flash(msg: string) {
    const el = $('#war-flash');
    el.textContent = msg;
    el.hidden = false;
    window.setTimeout(() => (el.hidden = true), 2800);
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-war]');
    const dot = t.closest<HTMLElement | SVGElement>('[data-dot]');
    if (dot) {
      const ev = this.revealed.find((x) => x.id === Number(dot.dataset.dot));
      if (ev) {
        this.pause();
        this.openPop(ev);
      }
      return;
    }
    const row = t.closest<HTMLElement>('#basket-rows tr');
    if (row && !act) return this.select(row.dataset.inst as InstId);
    if (!act) return;
    const v = act.dataset.v!;
    switch (act.dataset.war) {
      case 'play':
        this.togglePlay();
        break;
      case 'new':
        this.newCrisis();
        break;
      case 'speed':
        this.speed = Number(v);
        if (this.replay) this.replay.speed = this.speed;
        document.querySelectorAll('[data-war="speed"]').forEach((b) => b.classList.toggle('active', b === act));
        break;
      case 'size':
        this.size = Number(v);
        document.querySelectorAll('[data-war="size"]').forEach((b) => b.classList.toggle('active', b === act));
        this.renderBasket(true);
        break;
      case 'buy':
        this.trade(v, this.size);
        break;
      case 'sell':
        this.trade(v, -this.size);
        break;
      case 'close':
        this.closePos(v);
        break;
      case 'resume':
        $('#war-pop').hidden = true;
        if (this.phase === 'paused') this.togglePlay();
        break;
      case 'dismiss':
        $('#war-pop').hidden = true;
        break;
    }
  }

  // ---------- Rendering ----------

  private lights(): Lights {
    const lit: Lights = {};
    for (const e of this.revealed) if (e.idx > this.cur - 7) Object.assign(lit, e.lights);
    return lit;
  }

  private renderMap() {
    const dots: MapDot[] = this.revealed.map((e) => ({ id: e.id, at: e.at, tone: e.tone, fresh: e.idx > this.cur - 3 }));
    $('#war-map').innerHTML = renderMap(this.lights(), dots, this.tension, true);
  }

  private renderHead() {
    const c = this.crisis;
    $('#war-title').textContent = c.op;
    $('#war-sub').textContent = `${name(c.a)} vs ${c.bName} · real prices from a real crisis, revealed at the end`;
    const t = Math.round(this.tension);
    const label = t < 20 ? 'Calm seas' : t < 40 ? 'Uneasy' : t < 60 ? 'Tense' : t < 80 ? 'Crisis' : 'Full war footing';
    $('#tension-bar').style.width = `${t}%`;
    $('.gauge').style.setProperty('--fill', `${t}%`);
    $('#tension-label').textContent = `${label} · ${t}`;
    const played = Math.max(0, this.cur - PRE + 1);
    $('#war-clock').textContent = `${this.labels[this.cur] ?? ''} · day ${played} of ${PLAY}`;
  }

  private renderBasket(full = false) {
    const px = (id: string) => this.price(id);
    const eq = this.port.equity(px);
    if (full || !$('#basket-rows').children.length) {
      $('#basket-rows').innerHTML = this.insts
        .map(
          (i) => `<tr data-inst="${i.id}" class="${i.id === this.selected ? 'sel' : ''}">
          <td><b>${i.name}</b></td>
          <td class="r num" data-cell="px"></td>
          <td class="r num" data-cell="chg"></td>
          <td class="r num" data-cell="pos"></td>
          <td class="r num" data-cell="pnl"></td>
          <td class="acts">
            <button class="btn small sell" data-war="sell" data-v="${i.id}" title="Sell $${this.size / 1000}k (shorts if flat)">−</button>
            <button class="btn small buy" data-war="buy" data-v="${i.id}" title="Buy $${this.size / 1000}k">+</button>
            <button class="btn small ghost" data-war="close" data-v="${i.id}" title="Close this position">×</button>
          </td></tr>`,
        )
        .join('');
    }
    for (const inst of this.insts) {
      const row = document.querySelector(`#basket-rows tr[data-inst="${inst.id}"]`);
      if (!row) continue;
      const p = inst.partial.c;
      const chg = (p / inst.bars[PRE - 1].c - 1) * 100;
      const q = this.port.qty[inst.id] ?? 0;
      const pnl = this.port.pnl(inst.id, p);
      const cell = (k: string) => row.querySelector(`[data-cell="${k}"]`)!;
      cell('px').textContent = p.toFixed(2);
      cell('chg').innerHTML = `<span class="${tone(chg)}">${pct(chg)}</span>`;
      cell('pos').innerHTML = q ? `<span class="${q > 0 ? 'up' : 'down'}">${q > 0 ? 'Long' : 'Short'} ${money(Math.abs(q * p)).replace('.00', '')}</span>` : '<span class="muted">—</span>';
      cell('pnl').innerHTML = pnl ? `<span class="${tone(pnl)}">${money(pnl)}</span>` : '';
    }
    const ret = (eq / START_CASH - 1) * 100;
    $('#war-acct').innerHTML = `
      <div><div class="lbl">Equity</div><div class="val">${money(eq)}</div></div>
      <div><div class="lbl">Return</div><div class="val ${tone(ret)}">${pct(ret, 2)}</div></div>
      <div><div class="lbl">Cash</div><div>${money(this.port.cash)}</div></div>
      <div><div class="lbl">Exposure</div><div>${((this.port.gross(px) / eq) * 100).toFixed(0)}% of equity</div></div>`;
  }

  private renderLog() {
    $('#war-log').innerHTML = this.revealed.length
      ? this.revealed
          .map(
            (e) => `<li class="${e.tone}" data-dot="${e.id}"><span class="when">${this.labels[e.idx]} · ${e.place}</span>${e.headline}</li>`,
          )
          .join('')
      : '<li class="muted">Dispatches appear here and on the map as the crisis unfolds. Click any dot or dispatch for details.</li>';
  }

  private openPop(e: WarEvent) {
    const pop = $('#war-pop');
    pop.className = `war-pop ${e.tone}`;
    pop.innerHTML = `
      <div class="kicker">${this.labels[e.idx]} · ${e.place}</div>
      <div class="headline">${e.headline}</div>
      <p>${e.detail}</p>
      <p class="watch">Desks are watching: <b>${e.watch}</b></p>
      <div class="pop-actions">
        <button class="btn ghost small" data-war="dismiss">Close</button>
        ${this.phase === 'paused' ? '<button class="btn primary small" data-war="resume">Resume</button>' : ''}
      </div>`;
    const svg = $('#war-map svg');
    const r = svg.getBoundingClientRect();
    const host = $('.map-card').getBoundingClientRect();
    const x = r.left - host.left + (e.at[0] / 1000) * r.width;
    const y = r.top - host.top + (e.at[1] / 520) * r.height;
    pop.hidden = false;
    pop.style.left = `${Math.min(Math.max(8, x - pop.offsetWidth / 2), host.width - pop.offsetWidth - 8)}px`;
    pop.style.top = `${y + 18 + pop.offsetHeight > host.height ? Math.max(8, y - pop.offsetHeight - 14) : y + 18}px`;
  }

  private sitrep() {
    const c = this.crisis;
    return `
      <div class="kicker">Situation report</div>
      <h3 class="op">${c.op}</h3>
      <p>${c.story}</p>
      <p class="muted">You manage $100,000 across six markets. Buy what you think will win, short what you think will lose, and move money as the news breaks. Each click trades your chosen amount. Positions can total up to ${MAX_GROSS}× your equity.</p>
      <ul class="sitrep-list">${BASKET.map((b) => `<li><b>${b.name}</b>: ${b.blurb}</li>`).join('')}</ul>
      <button class="btn primary" data-war="play">Begin</button>`;
  }

  private debrief() {
    const px = (id: string) => this.price(id);
    const eq = this.port.equity(px);
    const ret = (eq / START_CASH - 1) * 100;
    const rows = this.insts.map((i) => ({ i, chg: (i.bars[i.bars.length - 1].c / i.bars[PRE - 1].c - 1) * 100, pnl: this.port.pnl(i.id, i.partial.c) }));
    const world = rows[0].chg;
    const best = [...rows].sort((a, b) => b.chg - a.chg)[0];
    const worst = [...rows].sort((a, b) => a.chg - b.chg)[0];
    return `
      <h2 id="debrief-title" style="margin:0">The dust settles</h2>
      <div class="reveal">
        <div class="muted">${this.crisis.op} was really</div>
        <div class="was" style="font-size:1.2rem">${this.crisis.real}</div>
        <div class="muted">${BASKET.map((b) => `${b.name} = ${b.sym}`).join(' · ')}</div>
      </div>
      <div class="stat-row num">
        <div class="stat"><div class="lbl">Your return</div><div class="val ${tone(ret)}">${pct(ret, 2)}</div></div>
        <div class="stat"><div class="lbl">World Index</div><div class="val ${tone(world)}">${pct(world, 2)}</div></div>
        <div class="stat"><div class="lbl">Max drawdown</div><div class="val">${pct(-this.port.maxDrawdown * 100, 2)}</div></div>
        <div class="stat"><div class="lbl">Trades</div><div class="val">${this.port.trades}</div></div>
      </div>
      <h3>How each market did</h3>
      <table class="plain num"><thead><tr><th>Market</th><th class="r">Move</th><th class="r">Your P&amp;L</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.i.name}</td><td class="r ${tone(r.chg)}">${pct(r.chg)}</td><td class="r ${tone(r.pnl)}">${r.pnl ? money(r.pnl) : '—'}</td></tr>`).join('')}
      </tbody></table>
      <p>The winning rotation was <b>long ${best.i.name}</b> (${pct(best.chg)})${worst.chg < 0 ? ` and <b>short ${worst.i.name}</b> (${pct(worst.chg)})` : ''}. In a crisis, the money doesn't disappear. It moves.</p>
      <p class="hint">War Room rounds don't affect your skill ratings yet.</p>
      <div class="modal-actions">
        <button class="btn ghost" data-act="review">Review</button>
        <button class="btn primary" data-war-new>New crisis</button>
      </div>`;
  }

  newFromDebrief() {
    $('#debrief').hidden = true;
    this.newCrisis();
  }
}
