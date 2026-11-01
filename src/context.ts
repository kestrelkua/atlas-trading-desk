import type { Indicators } from './indicators';
import type { Bar } from './types';

/** What the chart objectively shows at a moment, used to check the player's stated reasons. */
export interface Context {
  trend: 'up' | 'down' | 'range';
  macdCross: 'bull' | 'bear' | null;
  pctB: number;
  squeeze: boolean;
  relVol: number;
  atr: number;
  nearSma: boolean;
  nearLevel: boolean;
  newsRecent: boolean;
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

  // Squeezed: band width within the last 5 bars sat in the narrowest fifth of the last 80.
  const hist = ind.bandwidth.slice(Math.max(0, j - 80), j + 1).filter((x) => !isNaN(x));
  const sorted = [...hist].sort((a, b) => a - b);
  const p20 = sorted[Math.floor(sorted.length * 0.2)] ?? Infinity;
  const recent = ind.bandwidth.slice(Math.max(0, j - 4), j + 1).filter((x) => !isNaN(x));
  const squeeze = sorted.length > 20 && Math.min(...recent) <= p20;

  const near = (x: number | undefined, k: number) => x !== undefined && Math.abs(price - x) < k * atr;

  return {
    trend,
    macdCross,
    pctB,
    squeeze,
    relVol: bars[j].v / (ind.volAvg[j] || 1),
    atr,
    nearSma: near(p.sma25, 0.6) || near(p.sma50, 0.6),
    nearLevel: levels.some((l) => near(l, 0.75)),
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
    id: 'macd',
    label: 'MACD cross',
    rule: 'MACD crossed its signal line in your direction within the last 3 bars.',
    check: (c, d) => c.macdCross === (d === 1 ? 'bull' : 'bear'),
  },
  {
    id: 'squeeze',
    label: 'Squeeze breakout',
    rule: 'Bollinger Bands were squeezed recently and price is pushing toward the band in your direction.',
    check: (c, d) => c.squeeze && (d === 1 ? c.pctB > 0.75 : c.pctB < 0.25),
  },
  {
    id: 'reversion',
    label: 'Band reversion',
    rule: 'Price is stretched to the opposite band (below 10% of the band range for longs, above 90% for shorts).',
    check: (c, d) => (d === 1 ? c.pctB < 0.1 : c.pctB > 0.9),
  },
  {
    id: 'sma',
    label: 'SMA bounce',
    rule: 'Price is within 0.6 ATR of the 25 or 50 SMA, and the trend is not against you.',
    check: (c, d) => c.nearSma && (d === 1 ? c.trend !== 'down' : c.trend !== 'up'),
  },
  {
    id: 'level',
    label: 'Level play',
    rule: 'Price is within 0.75 ATR of a level you drew.',
    check: (c) => c.nearLevel,
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
