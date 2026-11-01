import { ChartView } from './chart';
import { loadSeries } from './data';
import { Indicators } from './indicators';
import { Replay, buildPath, partialAt } from './replay';
import type { Bar, Raw } from './types';
import { money, pct, tone } from './ui';
import { MAP } from './mapdata';
import { WarBriefing } from './warbriefing';
import { ICON_INFO, LANE_INFO, PLACE_INFO, anchor, nationById, placeName, renderMap, type Light, type MapDot } from './worldmap';

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

/** One-click macro trades: the classic crisis moves, each named after the pattern it plays. */
const PLAYBOOKS: { id: string; name: string; legs: [InstId, 1 | -1][]; hint: string }[] = [
  { id: 'safety', name: 'Flight to safety', legs: [['world', -1], ['gold', 1]], hint: 'Sell the World Index, buy Gold. For when fear is spreading.' },
  { id: 'supply', name: 'Supply shock', legs: [['energy', 1], ['airlines', -1]], hint: "Buy Energy, short Airlines. For when oil can't get out." },
  { id: 'hedge', name: 'Escalation hedge', legs: [['defense', 1], ['gold', 1]], hint: 'Buy Defense and Gold. Insurance in case things get worse.' },
  { id: 'relief', name: 'Relief rally', legs: [['world', 1], ['tech', 1], ['airlines', 1]], hint: 'Buy the World Index, Tech and Airlines. For when peace breaks out.' },
  { id: 'cash', name: 'Go to cash', legs: [], hint: 'Close every position.' },
];
const BRIEFED_KEY = 'atlas.warBriefed';
/** How long dots stay on the map, in trading days. */
const DOT_AFTER_READ = 3;
const DOT_UNREAD = 20;
const MAX_ZOOM = 6;
const NEWS_ZOOM = 2.6;

interface Cam {
  x: number;
  y: number;
  k: number;
}
const HOME: Cam = { x: MAP.w / 2, y: MAP.h / 2, k: 1 };
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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
    a: 'bleak',
    b: ['austeria', 'grevance', 'brittle'],
    bName: 'the Austeria Pact',
    neutral: 'discretia',
    story: "The Bleak Federation has parked a remarkable number of tanks along Austeria's border for what it calls winter exercises. Diplomats are working overtime, energy traders aren't sleeping, and Austeria has just remembered where its gas comes from.",
    real: "Russia's invasion of Ukraine, January to July 2022",
  },
  {
    id: 'tantrum',
    start: '2025-02-18',
    op: 'The Great Tariff Tantrum',
    a: 'debts',
    b: ['supplychina', 'apologia', 'grevance'],
    bName: 'most of its trading partners',
    neutral: 'discretia',
    story: 'The United Debts has rediscovered tariffs and is applying them generously, friends included. Supplychina, North Apologia and Grèvance are drafting retaliation lists and very firm press releases.',
    real: 'The 2025 US tariff shock, February to August 2025',
  },
  {
    id: 'spat',
    start: '2018-09-20',
    op: 'Trade Spat, Season One',
    a: 'debts',
    b: ['supplychina'],
    bName: 'Supplychina',
    neutral: 'deflatia',
    story: 'The United Debts and Supplychina disagree about who owes whom for the last few hundred billion phones. Both sides keep raising tariffs, "just a little," and promising this round is the last.',
    real: 'The 2018 US–China trade war and the late-2018 selloff, September 2018 to March 2019',
  },
  {
    id: 'hormuzzle',
    start: '2023-09-20',
    op: 'Operation Hormuzzle',
    a: 'crude',
    b: ['debts', 'brittle'],
    bName: 'the allied navies',
    neutral: 'discretia',
    story: 'Fighting has flared near the Crude Emirates, and the world is staring at the Strait of Hormuzzle, where about a fifth of its oil sails past every day. Shipping insurers have stopped answering the phone.',
    real: 'The October 2023 Middle East conflict, September 2023 to March 2024',
  },
];

type Tone = MapDot['tone'];
type Lights = Record<string, Light>;

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
  /** A shipping lane this kind of news cuts on the map. */
  cut?: string;
}

