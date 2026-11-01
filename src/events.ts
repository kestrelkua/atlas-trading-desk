import { pick } from './data';
import type { Indicators } from './indicators';
import type { Scenario } from './types';

export interface NewsItem {
  idx: number;
  headline: string;
  tone: 'bull' | 'bear' | 'neutral';
  kind: 'move' | 'noise' | 'wild' | 'earnings' | 'macro';
}

/** A scheduled event the player can see coming on the calendar. */
export interface CalendarEvent {
  idx: number;
  kind: 'earnings' | 'macro';
  title: string;
  /** Short label for the progress-strip pin, e.g. EARN or CPI. */
  code: string;
  detail: string;
  /** Bar at which the date becomes public and shows up on the calendar. */
  announceIdx: number;
}

const THINGS: Record<string, string[]> = {
  Technology: ['chip demand', 'cloud revenue', 'AI spending', 'data-center orders'],
  Financials: ['loan losses', 'net interest margin', 'deposit flows', 'trading revenue'],
  Energy: ['crude prices', 'OPEC output', 'refining margins', 'drilling activity'],
  'Health Care': ['trial results', 'drug pricing', 'an FDA review', 'patient volumes'],
  'Consumer Discretionary': ['holiday sales', 'consumer spending', 'delivery numbers', 'store traffic'],
  Communication: ['subscriber growth', 'ad revenue', 'streaming numbers', 'user engagement'],
  Industrials: ['the order backlog', 'supply-chain costs', 'defense contracts', 'freight volumes'],
};

const BULL = [
  '{co} jumps as {thing} tops estimates',
  'Upgrade: analysts see {thing} accelerating at {co}',
  '{co} raises full-year guidance on strong {thing}',
  'Report: activist investor builds stake in {co}',
  '{co} wins major contract; desks cite improving {thing}',
];
const BEAR = [
  '{co} slides as {thing} disappoints',
  '{co} cuts guidance, citing weaker {thing}',
  'Downgrade: analysts warn on {thing} at {co}',
  'Regulators open probe into {co}',
  '{co} CFO departs unexpectedly amid questions on {thing}',
];
const WILD_BULL = [
  '{co} CEO announces the company will accept payment in vintage baseball cards; shares rip',
  'Message boards discover {co}; retail army piles in',
  'Rumor: {co} in talks with a mystery sovereign fund about a buyout',
  '{co} lab claims breakthrough, then livestreams it from a hot-air balloon',
];
const WILD_BEAR = [
  "{co} earnings accidentally posted to the company cat's social account a day early",
  'Short seller publishes 90-page report on {co} titled "The Emperor Has No Ledger"',
  '{co} warehouse flooded after a sprinkler test "went poetic," company says',
  '{co} CEO spotted selling shares from a yacht named "Exit Strategy"',
];
const NOISE = [
  '{co} to present at an industry conference next week',
  'Analyst reiterates Hold on {co}, trims target by $1',
  '{co} names new head of investor relations',
  'Sector funds see routine rebalancing flows',
  'Survey: investors "cautiously optimistic" about {thing}',
];

function fill(t: string, co: string, sector: string) {
  return t.replace('{co}', co).replace('{thing}', pick(THINGS[sector] ?? ['demand']));
}

/** How unusual a played bar is, in ATRs of gap or body, or multiples of volume. */
export function shockScores(s: Scenario, ind: Indicators): { idx: number; score: number; dir: number }[] {
  const out = [];
  for (let i = s.pre; i < s.bars.length; i++) {
    const b = s.bars[i];
    const prev = s.bars[i - 1];
    const atr = ind.atr[i - 1] || 1;
    const gap = Math.abs(b.o - prev.c) / atr;
    const body = Math.abs(b.c - b.o) / atr;
    const vol = (b.v / (ind.volAvg[i] || 1) - 1) / 1.5;
    out.push({ idx: i, score: Math.max(gap * 1.2, body, vol), dir: Math.sign(b.c - prev.c) || 1 });
  }
  return out;
}

const MACRO: [string, string][] = [
  ['CPI inflation report', 'CPI'],
  ['Fed rate decision', 'FED'],
  ['Jobs report', 'JOBS'],
  ['Retail sales data', 'SALES'],
  ['GDP estimate', 'GDP'],
];
const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));

/**
 * Scheduled events, placed where the real data says they belong: earnings land on
 * the biggest overnight gap of each quarter, macro releases on the broad market's
 * biggest moves. One extra macro release lands on a quiet bar, because plenty of
 * scheduled events turn out to be non-events.
 */
