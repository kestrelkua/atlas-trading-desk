import { ChartView } from './chart';
import { loadSeries } from './data';
import { Indicators } from './indicators';
import { Replay, buildPath, partialAt } from './replay';
import type { Bar, Raw } from './types';
import { money, pct, tone } from './ui';
import { MAP } from './mapdata';
import { WarBriefing } from './warbriefing';
import { setWelcome } from './home';
import {
  CALL_POINTS, THESES, WAR_LESSONS, WAR_SKILLS, gradeCall, loadWarProfile, recommendWar, recordWarRound, saveWarProfile, scoreWar, thesisName,
  type CallGrade, type ThesisId, type WarFacts, type WarLesson, type WarScores,
} from './warlearn';
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
const BOOK_THESIS: Record<string, ThesisId> = { safety: 'safe', supply: 'supply', hedge: 'hedge', relief: 'relief' };
/** Theses and desk calls are checked this many trading days later. */
const CHECK_DAYS = 5;
const CALL_SECONDS = 10;
const MAX_CALLS = 5;
const LADDER = ['Calm', 'Watch', 'Tense', 'Crisis', 'War footing'];
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
  /** What drove it, for the after-action summary. */
  driver: string;
  real: string;
  /** What actually happened, revealed at the end. */
  timeline: [string, string][];
}

type Snap = Record<string, number>;

/** One fill. Opening fills carry a thesis that gets checked against the data a few days later. */
interface Fill {
  idx: number;
  inst: InstId;
  dq: number;
  px: number;
  opening: boolean;
  /** Sold the World Index (or went to cash): checked later for panic selling. */
  derisk: boolean;
  thesis: ThesisId | null;
  snap: Snap;
  verdict?: { right: boolean; why: string; pnl: number };
}

interface DeskCall {
  eventId: number;
  idx: number;
  choice: string;
  snap: Snap;
  outcomes?: Record<string, number>;
  grade?: CallGrade;
}