const pickOne = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const fromB = (c: Crisis) => pickOne(c.b);
const name = placeName;
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
    headlines: ['Talks open in {N}; relief rally', 'Back-channel deal between {A} and {B} reported; stocks jump', '{A} signals a pause; buyers rush back'],
    detail: 'Hope is back, at least for today. Relief rallies can be violent, and shorts get squeezed. The question is whether it lasts.',
    watch: 'World Index, Airlines, Tech', lights: calmLights,
  },
  {
    inst: 'energy', dir: 1, z: 2, tone: 'conflict', where: () => 'hormuzzle', cut: 'hormuzzle',
    headlines: ['Tankers divert from the Strait of Hormuzzle; oil spikes', '{A} threatens pipeline flows; energy surges', 'Insurers triple rates for ships near the Strait of Hormuzzle'],
    detail: 'Supply scares push oil producers up and hurt anyone who burns fuel, airlines first of all.',
    watch: 'Energy, Airlines', lights: (c) => ({ crude: 'amber', [c.a]: 'red' }),
  },
  {
    inst: 'energy', dir: -1, z: 2, tone: 'econ', where: () => 'crude',
    headlines: ['The Crude Emirates open the taps to calm prices; oil slides', 'Oil glut fears return as {W} boosts output'],
    detail: 'More supply means cheaper oil: bad for producers, a gift for airlines.',
    watch: 'Energy, Airlines', lights: () => ({ crude: 'green' }),
  },
  {
    inst: 'defense', dir: 1, z: 1.8, tone: 'econ', where: fromB,
    headlines: ['{W} votes a record defense budget; arms makers rally', '{W} orders a very large number of very expensive jets', '{W} pledges to spend more on defense, again'],
    detail: 'Governments ordering weapons is direct revenue for defense companies, often for years.',
    watch: 'Defense', lights: (_c, w) => ({ [w]: 'amber' }),
  },
  {
    inst: 'gold', dir: 1, z: 1.8, tone: 'econ', where: () => 'discretia',
    headlines: ['Vaults in Discretia report a waiting list', 'Investors flee to gold as the {A} standoff drags on'],
    detail: 'When people get scared, they buy things that have held value for thousands of years.',
    watch: 'Gold', lights: () => ({ discretia: 'amber' }),
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
    inst: 'tech', dir: -1, z: 2, tone: 'econ', where: () => 'fab', cut: 'fab',
    headlines: ['Chip shipments through the Fab Strait stall; tech sells off', 'New export rules hit gadget makers in Supplychina'],
    detail: 'Tech depends on long global supply chains. Any disruption shows up in the price.',
    watch: 'Tech', lights: () => ({ supplychina: 'amber' }),
  },
  {
    inst: 'tech', dir: 1, z: 2, tone: 'calm', where: () => 'deflatia',
    headlines: ['Tech giants shrug off the crisis with blowout sales', 'Investors pile back into growth stocks'],
    detail: 'Risk appetite is back. Growth stocks lead when fear fades.',
    watch: 'Tech', lights: () => ({ deflatia: 'green' }),
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
  cut?: string;
  major: boolean;
  /** The bar on which you read it; its dot fades soon after. */
  seenAt?: number;
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
  /** Your return and the World Index's, in %, at each closed bar since the crisis began. */
  private race: { you: number[]; world: number[] } = { you: [0], world: [0] };
  private briefing = new WarBriefing();
  private flashTimer = 0;
  private cam: Cam = { ...HOME };
  /** Where the camera goes back to after it flies in to a story. */
  private returnCam: Cam | null = null;
  private camAnim = 0;
  private popEvent: WarEvent | null = null;
  private drag: { x: number; y: number; cam: Cam; moved: boolean } | null = null;
  private dragged = false;

  constructor() {
    this.chart = new ChartView($('#war-chart-main'), $('#war-chart-macd'));
    $('#view-war').addEventListener('click', (e) => this.onClick(e));
    $('#war-map').addEventListener('mousemove', (e) => this.hover(e));
    $('#war-map').addEventListener('mouseleave', () => ($('#war-tip').hidden = true));
    this.wireCamera();
    $('#war-plays').innerHTML = PLAYBOOKS.map((p) => `<button class="btn small play" data-war="play-book" data-v="${p.id}" title="${p.hint}">${p.name}</button>`).join('');
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
    this.race = { you: [0], world: [0] };
    this.cur = PRE - 1;
    this.tension = 25;
    this.cam = { ...HOME };
    this.returnCam = null;
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
    this.renderHeat();
    this.setPhase('briefing');
    $('#sitrep').innerHTML = this.sitrep();
    let briefed = true;
    try {
      briefed = localStorage.getItem(BRIEFED_KEY) === '1';
    } catch {}
    if (briefed) $('#sitrep').hidden = false;
    else this.brief();
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
      const base = anchor(where);
      const jitter = () => (Math.random() - 0.5) * 14;
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
        cut: c.rule.cut,
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
    if (i >= PRE) {
      this.race.you.push((this.port.equity((id) => this.price(id)) / START_CASH - 1) * 100);
      this.race.world.push((world[i].c / world[PRE - 1].c - 1) * 100);
    }
    this.renderMap();
    this.renderHead();
    this.renderHeat();
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
      this.focus(e);
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

  /** Runs every leg of a playbook at the chosen size, or none of them if it would break the exposure limit. */
  private playbook(id: string) {
    const book = PLAYBOOKS.find((p) => p.id === id)!;
    if (!this.canTrade()) return this.flash('Trading opens when the crisis starts.');
    if (!book.legs.length) {
      const open = Object.keys(this.port.qty).filter((k) => this.port.qty[k]);
      if (!open.length) return this.flash('You are already all in cash.');
      for (const k of open) this.port.trade(k, -this.port.qty[k], this.price(k));
      this.renderBasket(true);
      return this.flash('Go to cash: every position closed.', 'ok');
    }
    const px = (x: string) => this.price(x);
    const qty = { ...this.port.qty };
    const dq = book.legs.map(([inst, dir]) => [inst, Math.trunc((dir * this.size) / px(inst))] as const);
    for (const [inst, q] of dq) qty[inst] = (qty[inst] ?? 0) + q;
    const gross = Object.entries(qty).reduce((s, [k, q]) => s + Math.abs(q * px(k)), 0);
    if (gross > MAX_GROSS * this.port.equity(px)) return this.flash(`Limit reached: total positions can't exceed ${MAX_GROSS}× your equity.`);
    for (const [inst, q] of dq) this.port.trade(inst, q, px(inst));
    this.renderBasket(true);
    const verb = (d: number) => (d > 0 ? 'bought' : 'sold');
    this.flash(`${book.name}: ${book.legs.map(([inst, d]) => `${verb(d)} ${this.inst(inst).name}`).join(', ')}.`, 'ok');
  }

  private brief() {
    $('#sitrep').hidden = true;
    $('#war-pop').hidden = true;
    this.briefing.start(() => {
      try {
        localStorage.setItem(BRIEFED_KEY, '1');
      } catch {}
      if (this.phase === 'briefing') $('#sitrep').hidden = false;
    });
  }

  private hover(e: MouseEvent) {
    const t = e.target as Element;
    const tip = $('#war-tip');
    const el = t.closest('[data-country],[data-icon],[data-place],[data-lane]');
    if (!el || t.closest('[data-dot]')) return void (tip.hidden = true);
    const d = (el as SVGElement).dataset;
    let html = '';
    if (d.country) {
      const n = nationById(d.country)!;
      html = `<b>${n.name}</b><i>${n.quip}</i><span class="exp">If disrupted: ${n.exposure}</span>`;
    } else if (d.icon) html = `<b>${ICON_INFO[d.icon]}</b>`;
    else if (d.place) html = `<b>${placeName(d.place)}</b><i>${PLACE_INFO[d.place]}</i>`;
    else if (d.lane) html = `<b>${LANE_INFO[d.lane]}</b>${el.classList.contains('cut') ? '<span class="exp">Disrupted right now</span>' : ''}`;
    tip.innerHTML = html;
    tip.hidden = false;
    const host = $('.map-card').getBoundingClientRect();
    const x = e.clientX - host.left + 14;
    tip.style.left = `${x + tip.offsetWidth > host.width - 8 ? x - tip.offsetWidth - 28 : x}px`;
    tip.style.top = `${Math.min(e.clientY - host.top + 14, host.height - tip.offsetHeight - 8)}px`;
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
      this.closePop();
      this.setPhase('playing');
      this.replay.play();
    } else if (this.phase === 'playing') this.pause();
  }

  private flash(msg: string, kind: 'warn' | 'ok' = 'warn') {
    const el = $('#war-flash');
    el.textContent = msg;
    el.classList.toggle('ok', kind === 'ok');
    el.hidden = false;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => (el.hidden = true), 3200);
  }

  private onClick(e: Event) {
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-war]');
    const dot = t.closest<HTMLElement | SVGElement>('[data-dot]');
    if (dot) {
      const ev = this.revealed.find((x) => x.id === Number(dot.dataset.dot));
      if (ev && !this.dragged) {
        this.pause();
        this.focus(ev);
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
        if (this.phase === 'paused') this.togglePlay();
        else this.closePop();
        break;
      case 'zoom':
        this.returnCam = null;
        if (v === 'home') this.flyTo(HOME);
        else this.flyTo({ ...this.cam, k: this.cam.k * (v === 'in' ? 1.6 : 1 / 1.6) }, 350);
        break;
      case 'play-book':
        this.playbook(v);
        break;
      case 'brief':
        this.pause();
        this.brief();
        break;
      case 'dismiss':
        this.closePop();
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
    const dots: MapDot[] = this.revealed
      .filter((e) => (e.seenAt !== undefined ? this.cur - e.seenAt <= DOT_AFTER_READ : this.cur - e.idx <= DOT_UNREAD))
      .map((e) => ({
        id: e.id,
        at: e.at,
        tone: e.tone,
        state: e.seenAt !== undefined ? (this.cur - e.seenAt >= DOT_AFTER_READ ? 'leaving' : '') : this.cur - e.idx < 3 ? 'fresh' : this.cur - e.idx > DOT_UNREAD / 2 ? 'old' : '',
      }));
    const cuts = new Set(this.revealed.filter((e) => e.cut && e.idx > this.cur - 10).map((e) => e.cut!));
    $('#war-map').innerHTML = renderMap({ lit: this.lights(), dots, cuts, tension: this.tension });
    this.applyCamera();
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
    this.renderRace(eq);
  }

  /** You against the World Index since the crisis began, with the forming bar live at the end. */
  private renderRace(eq: number) {
    const live = this.phase === 'playing' || this.phase === 'paused';
    const you = [...this.race.you];
    const world = [...this.race.world];
    if (live && this.cur >= PRE) {
      you.push((eq / START_CASH - 1) * 100);
      world.push((this.price('world') / this.inst('world').bars[PRE - 1].c - 1) * 100);
    }
    const all = [...you, ...world, 0];
    const lo = Math.min(...all, -1);
    const hi = Math.max(...all, 1);
    const W = 240;
    const H = 64;
    const x = (i: number) => (i / PLAY) * W;
    const y = (v: number) => 4 + ((hi - v) / (hi - lo)) * (H - 8);
    const line = (vs: number[]) => vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ry = you[you.length - 1];
    const rw = world[world.length - 1];
    $('#war-race').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Your return against the World Index">
        <line class="zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
        <polyline class="world-line" points="${line(world)}"/>
        <polyline class="you-line" points="${line(you)}"/>
      </svg>
      <div class="race-key num"><span class="you">You ${pct(ry, 1)}</span><span class="ahead ${tone(ry - rw)}">${ry - rw >= 0 ? 'Ahead' : 'Behind'} by ${Math.abs(ry - rw).toFixed(1)} pts</span><span class="wld">World ${pct(rw, 1)}</span></div>`;
  }

  /** Which markets are winning: each one's last 5 days relative to the World Index (the World Index itself is shown outright). */
  private renderHeat() {
    const i = this.cur;
    const back = Math.max(PRE - 1, i - 5);
    const chg = (id: InstId) => {
      const b = this.inst(id).bars;
      return (b[i].c / b[back].c - 1) * 100;
    };
    const w = chg('world');
    const started = i >= PRE;
    $('#war-heat').innerHTML = this.insts
      .map((inst) => {
        const v = inst.id === 'world' ? w : chg(inst.id) - w;
        const a = started ? Math.min(Math.abs(v) / 6, 1) * 0.7 + 0.08 : 0;
        const bg = v > 0 ? `rgba(46, 125, 80, ${a})` : `rgba(178, 58, 46, ${a})`;
        const label = inst.id === 'world' ? 'World' : inst.name;
        return `<div class="cell ${a > 0.45 ? 'strong' : ''}" style="background:${started ? bg : 'transparent'}" title="${inst.id === 'world' ? 'World Index, last 5 days' : `${inst.name} minus the World Index, last 5 days`}"><span>${label}</span><b class="num">${started ? `${v > 0 ? '+' : ''}${v.toFixed(1)}` : '—'}</b></div>`;
      })
      .join('');
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

  /** Flies the camera in to a story, then opens it. Reading it starts its dot's countdown. */
  private focus(e: WarEvent) {
    e.seenAt ??= this.cur;
    this.returnCam ??= { ...this.cam };
    this.flyTo({ x: e.at[0], y: e.at[1], k: Math.max(this.cam.k, NEWS_ZOOM) }).then(() => this.openPop(e));
  }

  private closePop() {
    $('#war-pop').hidden = true;
    this.popEvent = null;
    if (this.returnCam) {
      this.flyTo(this.returnCam);
      this.returnCam = null;
    }
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
    pop.hidden = false;
    this.popEvent = e;
    this.placePop();
  }

  private placePop() {
    const e = this.popEvent;
    const svg = document.querySelector('#war-map svg');
    if (!e || !svg) return;
    const pop = $('#war-pop');
    const host = $('.map-card').getBoundingClientRect();
    const [sx, sy] = this.toScreen(e.at);
    const x = sx - host.left;
    const y = sy - host.top;
    pop.style.left = `${Math.min(Math.max(8, x - pop.offsetWidth / 2), host.width - pop.offsetWidth - 8)}px`;
    pop.style.top = `${y + 18 + pop.offsetHeight > host.height ? Math.max(8, y - pop.offsetHeight - 14) : y + 18}px`;
  }

  // ---------- Camera ----------

  private view(c = this.cam) {
    const w = MAP.w / c.k;
    const h = MAP.h / c.k;
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }

  private clamp(c: Cam): Cam {
    const k = Math.min(MAX_ZOOM, Math.max(1, c.k));
    const hw = MAP.w / (2 * k);
    const hh = MAP.h / (2 * k);
    return { k, x: Math.min(MAP.w - hw, Math.max(hw, c.x)), y: Math.min(MAP.h - hh, Math.max(hh, c.y)) };
  }

  private applyCamera() {
    const svg = document.querySelector<SVGSVGElement>('#war-map svg');
    if (!svg) return;
    const v = this.view();
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    svg.style.setProperty('--zs', String(Math.sqrt(this.cam.k)));
    if (this.popEvent) this.placePop();
  }

  /** Map coordinates to screen pixels (the SVG keeps its aspect ratio, so one scale fits both axes). */
  private toScreen([mx, my]: readonly number[]) {
    const r = document.querySelector('#war-map svg')!.getBoundingClientRect();
    const v = this.view();
    return [r.left + ((mx - v.x) / v.w) * r.width, r.top + ((my - v.y) / v.h) * r.height];
  }

  private toMap(clientX: number, clientY: number) {
    const r = document.querySelector('#war-map svg')!.getBoundingClientRect();
    const v = this.view();
    return [v.x + ((clientX - r.left) / r.width) * v.w, v.y + ((clientY - r.top) / r.height) * v.h, (clientX - r.left) / r.width, (clientY - r.top) / r.height];
  }

  private flyTo(target: Cam, ms = 650) {
    cancelAnimationFrame(this.camAnim);
    const from = { ...this.cam };
    const to = this.clamp(target);
    return new Promise<void>((done) => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = ease(t);
        // Zoom moves in log space so flying in and out feel equally fast.
        this.cam = this.clamp({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, k: from.k * (to.k / from.k) ** e });
        this.applyCamera();
        if (t < 1) this.camAnim = requestAnimationFrame(step);
        else done();
      };
      this.camAnim = requestAnimationFrame(step);
    });
  }

  private wireCamera() {
    const el = $('#war-map');
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        cancelAnimationFrame(this.camAnim);
        this.returnCam = null;
        const [mx, my, fx, fy] = this.toMap(e.clientX, e.clientY);
        const k = Math.min(MAX_ZOOM, Math.max(1, this.cam.k * Math.exp(-e.deltaY * 0.0018)));
        // Keep the point under the cursor where it is.
        const w = MAP.w / k;
        const h = MAP.h / k;
        this.cam = this.clamp({ k, x: mx - fx * w + w / 2, y: my - fy * h + h / 2 });
        this.applyCamera();
      },
      { passive: false },
    );
    el.addEventListener('dblclick', (e) => {
      const [mx, my] = this.toMap(e.clientX, e.clientY);
      this.returnCam = null;
      this.flyTo({ x: mx, y: my, k: this.cam.k * 2 }, 400);
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, cam: { ...this.cam }, moved: false };
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) {
        d.moved = true;
        cancelAnimationFrame(this.camAnim);
        this.returnCam = null;
        el.classList.add('dragging');
        $('#war-tip').hidden = true;
      }
      const r = el.getBoundingClientRect();
      const v = this.view(d.cam);
      this.cam = this.clamp({ ...d.cam, x: d.cam.x - (dx / r.width) * v.w, y: d.cam.y - (dy / r.height) * v.h });
      this.applyCamera();
    });
    window.addEventListener('pointerup', () => {
      // A drag shouldn't also count as a click on whatever it ended over.
      this.dragged = !!this.drag?.moved;
      this.drag = null;
      el.classList.remove('dragging');
      setTimeout(() => (this.dragged = false), 0);
    });
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