export function buildCalendar(s: Scenario, ind: Indicators): CalendarEvent[] {
  type Draft = Omit<CalendarEvent, 'announceIdx'>;
  const events: Draft[] = [];
  const play = s.bars.length - s.pre;
  const gap = (i: number) => Math.abs(s.bars[i].o - s.bars[i - 1].c) / (ind.atr[i - 1] || 1);
  const taken = (i: number, d: number) => events.some((e) => Math.abs(e.idx - i) < d);

  if (s.mode === 'daily') {
    const quarters = Math.max(1, Math.round(play / 63));
    const len = Math.floor(play / quarters);
    for (let q = 0; q < quarters; q++) {
      const from = s.pre + q * len + 8;
      const to = Math.min(s.bars.length, s.pre + (q + 1) * len - 4);
      let best = from;
      for (let i = from; i < to; i++) if (gap(i) > gap(best)) best = i;
      events.push({ idx: best, kind: 'earnings', title: 'Earnings report', code: 'EARN', detail: 'before the open' });
    }
  } else {
    const opens = [];
    for (let i = s.pre + 1; i < s.bars.length; i++) if (s.ticks[i].startsWith('Day')) opens.push(i);
    const best = opens.sort((a, b) => gap(b) - gap(a))[0];
    if (best && gap(best) > 1.5) events.push({ idx: best, kind: 'earnings', title: 'Earnings report', code: 'EARN', detail: 'after the prior close' });
  }

  const m = s.market;
  const r = (i: number) => Math.abs(Math.log(m[i] / m[i - 1]));
  const idxs = Array.from({ length: play }, (_, k) => s.pre + k);
  const avg = idxs.reduce((a, i) => a + r(i), 0) / play || 1;
  const spacing = s.mode === 'daily' ? 15 : 40;
  const pool = [...MACRO].sort(() => Math.random() - 0.5);
  const macro = (idx: number): Draft => {
    const [title, code] = pool.pop() ?? ['Economic data', 'ECON'];
    return { idx, kind: 'macro', title, code, detail: 'economic release, moves the whole market' };
  };
  for (const i of [...idxs].sort((a, b) => r(b) - r(a))) {
    if (events.filter((e) => e.kind === 'macro').length >= (s.mode === 'daily' ? 3 : 2) || r(i) < avg * 2.8) break;
    if (taken(i, spacing)) continue;
    events.push(macro(i));
  }
  const quiet = idxs.filter((i) => r(i) < avg * 0.6 && !taken(i, spacing));
  if (quiet.length) events.push(macro(pick(quiet)));

  // Dates go public ahead of time, like the real world: companies confirm earnings
  // dates a few weeks out, and economic releases sit on the calendar a couple of weeks
  // ahead. Intraday rounds only span a week, so events appear a day or two early.
  const daily = s.mode === 'daily';
  return events
    .map((e) => {
      const lead = daily ? (e.kind === 'earnings' ? randInt(15, 25) : randInt(8, 12)) : e.kind === 'earnings' ? 156 : 78;
      return { ...e, announceIdx: Math.max(s.pre, e.idx - lead) };
    })
    .sort((a, b) => a.idx - b.idx);
}

const EARN_BULL = ['{co} beats on earnings and raises its outlook', '{co} tops estimates as {thing} surprises to the upside'];
const EARN_BEAR = ['{co} misses estimates; guidance disappoints', '{co} earnings fall short as {thing} weakens'];
const EARN_FLAT = ['{co} earnings come in line; no surprises', '{co} reports a mixed quarter'];
const MACRO_BULL = ['{title}: softer than expected, stocks rally', '{title} calms nerves; buyers step in'];
const MACRO_BEAR = ['{title}: hotter than expected, stocks slide', '{title} rattles markets; sellers take control'];
const MACRO_FLAT = ['{title} lands right on expectations', '{title} passes quietly'];

/**
 * Headlines for the calendar events, then for other bars where the real data made
 * an outsized move, plus a couple of noise items that don't matter. Wild variants
 * keep it fun; the price action underneath is always real.
 */
