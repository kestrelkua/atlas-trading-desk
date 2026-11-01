import type { Indicators } from './indicators';
import type { Bar } from './types';

/** What the chart objectively shows at a moment, used to check the player's stated reasons. */
export interface Context {
  trend: 'up' | 'down' | 'range';
  macdCross: 'bull' | 'bear' | null;
  pctB: number;
  breakout: 'up' | 'down' | null;
  relVol: number;
  atr: number;
  nearSma: boolean;
  nearLevel: boolean;
  nearLiquidity: boolean;
  newsRecent: boolean;
}

export interface LiquidityZone {
  price: number;
  kind: 'volume' | 'stops';
}

const LOOKBACK = 120;

/**
 * Price areas that tend to attract price: high-volume nodes (where lots of shares
 * changed hands) and stop clusters (two or more swing highs or lows at nearly the
 * same price, where stop orders pile up). Uses only closed bars before `i`.
 */
export function liquidityZones(bars: Bar[], i: number, atr: number): LiquidityZone[] {
  const from = Math.max(0, i - LOOKBACK);
  const win = bars.slice(from, i);
  if (win.length < 30 || !atr) return [];
  const zones: LiquidityZone[] = [];

  // Volume profile: spread each bar's volume across the price bins it covered.
  const lo = Math.min(...win.map((b) => b.l));
  const hi = Math.max(...win.map((b) => b.h));
  const step = atr * 0.5;
  const n = Math.max(1, Math.ceil((hi - lo) / step));
  const bins = new Array(n).fill(0);
  for (const b of win) {
    const a = Math.min(n - 1, Math.floor((b.l - lo) / step));
    const z = Math.min(n - 1, Math.floor((b.h - lo) / step));
    for (let k = a; k <= z; k++) bins[k] += b.v / (z - a + 1);
  }
  const avg = bins.reduce((s, x) => s + x, 0) / n;
  const peaks = bins
    .map((v, k) => ({ v, k }))
    .filter(({ v, k }) => v > avg * 1.5 && v >= (bins[k - 1] ?? 0) && v >= (bins[k + 1] ?? 0))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  for (const { k } of peaks) zones.push({ price: lo + (k + 0.5) * step, kind: 'volume' });

  // Stop clusters: swing points (higher/lower than 2 bars each side) that line up.
  const swings: number[][] = [[], []];
  for (let k = 2; k < win.length - 2; k++) {
    const b = win[k];
    const around = [win[k - 2], win[k - 1], win[k + 1], win[k + 2]];
    if (around.every((x) => x.h < b.h)) swings[0].push(b.h);
    if (around.every((x) => x.l > b.l)) swings[1].push(b.l);
  }
  for (const pts of swings) {
    pts.sort((a, b) => a - b);
    let group: number[] = [];
    const flush = () => {
      if (group.length >= 2) zones.push({ price: group.reduce((s, x) => s + x, 0) / group.length, kind: 'stops' });
      group = [];
    };
    for (const p of pts) {
      if (group.length && p - group[group.length - 1] > atr * 0.35) flush();
      group.push(p);
    }
    flush();
  }
  return zones;
}