/** Each fictional crisis plays over the real prices of a real geopolitical episode, revealed at the end. */
const CRISES: Crisis[] = [
  {
    id: 'chill',
    start: '2022-01-18',
    op: 'The Eastern Border Crisis',
    a: 'bleak',
    b: ['austeria', 'grevance', 'brittle'],
    bName: 'Austeria',
    neutral: 'discretia',
    story: "The Bleak Federation has massed troops along Austeria's eastern border and calls it a winter exercise. Talks are under way and energy markets are jumpy: Austeria buys most of its gas from the country now camped on its doorstep.",
    driver: 'a land war and an energy shock',
    real: "Russia's invasion of Ukraine, January to July 2022",
    timeline: [
      ['Feb 24, 2022', 'Russia invades Ukraine. US stocks fall sharply at the open, then close higher the same day.'],
      ['Mar 8, 2022', 'The US bans Russian oil imports; oil hits its highest price since 2008.'],
      ['Mar 16, 2022', 'The Federal Reserve starts raising interest rates to fight inflation.'],
      ['Jun 16, 2022', 'The S&P 500 closes at its lowest level of the first half, down over 20% from its peak.'],
    ],
  },
  {
    id: 'tantrum',
    start: '2025-02-18',
    op: 'The Tariff Escalation',
    a: 'debts',
    b: ['supplychina', 'apologia', 'grevance'],
    bName: 'its trading partners',
    neutral: 'discretia',
    story: 'The United Debts has announced sweeping tariffs on imports, allies included. Supplychina, North Apologia and Grèvance are preparing retaliation, and companies with global supply chains are rewriting their forecasts.',
    driver: 'a tariff shock between trading partners',
    real: 'The 2025 US tariff shock, February to August 2025',
    timeline: [
      ['Feb 1, 2025', 'The US announces tariffs on Canada, Mexico and China.'],
      ['Apr 2, 2025', "Sweeping \"Liberation Day\" tariffs are announced on most of the world."],
      ['Apr 8, 2025', 'The S&P 500 closes nearly 19% below its February peak.'],
      ['Apr 9, 2025', 'A 90-day tariff pause is announced; the S&P 500 jumps 9.5%, one of its best days ever.'],
      ['May 12, 2025', 'The US and China agree to cut tariffs for 90 days; stocks rally again.'],
    ],
  },
  {
    id: 'spat',
    start: '2018-09-20',
    op: 'The Pacific Trade Dispute',
    a: 'debts',
    b: ['supplychina'],
    bName: 'Supplychina',
    neutral: 'deflatia',
    story: 'The United Debts and Supplychina are locked in a widening trade dispute over a few hundred billion dollars of goods. Each new round of tariffs is announced as the last one.',
    driver: 'an escalating trade war',
    real: 'The 2018 US–China trade war and the late-2018 selloff, September 2018 to March 2019',
    timeline: [
      ['Sep 24, 2018', 'US tariffs on $200 billion of Chinese goods take effect.'],
      ['Oct 10, 2018', 'The S&P 500 drops over 3% in a day as rate and trade fears collide.'],
      ['Dec 1, 2018', 'A G20 dinner produces a 90-day trade truce. The relief lasts about a day.'],
      ['Dec 24, 2018', 'The Christmas Eve low: the S&P 500 is down nearly 20% from its peak.'],
      ['Jan 4, 2019', 'The Fed signals patience on rates; stocks begin a strong rebound.'],
    ],
  },
  {
    id: 'hormuzzle',
    start: '2023-09-20',
    op: 'The Gulf Shipping Crisis',
    a: 'crude',
    b: ['debts', 'brittle'],
    bName: 'the allied navies',
    neutral: 'discretia',
    story: 'Fighting has broken out near the Crude Emirates. About a fifth of the world’s oil passes through the Strait of Hormuzzle, and insurers are repricing every voyage that goes near it.',
    driver: 'fear for the world’s oil supply',
    real: 'The October 2023 Middle East conflict, September 2023 to March 2024',
    timeline: [
      ['Oct 7, 2023', 'Hamas attacks Israel, and war follows in Gaza. Oil jumps on fears it will spread.'],
      ['Oct 27, 2023', 'The S&P 500 hits its low for the period, about 10% below its summer high.'],
      ['Nov 19, 2023', 'Houthi forces seize a cargo ship; attacks on Red Sea shipping begin.'],
      ['Dec 18, 2023', 'Major shipping lines avoid the Red Sea and the Suez Canal.'],
      ['Jan 12, 2024', 'The US and UK strike Houthi targets. Stocks keep climbing to record highs.'],
    ],
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
  /** The biggest few major stories become timed desk calls. */
  call: boolean;
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

const WAR_SAVE = 'atlas.save.war.v1';

interface WarSave {
  at: number;
  crisis: string;
  next: number;
  bars: Record<string, Bar[]>;
  labels: string[];
  ticks: string[];
  baseVol: number;
  events: WarEvent[];
  revealed: number[];
  port: Partial<Portfolio>;
  fills: Fill[];
  calls: DeskCall[];
  race: { you: number[]; world: number[] };
  stats: { hitW: number; totW: number; grossSum: number; closes: number };
  hold: { qty: Record<string, number>; px: Snap };
  tension: number;
  lesson: string | null;
  thesis: ThesisId;
  size: number;
}

function loadWarSave(): WarSave | null {
  try {
    return JSON.parse(localStorage.getItem(WAR_SAVE) ?? 'null');
  } catch {
    return null;
  }
}

function clearWarSave() {
  try {
    localStorage.removeItem(WAR_SAVE);
  } catch {}
}

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
  /** Width over height of the map stage. */
  private aspect = 2;
  /** Where the camera goes back to after it flies in to a story. */
  private returnCam: Cam | null = null;
  private camAnim = 0;
  private popEvent: WarEvent | null = null;
  private drag: { x: number; y: number; cam: Cam; moved: boolean } | null = null;
  private dragged = false;
  private thesis: ThesisId = 'gut';
  private fills: Fill[] = [];
  private calls: DeskCall[] = [];
  private callTimer = 0;
  /** Holdings and prices at the last close, for scoring rotation. */
  private hold: { qty: Record<string, number>; px: Snap } = { qty: {}, px: {} };
  private stats = { hitW: 0, totW: 0, grossSum: 0, closes: 0 };
  private lesson: WarLesson | null = null;

  constructor() {
    this.chart = new ChartView($('#war-chart-main'), $('#war-chart-macd'));
    $('#view-war').addEventListener('click', (e) => this.onClick(e));
    $('#war-map').addEventListener('mousemove', (e) => this.hover(e));
    $('#war-map').addEventListener('mouseleave', () => ($('#war-tip').hidden = true));
    this.wireCamera();
    this.renderThesis();
    $('#war-plays').innerHTML = PLAYBOOKS.map((p) => `<button class="btn small play" data-war="play-book" data-v="${p.id}" title="${p.hint}">${p.name}</button>`).join('');
  }

  /** Called when the tab is shown for the first time: resumes a saved crisis, or starts a new one. */
  async ensureStarted() {
    if (this.phase !== 'loading' || this.insts.length) return;
    const saved = loadWarSave();
    if (saved && CRISES.some((c) => c.id === saved.crisis)) this.restore(saved);
    else await this.newCrisis();
  }

  /** Saves a crisis in progress so closing the app doesn't lose it. Resumes at the start of the forming day. */
  save() {
    if (!this.replay || (this.phase !== 'playing' && this.phase !== 'paused')) return;
    const data: WarSave = {
      at: Date.now(),
      crisis: this.crisis.id,
      next: Math.max(PRE, this.replay.i),
      bars: Object.fromEntries(this.insts.map((x) => [x.id, x.bars])),
      labels: this.labels,
      ticks: this.ticks,
      baseVol: this.baseVol,
      events: this.events,
      revealed: this.revealed.map((e) => e.id),
      port: { ...this.port },
      fills: this.fills,
      calls: this.calls,
      race: this.race,
      stats: this.stats,
      hold: this.hold,
      tension: this.tension,
      lesson: this.lesson?.id ?? null,
      thesis: this.thesis,
      size: this.size,
    };
    try {
      localStorage.setItem(WAR_SAVE, JSON.stringify(data));
    } catch {
      /* storage full or unavailable: the crisis just won't survive a restart */
    }
  }

  private restore(d: WarSave) {
    this.crisis = CRISES.find((c) => c.id === d.crisis)!;
    this.lastCrisis = this.crisis.id;
    this.insts = BASKET.map((b) => {
      const bars = d.bars[b.id];
      return { ...b, bars, ind: new Indicators(bars), path: [], partial: bars[d.next - 1] };
    });
    this.labels = d.labels;
    this.ticks = d.ticks;
    this.baseVol = d.baseVol;
    this.events = d.events;
    this.revealed = d.events.filter((e) => d.revealed.includes(e.id));
    this.port = Object.assign(new Portfolio(), d.port);
    this.fills = d.fills;
    this.calls = d.calls;
    this.race = d.race;
    this.stats = d.stats;
    this.hold = d.hold;
    this.tension = d.tension;
    this.lesson = WAR_LESSONS.find((l) => l.id === d.lesson) ?? null;
    this.thesis = d.thesis;
    this.size = d.size;
    document.querySelectorAll('[data-war="size"]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.v === String(this.size)));
    this.cur = d.next - 1;
    this.cam = { ...HOME };
    this.returnCam = null;
    this.replay = new Replay(this.insts[0].bars, d.next, {
      onBarOpen: (i) => this.onBarOpen(i),
      onTick: (i) => this.onTick(i),
      onBarClose: (i) => this.onBarClose(i),
      onEnd: () => this.onEnd(),
    });
    this.replay.speed = this.speed;
    this.setPhase('paused');
    this.select('world');
    this.renderThesis();
    this.renderBasket(true);
    this.renderMap();
    this.renderLog();
    this.renderHead();
    this.renderHeat();
    this.renderTicker();
    this.renderTimeline();
    $('#sitrep').innerHTML = this.sitrep();
    $('#sitrep').hidden = true;
    $('#war-pop').hidden = true;
    this.flash('Welcome back. The crisis is paused right where you left it.', 'ok');
  }

  /** A crisis you're in the middle of (live or saved), for Home's "pick up where you left off". */
  status() {
    if (this.phase === 'playing' || this.phase === 'paused') return { op: this.crisis.op, day: Math.max(1, (this.replay?.i ?? this.cur) - PRE), at: Date.now() };
    if (this.phase !== 'loading') return null;
    const d = loadWarSave();
    const c = d && CRISES.find((x) => x.id === d.crisis);
    return c ? { op: c.op, day: Math.max(1, d.next - PRE), at: d.at } : null;
  }

  pause() {
    if (this.phase === 'playing') {
      this.replay?.pause();
      this.setPhase('paused');
      this.save();
    }
  }

  applyTheme() {
    this.chart.applyTheme();
  }

  private async newCrisis() {
    this.replay?.pause();
    clearWarSave();
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
    this.fills = [];
    this.calls = [];
    this.hold = { qty: {}, px: {} };
    this.stats = { hitW: 0, totW: 0, grossSum: 0, closes: 0 };
    this.thesis = 'gut';
    this.renderThesis();
    this.lesson = recommendWar(loadWarProfile());
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
    this.renderTicker();
    this.renderTimeline();
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
        .replace('{W}', name(where))
        // Nations whose names start with "The" shouldn't read "the The".
        .replace(/\bthe The /g, 'the ');
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
        call: c.z >= 1.5 && out.filter((x) => x.call).length < MAX_CALLS,
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
      this.track(i);
      this.checkDue(i);
      if ((i - PRE) % 5 === 4) this.save();
    }
    this.renderMap();
    this.renderHead();
    this.renderHeat();
    this.renderTimeline();
  }

  private onEnd() {
    this.setPhase('done');
    clearWarSave();
    $('#debrief .modal-card').innerHTML = this.debrief();
    $('#debrief').hidden = false;
  }

  private reveal(e: WarEvent) {
    this.revealed.push(e);
    this.renderMap();
    this.renderLog();
    this.renderTicker();
    this.renderTimeline();
    if (e.major && this.phase === 'playing') {
      this.pause();
      this.focus(e, e.call);
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
    this.exec(id as InstId, dq, this.thesis);
    this.renderBasket(true);
  }

  /** Every fill goes through here so it can be checked later. */
  private exec(inst: InstId, dq: number, thesis: ThesisId | null, derisk = false) {
    if (!dq) return;
    const q = this.port.qty[inst] ?? 0;
    const px = this.price(inst);
    const opening = Math.abs(q + dq) > Math.abs(q) && Math.sign(q + dq) === Math.sign(dq);
    const snap = Object.fromEntries(this.insts.map((x) => [x.id, x.partial.c]));
    this.fills.push({ idx: this.cur, inst, dq, px, opening, derisk: derisk || (inst === 'world' && dq < 0), thesis: opening ? thesis : null, snap });
    this.port.trade(inst, dq, px);
  }

  /** Runs every leg of a playbook at the chosen size, or none of them if it would break the exposure limit. */
  private playbook(id: string): boolean | void {
    const book = PLAYBOOKS.find((p) => p.id === id)!;
    if (!this.canTrade()) return this.flash('Trading opens when the crisis starts.');
    if (!book.legs.length) {
      const open = Object.keys(this.port.qty).filter((k) => this.port.qty[k]);
      if (!open.length) return this.flash('You are already all in cash.');
      for (const k of open) this.exec(k as InstId, -this.port.qty[k], null, true);
      this.renderBasket(true);
      return this.flash('Go to cash: every position closed.', 'ok');
    }
    const px = (x: string) => this.price(x);
    const qty = { ...this.port.qty };
    const dq = book.legs.map(([inst, dir]) => [inst, Math.trunc((dir * this.size) / px(inst))] as const);
    for (const [inst, q] of dq) qty[inst] = (qty[inst] ?? 0) + q;
    const gross = Object.entries(qty).reduce((s, [k, q]) => s + Math.abs(q * px(k)), 0);
    if (gross > MAX_GROSS * this.port.equity(px)) return this.flash(`Limit reached: total positions can't exceed ${MAX_GROSS}× your equity.`);
    for (const [inst, q] of dq) this.exec(inst, q, BOOK_THESIS[book.id]);
    this.renderBasket(true);
    const verb = (d: number) => (d > 0 ? 'bought' : 'sold');
    this.flash(`${book.name}: ${book.legs.map(([inst, d]) => `${verb(d)} ${this.inst(inst).name}`).join(', ')}.`, 'ok');
    return true;
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
      this.exec(id as InstId, -q, null);
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
      case 'thesis':
        this.thesis = v as ThesisId;
        this.renderThesis();
        break;
      case 'call':
        this.makeCall(v);
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

  private caseLabel() {
    return `Case ${String(CRISES.indexOf(this.crisis) + 1).padStart(2, '0')}`;
  }

  private renderHead() {
    const c = this.crisis;
    $('#war-title').innerHTML = `<span class="case">${this.caseLabel()}</span>${c.op}`;
    $('#war-sub').textContent = `${name(c.a)} vs ${c.bName} · real prices from a real crisis, revealed at the end`;
    const t = Math.round(this.tension);
    const level = Math.min(LADDER.length - 1, Math.floor(t / 20));
    $('#war-ladder').innerHTML = LADDER.map((l, k) => `<span class="rung r${k} ${k <= level ? 'lit' : ''} ${k === level ? 'now' : ''}">${l}</span>`).join('');
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
    if (full) this.renderTimeline();
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

  /** The wire: recent dispatches scrolling across the top of the console. */
  private renderTicker() {
    const items = this.revealed.slice(-8).reverse();
    const el = $('#war-ticker');
    if (!items.length) {
      el.className = 'newswire-items idle';
      el.textContent = 'No dispatches yet. Desks are watching.';
      return;
    }
    const html = items.map((e) => `<span class="newswire-item ${e.tone}"><b>${this.labels[e.idx].split(' · ')[0]}</b> ${e.headline}</span>`).join('');
    el.className = 'newswire-items';
    // Two copies scroll as one seamless loop.
    el.innerHTML = html + html;
    el.style.animationDuration = `${Math.max(24, items.length * 9)}s`;
  }

  /** Days 1 to 120: dispatches above the line, your trades below, and where you are now. */
  private renderTimeline() {
    const x = (idx: number) => `${(((idx - PRE + 0.5) / PLAY) * 100).toFixed(2)}%`;
    const evs = this.revealed
      .map((e) => `<button class="tl-ev ${e.tone} ${e.major ? 'major' : ''}" style="left:${x(e.idx)}" data-dot="${e.id}" title="${this.labels[e.idx]}: ${e.headline.replace(/"/g, '&quot;')}"></button>`)
      .join('');
    const fills = this.fills
      .filter((f) => f.opening)
      .map((f) => `<span class="tl-fill ${f.dq > 0 ? 'buy' : 'sell'}" style="left:${x(f.idx)}" title="${this.labels[f.idx]}: ${f.dq > 0 ? 'bought' : 'shorted'} ${this.inst(f.inst).name}${f.thesis ? ` (${thesisName(f.thesis)})` : ''}"></span>`)
      .join('');
    const months = this.ticks
      .map((t, i) => (i >= PRE && !/\d/.test(t) ? `<span class="tl-month" style="left:${x(i)}">${t}</span>` : ''))
      .join('');
    const head = this.cur >= PRE ? `<span class="tl-head" style="left:${x(this.cur)}"></span>` : '';
    $('#war-timeline').innerHTML = `<div class="tl-line"></div>${months}${evs}${fills}${head}`;
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
  private focus(e: WarEvent, call = false) {
    e.seenAt ??= this.cur;
    this.returnCam ??= { ...this.cam };
    this.flyTo({ x: e.at[0], y: e.at[1], k: Math.max(this.cam.k, NEWS_ZOOM) }).then(() => this.openPop(e, call));
  }

  private closePop() {
    if (this.callTimer && this.popEvent) this.makeCall('none');
    $('#war-pop').hidden = true;
    this.popEvent = null;
    if (this.returnCam) {
      this.flyTo(this.returnCam);
      this.returnCam = null;
    }
  }

  private openPop(e: WarEvent, call = false) {
    const pop = $('#war-pop');
    pop.className = `war-pop ${e.tone}`;
    const made = this.calls.find((c) => c.eventId === e.id);
    if (call && !made) return this.openCall(e);
    pop.innerHTML = `
      <div class="kicker">${this.labels[e.idx]} · ${e.place}</div>
      <div class="headline">${e.headline}</div>
      <p>${e.detail}</p>
      <p class="watch">Desks are watching: <b>${e.watch}</b></p>
      ${made ? `<p class="call-made">Your call: <b>${this.callName(made.choice)}</b>${made.grade ? ` · graded <span class="grade ${made.grade}">${made.grade}</span>` : ' · graded in a few days'}</p>` : ''}
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

  /**
   * The visible part of the map. The view always matches the console's shape:
   * fully zoomed out it covers the stage (trimming the far edges a little)
   * rather than leaving empty bands.
   */
  private view(c = this.cam) {
    const a = this.aspect;
    const [w0, h0] = a >= MAP.w / MAP.h ? [MAP.w, MAP.w / a] : [MAP.h * a, MAP.h];
    const w = w0 / c.k;
    const h = h0 / c.k;
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }

  private clamp(c: Cam): Cam {
    const k = Math.min(MAX_ZOOM, Math.max(1, c.k));
    const { w, h } = this.view({ x: 0, y: 0, k });
    const hw = w / 2;
    const hh = h / 2;
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
    new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      this.aspect = r.width / r.height;
      this.cam = this.clamp(this.cam);
      this.applyCamera();
    }).observe(el);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        cancelAnimationFrame(this.camAnim);
        this.returnCam = null;
        const [mx, my, fx, fy] = this.toMap(e.clientX, e.clientY);
        const k = Math.min(MAX_ZOOM, Math.max(1, this.cam.k * Math.exp(-e.deltaY * 0.0018)));
        // Keep the point under the cursor where it is.
        const { w, h } = this.view({ x: 0, y: 0, k });
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

  // ---------- Learning: theses, desk calls, scoring ----------

  private renderThesis() {
    $('#war-thesis').innerHTML = THESES.map(
      (t) => `<button class="chip ${t.id === this.thesis ? 'on' : ''}" data-war="thesis" data-v="${t.id}" title="${t.blurb}">${t.name}</button>`,
    ).join('');
  }

  /** % move of a market from a snapshot to the close of bar j. */
  private fwd(id: string, snap: Snap, j: number) {
    return (this.inst(id).bars[j].c / snap[id] - 1) * 100;
  }

  private checkFill(f: Fill, j: number) {
    const t = THESES.find((x) => x.id === f.thesis);
    if (!t?.check || f.verdict) return;
    const d = Math.sign(f.dq);
    const w = this.fwd('world', f.snap, j);
    const rel = f.inst === 'world' ? d * w : d * (this.fwd(f.inst, f.snap, j) - w);
    const b = (id: string, k: number) => this.inst(id).bars[Math.max(0, k)].c;
    const move3 = (id: string) => b(id, f.idx - 1) / b(id, f.idx - 4) - 1;
    const prior = d * (f.inst === 'world' ? move3('world') : move3(f.inst) - move3('world')) * 100;
    const spread = this.fwd('energy', f.snap, j) - this.fwd('airlines', f.snap, j);
    const [right, why] = t.check({ rel, world: w, spread, prior });
    f.verdict = { right, why, pnl: f.dq * (this.inst(f.inst).bars[j].c - f.px) };
  }

  /** What each desk-call option would have made, in %: playbooks average their legs; holding makes nothing. */
  private gradeDesk(c: DeskCall, j: number) {
    if (c.grade) return;
    const outcomes: Record<string, number> = { hold: 0 };
    for (const book of PLAYBOOKS) if (book.legs.length) outcomes[book.id] = book.legs.reduce((s, [id, d]) => s + d * this.fwd(id, c.snap, j), 0) / book.legs.length;
    c.outcomes = outcomes;
    c.grade = gradeCall(c.choice, outcomes);
  }

  /** Checks theses and calls whose waiting period ends today, and says how they did. */
  private checkDue(i: number) {
    const notes: string[] = [];
    for (const f of this.fills) {
      if (f.thesis && f.thesis !== 'gut' && !f.verdict && f.idx + CHECK_DAYS === i) {
        this.checkFill(f, i);
        notes.push(`${thesisName(f.thesis)} on ${this.inst(f.inst).name} ${f.verdict!.right ? 'held up' : "didn't hold"}.`);
      }
    }
    for (const c of this.calls) {
      if (!c.grade && c.idx + CHECK_DAYS === i) {
        this.gradeDesk(c, i);
        notes.push(`Desk call (${this.callName(c.choice)}) graded ${c.grade}.`);
      }
    }
    if (notes.length) this.flash(`Check-in: ${notes.slice(0, 2).join(' ')}`, 'ok');
  }

  /** Daily bookkeeping for the Rotation and Hedging skills. */
  private track(i: number) {
    const world = this.inst('world').bars;
    const wm = world[i].c / world[i - 1].c - 1;
    for (const [id, q] of Object.entries(this.hold.qty)) {
      if (!q) continue;
      const bars = this.inst(id).bars;
      const m = bars[i].c / bars[i - 1].c - 1;
      const rel = id === 'world' ? m : m - wm;
      const w = Math.abs(q * this.hold.px[id]);
      this.stats.totW += w;
      if (Math.sign(q) * rel > 0) this.stats.hitW += w;
    }
    const px = (id: string) => this.inst(id).bars[i].c;
    this.stats.grossSum += this.port.gross(px) / this.port.equity(px);
    this.stats.closes++;
    this.hold = { qty: { ...this.port.qty }, px: Object.fromEntries(this.insts.map((x) => [x.id, x.bars[i].c])) };
  }

  private callName(choice: string) {
    return choice === 'hold' ? 'Hold' : choice === 'none' ? 'No call' : PLAYBOOKS.find((p) => p.id === choice)!.name;
  }

  /** A desk call: the clock is stopped, the desk wants a decision in ten seconds. */
  private openCall(e: WarEvent) {
    const pop = $('#war-pop');
    pop.classList.add('call');
    pop.innerHTML = `
      <div class="kicker">Desk call · ${this.labels[e.idx]} · ${e.place}</div>
      <div class="headline">${e.headline}</div>
      <p>${e.detail}</p>
      <p class="watch">The desk needs your call. What do you do?</p>
      <div class="call-opts">
        ${PLAYBOOKS.filter((b) => b.legs.length).map((b) => `<button class="btn small" data-war="call" data-v="${b.id}" title="${b.hint}">${b.name}</button>`).join('')}
        <button class="btn small ghost" data-war="call" data-v="hold" title="Do nothing and let the story develop">Hold</button>
      </div>
      <div class="call-clock"><span id="call-bar"></span></div>`;
    pop.hidden = false;
    this.popEvent = e;
    this.placePop();
    const t0 = performance.now();
    window.clearInterval(this.callTimer);
    this.callTimer = window.setInterval(() => {
      const left = 1 - (performance.now() - t0) / (CALL_SECONDS * 1000);
      const bar = document.getElementById('call-bar');
      if (bar) bar.style.width = `${Math.max(0, left) * 100}%`;
      if (left <= 0) this.makeCall('none');
    }, 100);
  }

  private makeCall(choice: string) {
    window.clearInterval(this.callTimer);
    this.callTimer = 0;
    const e = this.popEvent;
    if (!e || this.calls.some((c) => c.eventId === e.id)) return;
    const snap = Object.fromEntries(this.insts.map((x) => [x.id, x.partial.c]));
    this.calls.push({ eventId: e.id, idx: this.cur, choice, snap });
    if (choice !== 'hold' && choice !== 'none') this.playbook(choice);
    else if (choice === 'none') this.flash("Time's up: no call made. It counts as holding, but hesitation scores lower.");
    if (!$('#war-pop').hidden) this.openPop(e);
  }

  /** Everything the skills and the after-action review need, measured at the end of the crisis. */
  private facts() {
    const last = this.inst('world').bars.length - 1;
    for (const f of this.fills) if (f.thesis && f.thesis !== 'gut' && !f.verdict && f.idx < last) this.checkFill(f, Math.min(last, f.idx + CHECK_DAYS));
    for (const c of this.calls) if (!c.grade && c.idx < last) this.gradeDesk(c, Math.min(last, c.idx + CHECK_DAYS));
    const world = this.inst('world').bars;
    const w = world.slice(PRE - 1).map((b) => b.c);
    let peak = w[0];
    let ddWorld = 0;
    for (const c of w) {
      peak = Math.max(peak, c);
      ddWorld = Math.max(ddWorld, (peak - c) / peak);
    }
    // Panic sells: de-risking at a 10-day low, right before a rebound of 3% or more.
    const panicDays = new Set<number>();
    for (const f of this.fills) {
      if (!f.derisk) continue;
      const i = f.idx;
      const low = Math.min(...world.slice(Math.max(0, i - 9), i + 1).map((b) => b.c));
      const after = world.slice(i + 1, i + 11).map((b) => b.c);
      if (after.length && world[i].c <= low * 1.005 && Math.max(...after) / world[i].c - 1 > 0.03) panicDays.add(i);
    }
    const checked = this.fills.filter((f) => f.verdict);
    const graded = this.calls.filter((c) => c.grade);
    const eq = this.port.equity((id) => this.price(id));
    const facts: WarFacts = {
      ret: (eq / START_CASH - 1) * 100,
      world: (world[last].c / world[PRE - 1].c - 1) * 100,
      trades: this.port.trades,
      ddYou: this.port.maxDrawdown,
      ddWorld,
      avgGross: this.stats.closes ? this.stats.grossSum / this.stats.closes : 0,
      hit: this.stats.totW ? this.stats.hitW / this.stats.totW : null,
      callPoints: graded.map((c) => CALL_POINTS[c.grade!]),
      goodCalls: graded.filter((c) => c.grade === 'good').length,
      panicSells: panicDays.size,
      thesesRight: checked.filter((f) => f.verdict!.right).length,
      thesesChecked: checked.length,
    };
    return { facts, checked, graded, panicDays };
  }

  private sitrep() {
    const c = this.crisis;
    const l = this.lesson;
    return `
      <div class="kicker">Situation report · ${this.caseLabel()}</div>
      <h3 class="op">${c.op}</h3>
      <p>${c.story}</p>
      <p class="muted">You manage $100,000 across six markets. Buy what you think will win, short what you think will lose, and move money as the news breaks. Pick a thesis before you trade: it gets checked against what happens next. Positions can total up to ${MAX_GROSS}× your equity.</p>
      ${l ? `<p class="sitrep-obj"><b>Your objective:</b> ${l.objective.text} <span class="muted">From the lesson “${l.title}”.</span></p>` : ''}
      <ul class="sitrep-list">${BASKET.map((b) => `<li><b>${b.name}</b>: ${b.blurb}</li>`).join('')}</ul>
      <button class="btn primary" data-war="play">Begin</button>`;
  }

  /** The guided after-action summary: what happened, how you played it, and what to take away. */
  private summary(f: WarFacts, panicRet: number, checked: Fill[], scores: WarScores) {
    const c = this.crisis;
    const rows = this.insts.map((i) => ({ i, chg: (i.bars[i.bars.length - 1].c / i.bars[PRE - 1].c - 1) * 100 }));
    const best = [...rows].sort((a, b) => b.chg - a.chg)[0];
    const worst = [...rows].sort((a, b) => a.chg - b.chg)[0];
    const world = this.inst('world').bars;
    let lowI = PRE;
    for (let i = PRE; i < world.length; i++) if (world[i].c < world[lowI].c) lowI = i;
    const lowPct = (world[lowI].c / world[PRE - 1].c - 1) * 100;
    const near = [...this.events].filter((e) => Math.abs(e.idx - lowI) <= 3).sort((a, b) => Math.abs(a.idx - lowI) - Math.abs(b.idx - lowI))[0];
    const from = (world[world.length - 1].c / world[lowI].c - 1) * 100;
    const happened = `${c.op} was ${c.driver}. <b>${best.i.name}</b> led the basket (${pct(best.chg)}) while <b>${worst.i.name}</b> fared worst (${pct(worst.chg)}). ${
      lowPct < -1
        ? `The World Index bottomed on ${this.labels[lowI].replace(/^Day \d+ · /, '')} at ${pct(lowPct)}${near ? `, ${near.idx <= lowI ? 'just after' : 'just before'} “${near.headline}”` : ''}, and ${from > 1 ? `rebounded ${from.toFixed(1)}% from there` : 'never really recovered'}.`
        : 'The World Index never fell far, which made safe havens a costly insurance policy.'
    }`;

    const excess = f.ret - f.world;
    const bestFill = [...checked].sort((a, b) => b.verdict!.pnl - a.verdict!.pnl)[0];
    const worstFill = [...checked].sort((a, b) => a.verdict!.pnl - b.verdict!.pnl)[0];
    const fillText = (x: Fill) => `${x.dq > 0 ? 'buying' : 'shorting'} ${this.inst(x.inst).name} on ${this.labels[x.idx].split(' · ')[0]} as a ${thesisName(x.thesis!).toLowerCase()} (${money(x.verdict!.pnl)} in ${CHECK_DAYS} days)`;
    const played = f.trades === 0
      ? 'You sat this one out. Cash never loses, but it never learns either.'
      : `You ${excess >= 0 ? 'beat' : 'trailed'} the World Index by <b>${Math.abs(excess).toFixed(1)} points</b>${f.ret < 0 && excess > 0 ? ', and that counts as a good job even though you lost money' : f.ret > 0 && excess < 0 ? '. You made money, but less than just holding the market' : ''}. ${
          f.thesesChecked ? `${f.thesesRight} of ${f.thesesChecked} theses held up. ` : 'You did not tag any trades with a thesis, so none could be checked. '
        }${bestFill && bestFill.verdict!.pnl > 0 ? `Your best decision was ${fillText(bestFill)}. ` : ''}${worstFill && worstFill !== bestFill && worstFill.verdict!.pnl < 0 ? `Your worst was ${fillText(worstFill)}.` : ''}`;

    const gap = f.world - panicRet;
    const panic = Math.abs(gap) < 0.5
      ? 'Holding the World Index and selling after the first big drop ended up in the same place this time.'
      : gap > 0
        ? `Someone who sold everything after the first big drop finished at ${pct(panicRet)}, ${gap.toFixed(1)} points behind someone who simply held. Fear peaks before the facts.`
        : `This time, selling after the first drop (${pct(panicRet)}) beat holding (${pct(f.world)}). That is the exception, not the rule, and it only shows up in hindsight.`;

    const rated = WAR_SKILLS.filter((s) => scores[s.id] !== null).sort((a, b) => scores[a.id]! - scores[b.id]!);
    const weak = rated[0];
    const lesson = recommendWar(loadWarProfile());
    const takeaway = weak && lesson ? `Your weakest skill this round was <b>${weak.name}</b> (${scores[weak.id]}). Next time, read “${lesson.title}”: ${lesson.body[0]}` : 'Make a few trades with a thesis next time so the desk can tell you what worked.';
    return { happened, played, panic, takeaway };
  }

  private debrief() {
    const { facts: f, checked, graded } = this.facts();
    const scores = scoreWar(f);
    const objective = this.lesson ? { id: this.lesson.id, passed: this.lesson.objective.check(f) } : null;
    const profile = loadWarProfile();
    recordWarRound(profile, { at: new Date().toISOString(), crisis: this.crisis.op, ret: f.ret, world: f.world, trades: f.trades, scores }, objective);

    // The panic seller holds the World Index until it is 6% down, then sits in cash.
    const panicSeries: number[] = [];
    let out: number | null = null;
    for (const w of this.race.world) {
      if (out === null && w <= -6) out = w;
      panicSeries.push(out ?? w);
    }
    const panicRet = panicSeries[panicSeries.length - 1];
    const s = this.summary(f, panicRet, checked, scores);
    setWelcome(this.bestMoment(f, checked, objective?.passed ?? false));
    const lines: [string, number[]][] = [['you', this.race.you], ['world', this.race.world], ['panic', panicSeries]];
    const all = lines.flatMap(([, xs]) => xs);
    const lo = Math.min(...all, -1);
    const hi = Math.max(...all, 1);
    const W = 560;
    const H = 150;
    const x = (i: number) => (i / PLAY) * W;
    const y = (v: number) => 6 + ((hi - v) / (hi - lo)) * (H - 12);
    const pts = (xs: number[]) => xs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const marks = graded.map((c) => `<circle class="call-mark ${c.grade}" cx="${x(c.idx - PRE + 1)}" cy="${y(this.race.you[Math.min(this.race.you.length - 1, c.idx - PRE + 1)])}" r="4"><title>Desk call: ${this.callName(c.choice)} (${c.grade})</title></circle>`).join('');

    return `
      <h2 id="debrief-title" style="margin:0">After-action review</h2>
      <p class="muted" style="margin:0.2rem 0 0.6rem">${this.caseLabel()} · ${this.crisis.op}</p>
      <div class="stat-row num">
        <div class="stat"><div class="lbl">You</div><div class="val ${tone(f.ret)}">${pct(f.ret, 1)}</div></div>
        <div class="stat"><div class="lbl">Just hold the World Index</div><div class="val ${tone(f.world)}">${pct(f.world, 1)}</div></div>
        <div class="stat"><div class="lbl">Panic seller</div><div class="val ${tone(panicRet)}">${pct(panicRet, 1)}</div></div>
        <div class="stat"><div class="lbl">Versus the index</div><div class="val ${tone(f.ret - f.world)}">${f.ret - f.world >= 0 ? '+' : ''}${(f.ret - f.world).toFixed(1)} pts</div></div>
      </div>
      <svg class="aar-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="You, the World Index and the panic seller over the crisis">
        <line class="zero" x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}"/>
        <polyline class="panic-line" points="${pts(panicSeries)}"/>
        <polyline class="world-line" points="${pts(this.race.world)}"/>
        <polyline class="you-line" points="${pts(this.race.you)}"/>
        ${marks}
      </svg>
      <div class="aar-key"><span class="you">You</span><span class="wld">World Index</span><span class="pnc">Panic seller</span><span class="muted">Dots: desk calls</span></div>

      <div class="aar-summary">
        <h3>What happened</h3><p>${s.happened}</p>
        <h3>How you played it</h3><p>${s.played}</p>
        <h3>Holding vs panicking</h3><p>${s.panic}</p>
        <h3>Take this with you</h3><p>${s.takeaway}</p>
      </div>

      <div class="aar-grid">
        <div>
          <h3>War Room skills</h3>
          ${WAR_SKILLS.map((k) => `<div class="skill-row"><span title="${k.blurb}">${k.name}</span><div class="meter">${scores[k.id] !== null ? `<span style="width:${scores[k.id]}%"></span>` : ''}</div><span class="num">${scores[k.id] ?? '<span class="muted">n/a</span>'}</span></div>`).join('')}
          ${objective && this.lesson ? `<p class="objective-result ${objective.passed ? 'up' : 'down'}">${objective.passed ? '✓ Objective met' : '✗ Objective missed'}: ${this.lesson.objective.text}</p>` : ''}
        </div>
        <div>
          <h3>Theses and desk calls</h3>
          ${
            checked.length || graded.length
              ? `<ul class="aar-list">${checked.map((x) => `<li class="${x.verdict!.right ? 'up' : 'down'}"><b>${x.verdict!.right ? '✓' : '✗'} ${thesisName(x.thesis!)}</b> · ${x.dq > 0 ? 'long' : 'short'} ${this.inst(x.inst).name}, ${this.labels[x.idx].split(' · ')[0]}<br><span class="muted">${x.verdict!.why}</span></li>`).join('')}
                ${graded.map((c) => `<li><b>Desk call: ${this.callName(c.choice)}</b> · <span class="grade ${c.grade}">${c.grade}</span><br><span class="muted">Best option was ${this.callName(Object.entries(c.outcomes!).sort((a, b) => b[1] - a[1])[0][0])} (${pct(Math.max(...Object.values(c.outcomes!)), 1)}).</span></li>`).join('')}</ul>`
              : '<p class="muted">No tagged trades or desk calls this time.</p>'
          }
        </div>
      </div>

      <h3>What really happened</h3>
      <div class="reveal">
        <div class="was" style="font-size:1.1rem">${this.crisis.real}</div>
        <ul class="aar-timeline">${this.crisis.timeline.map(([d, t]) => `<li><b>${d}</b> ${t}</li>`).join('')}</ul>
        <div class="muted">${BASKET.map((b) => `${b.name} = ${b.sym}`).join(' · ')}</div>
      </div>

      <label class="aar-note"><span>What would you do differently?</span>
        <textarea id="war-note" rows="2" placeholder="Next time I would…"></textarea></label>
      <div class="modal-actions">
        <button class="btn ghost" data-act="review">Close</button>
        <button class="btn primary" data-war-new>New crisis</button>
      </div>`;
  }

  /** The single best true thing about the crisis, for Home's welcome-back line. Never the score. */
  private bestMoment(f: WarFacts, checked: Fill[], objectiveMet: boolean) {
    if (objectiveMet && this.lesson) return `You met your War Room objective from “${this.lesson.title}”.`;
    const best = checked.filter((x) => x.verdict!.right).sort((a, b) => b.verdict!.pnl - a.verdict!.pnl)[0];
    if (best) return `Your ${thesisName(best.thesis!).toLowerCase()} call on ${this.inst(best.inst).name} held up.`;
    if (f.trades && f.ret > f.world) return `You finished ${(f.ret - f.world).toFixed(1)} points ahead of the World Index.`;
    return `You saw ${this.crisis.op} through to the end.`;
  }

  /** Saves the reflection note onto the round just recorded. */
  saveNote() {
    const el = document.getElementById('war-note') as HTMLTextAreaElement | null;
    const text = el?.value.trim();
    if (!text) return;
    const p = loadWarProfile();
    const last = p.rounds[p.rounds.length - 1];
    if (last) {
      last.note = text;
      saveWarProfile(p);
    }
  }

  newFromDebrief() {
    this.saveNote();
    $('#debrief').hidden = true;
    this.newCrisis();
  }
}