export function generateNews(s: Scenario, ind: Indicators, calendar: CalendarEvent[]): NewsItem[] {
  const co = s.alias.name;
  const items: NewsItem[] = [];
  for (const e of calendar) {
    const move = (s.bars[e.idx].c - s.bars[e.idx - 1].c) / (ind.atr[e.idx - 1] || 1);
    const mkt = s.market[e.idx] / s.market[e.idx - 1] - 1;
    const tone = e.kind === 'earnings' ? (move > 1 ? 'bull' : move < -1 ? 'bear' : 'neutral') : mkt > 0.004 ? 'bull' : mkt < -0.004 ? 'bear' : 'neutral';
    const pools = e.kind === 'earnings' ? { bull: EARN_BULL, bear: EARN_BEAR, neutral: EARN_FLAT } : { bull: MACRO_BULL, bear: MACRO_BEAR, neutral: MACRO_FLAT };
    const headline = fill(pick(pools[tone]), co, s.sector).replace('{title}', e.title);
    items.push({ idx: e.idx, headline, tone, kind: e.kind });
  }
  const shocks = shockScores(s, ind)
    .filter((x) => x.score > 1.8)
    .sort((a, b) => b.score - a.score);
  for (const x of shocks) {
    if (items.length >= calendar.length + 3) break;
    if (items.some((n) => Math.abs(n.idx - x.idx) < 8)) continue;
    const wild = Math.random() < 0.3;
    const bull = x.dir > 0;
    const pool = wild ? (bull ? WILD_BULL : WILD_BEAR) : bull ? BULL : BEAR;
    items.push({ idx: x.idx, headline: fill(pick(pool), co, s.sector), tone: bull ? 'bull' : 'bear', kind: wild ? 'wild' : 'move' });
  }
  const calm = shockScores(s, ind).filter((x) => x.score < 0.8 && !items.some((n) => Math.abs(n.idx - x.idx) < 5));
  for (let k = 0; k < 1 && calm.length; k++) {
    const x = calm.splice(Math.floor(Math.random() * calm.length), 1)[0];
    items.push({ idx: x.idx, headline: fill(pick(NOISE), co, s.sector), tone: 'neutral', kind: 'noise' });
  }
  return items.sort((a, b) => a.idx - b.idx);
}

export interface Briefing {
  note: string;
  marketChange: number;
  marketVol: number;
  regime: 'calm' | 'normal' | 'stormy';
  sectorRel: number;
  stockChange: number;
  trend: string;
  atrPct: number;
  fromHigh: number;
  bigMoveExpected: boolean;
}

function realizedVol(closes: number[], perYear: number) {
  const r = closes.slice(1).map((c, i) => Math.log(c / closes[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(v * perYear) * 100;
}

const NOTES = {
  calm: [
    'Quiet tape. Volatility is near its lows and desks report thin conviction. Quiet stretches like this rarely last forever.',
    'Markets drift on light volume. Traders are watching for a catalyst that has not arrived yet.',
  ],
  normal: [
    'Ordinary conditions: rotation between sectors, no single story dominating the tape.',
    'Mixed macro data keeps both bulls and bears in the game. Respect levels; neither side has control.',
  ],
  stormy: [
    'Rough seas. Swings are wide and correlations are high, so stocks are moving together. Size down.',
    'Risk-off mood: desks report heavy hedging and fast reversals. Expect gaps.',
  ],
};

export function makeBriefing(s: Scenario, ind: Indicators): Briefing {
  const pre = s.pre;
  const perYear = s.mode === 'daily' ? 252 : 252 * 78;
  const mkt = s.market.slice(0, pre);
  const sec = s.sectorSeries.slice(0, pre);
  const stock = s.bars.slice(0, pre).map((b) => b.c);
  const chg = (xs: number[]) => (xs[xs.length - 1] / xs[0] - 1) * 100;
  const marketVol = realizedVol(mkt, perYear);
  const regime = marketVol < 12 ? 'calm' : marketVol < 22 ? 'normal' : 'stormy';
  const p = ind.points[pre - 1];
  let trend = 'Ranging: averages tangled';
  if (p.sma8 && p.sma25 && p.sma50) {
    if (p.sma8 > p.sma25 && p.sma25 > p.sma50) trend = 'Uptrend: 8 > 25 > 50';
    else if (p.sma8 < p.sma25 && p.sma25 < p.sma50) trend = 'Downtrend: 8 < 25 < 50';
  }
  const hi = Math.max(...s.bars.slice(0, pre).map((b) => b.h));
  const maxShock = Math.max(...shockScores(s, ind).map((x) => x.score));
  return {
    note: pick(NOTES[regime]),
    marketChange: chg(mkt),
    marketVol,
    regime,
    sectorRel: chg(sec) - chg(mkt),
    stockChange: chg(stock),
    trend,
    atrPct: (ind.atr[pre - 1] / stock[pre - 1]) * 100,
    fromHigh: (stock[pre - 1] / hi - 1) * 100,
    bigMoveExpected: maxShock > 3,
  };
}