export function readContext(
  ind: Indicators,
  bars: Bar[],
  i: number,
  price: number,
  levels: number[],
  newsBars: number[],
): Context {
  const j = Math.max(0, i - 1);
  const p = ind.points[j];
  const atr = ind.atr[j];

  let trend: Context['trend'] = 'range';
  if (p.sma8 !== undefined && p.sma25 !== undefined && p.sma50 !== undefined) {
    if (p.sma8 > p.sma25 && p.sma25 > p.sma50 && price > p.sma50) trend = 'up';
    else if (p.sma8 < p.sma25 && p.sma25 < p.sma50 && price < p.sma50) trend = 'down';
  }

  let macdCross: Context['macdCross'] = null;
  for (let k = Math.max(1, i - 3); k <= j; k++) {
    const a = ind.points[k - 1].hist;
    const b = ind.points[k].hist;
    if (a <= 0 && b > 0) macdCross = 'bull';
    if (a >= 0 && b < 0) macdCross = 'bear';
  }

  const now = ind.at(i, price);
  const pctB = now.bbU !== undefined ? (price - now.bbL!) / (now.bbU - now.bbL! || 1) : 0.5;

  // Breakout: through the 20-bar range, or across a drawn level within the last 3 bars.
  const range = bars.slice(Math.max(0, i - 20), i);
  let breakout: Context['breakout'] = null;
  if (range.length >= 10) {
    if (price > Math.max(...range.map((b) => b.h))) breakout = 'up';
    else if (price < Math.min(...range.map((b) => b.l))) breakout = 'down';
  }
  const before = bars[Math.max(0, i - 3)].c;
  for (const l of levels) {
    if (before < l && price > l) breakout = 'up';
    if (before > l && price < l) breakout = 'down';
  }

  const near = (x: number | undefined, k: number) => x !== undefined && Math.abs(price - x) < k * atr;

  return {
    trend,
    macdCross,
    pctB,
    breakout,
    relVol: bars[j].v / (ind.volAvg[j] || 1),
    atr,
    nearSma: near(p.sma25, 0.6) || near(p.sma50, 0.6),
    nearLevel: levels.some((l) => near(l, 0.75)),
    nearLiquidity: liquidityZones(bars, i, atr).some((z) => near(z.price, 0.5)),
    newsRecent: newsBars.some((n) => n <= i && n >= i - 3),
  };
}

export interface Tag {
  id: string;
  label: string;
  rule: string;
  check(c: Context, dir: 1 | -1): boolean;
}

export const TAGS: Tag[] = [
  {
    id: 'trend',
    label: 'Trend follow',
    rule: 'SMAs stacked 8 > 25 > 50 (or reversed for shorts) with price on the right side of the 50.',
    check: (c, d) => (d === 1 ? c.trend === 'up' : c.trend === 'down'),
  },
  {
    id: 'breakout',
    label: 'Breakout / Breakdown',
    rule: 'Price is beyond the 20-bar high (longs) or low (shorts), or crossed one of your levels in the last 3 bars.',
    check: (c, d) => c.breakout === (d === 1 ? 'up' : 'down'),
  },
  {
    id: 'liquidity',
    label: 'Liquidity zone',
    rule: 'Price is within 0.5 ATR of a high-volume area or a cluster of matching swing highs/lows (where stops pile up).',
    check: (c) => c.nearLiquidity,
  },
  {
    id: 'level',
    label: 'Level play',
    rule: 'Price is within 0.75 ATR of a level you drew.',
    check: (c) => c.nearLevel,
  },
  {
    id: 'macd',
    label: 'MACD cross',
    rule: 'MACD crossed its signal line in your direction within the last 3 bars.',
    check: (c, d) => c.macdCross === (d === 1 ? 'bull' : 'bear'),
  },
  {
    id: 'sma',
    label: 'SMA bounce',
    rule: 'Price is within 0.6 ATR of the 25 or 50 SMA, and the trend is not against you.',
    check: (c, d) => c.nearSma && (d === 1 ? c.trend !== 'down' : c.trend !== 'up'),
  },
  {
    id: 'reversion',
    label: 'Band reversion',
    rule: 'Price is stretched to the opposite band (below 10% of the band range for longs, above 90% for shorts).',
    check: (c, d) => (d === 1 ? c.pctB < 0.1 : c.pctB > 0.9),
  },
  {
    id: 'volume',
    label: 'Volume surge',
    rule: 'The last bar traded at least 1.6× its 20-bar average volume.',
    check: (c) => c.relVol >= 1.6,
  },
  {
    id: 'news',
    label: 'News reaction',
    rule: 'A headline crossed the wire within the last 3 bars.',
    check: (c) => c.newsRecent,
  },
  {
    id: 'gut',
    label: 'Gut feel',
    rule: 'No objective rule. Honest, but it never counts as confirmed.',
    check: () => false,
  },
];

export const tagById = (id: string) => TAGS.find((t) => t.id === id)!;
