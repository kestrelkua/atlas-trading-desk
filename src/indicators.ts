import type { Bar } from './types';

export interface Point {
  sma8?: number;
  sma25?: number;
  sma50?: number;
  bbU?: number;
  bbM?: number;
  bbL?: number;
  macd: number;
  signal: number;
  hist: number;
}

const alpha = (n: number) => 2 / (n + 1);
const K12 = alpha(12);
const K26 = alpha(26);
const K9 = alpha(9);

/**
 * Indicator values for every bar, computed only from that bar and earlier ones,
 * so showing bars [0, i] never leaks the future. `at()` recomputes the value for
 * the bar that is still forming, using its partial close.
 */
export class Indicators {
  readonly points: Point[] = [];
  readonly atr: number[] = [];
  readonly bandwidth: number[] = [];
  readonly volAvg: number[] = [];
  private closes: number[];
  private e12: number[] = [];
  private e26: number[] = [];
  private sig: number[] = [];

  constructor(bars: Bar[]) {
    this.closes = bars.map((b) => b.c);
    for (let i = 0; i < bars.length; i++) {
      const r = this.calc(i, bars[i].c);
      this.e12[i] = r.e12;
      this.e26[i] = r.e26;
      this.sig[i] = r.sig;
      this.points.push(r.point);

      const b = bars[i];
      const pc = i > 0 ? bars[i - 1].c : b.o;
      const tr = Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
      this.atr[i] = i === 0 ? tr : (this.atr[i - 1] * 13 + tr) / 14;

      const p = r.point;
      this.bandwidth[i] = p.bbU !== undefined ? (p.bbU - p.bbL!) / p.bbM! : NaN;

      const from = Math.max(0, i - 20);
      let sum = 0;
      for (let j = from; j < i; j++) sum += bars[j].v;
      this.volAvg[i] = i > from ? sum / (i - from) : b.v;
    }
  }

  at(i: number, close: number): Point {
    return close === this.closes[i] ? this.points[i] : this.calc(i, close).point;
  }

  private window(i: number, n: number, close: number): number[] | null {
    if (i < n - 1) return null;
    const w = this.closes.slice(i - n + 1, i);
    w.push(close);
    return w;
  }

  private sma(i: number, n: number, close: number) {
    const w = this.window(i, n, close);
    return w ? w.reduce((a, b) => a + b, 0) / n : undefined;
  }

  private calc(i: number, c: number) {
    const e12 = i === 0 ? c : c * K12 + this.e12[i - 1] * (1 - K12);
    const e26 = i === 0 ? c : c * K26 + this.e26[i - 1] * (1 - K26);
    const macd = e12 - e26;
    const sig = i === 0 ? macd : macd * K9 + this.sig[i - 1] * (1 - K9);

    const point: Point = {
      sma8: this.sma(i, 8, c),
      sma25: this.sma(i, 25, c),
      sma50: this.sma(i, 50, c),
      macd,
      signal: sig,
      hist: macd - sig,
    };
    const w = this.window(i, 20, c);
    if (w) {
      const mean = w.reduce((a, b) => a + b, 0) / 20;
      const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / 20);
      point.bbM = mean;
      point.bbU = mean + 2 * sd;
      point.bbL = mean - 2 * sd;
    }
    return { point, e12, e26, sig };
  }
}
