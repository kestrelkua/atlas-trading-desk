import { pick } from './data';
import type { Indicators } from './indicators';
import type { Scenario } from './types';

export interface NewsItem {
  idx: number;
  headline: string;
  tone: 'bull' | 'bear' | 'neutral';
  kind: 'move' | 'noise' | 'wild';
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

/**
 * Headlines pinned to the bars where the real data made an outsized move, plus a
 * couple of noise items that don't matter. Wild variants keep it fun; the price
 * action underneath is always real.
 */
export function generateNews(s: Scenario, ind: Indicators): NewsItem[] {
  const co = s.alias.name;
  const shocks = shockScores(s, ind)
    .filter((x) => x.score > 1.8)
    .sort((a, b) => b.score - a.score);
  const items: NewsItem[] = [];
  for (const x of shocks) {
    if (items.length >= 5) break;
    if (items.some((n) => Math.abs(n.idx - x.idx) < 8)) continue;
    const wild = Math.random() < 0.3;
    const bull = x.dir > 0;
    const pool = wild ? (bull ? WILD_BULL : WILD_BEAR) : bull ? BULL : BEAR;
    items.push({ idx: x.idx, headline: fill(pick(pool), co, s.sector), tone: bull ? 'bull' : 'bear', kind: wild ? 'wild' : 'move' });
  }
  const calm = shockScores(s, ind).filter((x) => x.score < 0.8 && !items.some((n) => Math.abs(n.idx - x.idx) < 5));
  for (let k = 0; k < 2 && calm.length; k++) {
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
