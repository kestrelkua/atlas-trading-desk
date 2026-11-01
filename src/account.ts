import type { Context } from './context';

export const FEE = 1;
export const SLIPPAGE = 0.0003;

export interface Trade {
  id: number;
  dir: 1 | -1;
  qty: number;
  entryIdx: number;
  entryPrice: number;
  stop?: number;
  target?: number;
  stopAtEntry: boolean;
  tags: string[];
  verified: Record<string, boolean>;
  ctx: Context;
  atr: number;
  afterNews: boolean;
  /** Worst and best excursion from entry, in price units (both ≥ 0). */
  mae: number;
  mfe: number;
  exitIdx?: number;
  exitPrice?: number;
  exitReason?: 'manual' | 'stop' | 'target' | 'end';
  pnl?: number;
}

export class Account {
  cash: number;
  open: Trade | null = null;
  closed: Trade[] = [];
  peak: number;
  maxDrawdown = 0;
  private nextId = 1;

  constructor(readonly start: number) {
    this.cash = start;
    this.peak = start;
  }

  equity(price: number) {
    return this.cash + (this.open ? this.open.dir * this.open.qty * price : 0);
  }

  openPnl(price: number) {
    const t = this.open;
    return t ? t.dir * t.qty * (price - t.entryPrice) : 0;
  }

  enter(t: Omit<Trade, 'id' | 'entryPrice' | 'mae' | 'mfe'>, price: number) {
    const fill = price * (1 + t.dir * SLIPPAGE);
    this.cash -= t.dir * t.qty * fill + FEE;
    this.open = { ...t, id: this.nextId++, entryPrice: fill, mae: 0, mfe: 0 };
    return this.open;
  }

  exit(price: number, idx: number, reason: Trade['exitReason']) {
    const t = this.open;
    if (!t) return null;
    const fill = price * (1 - t.dir * SLIPPAGE);
    this.cash += t.dir * t.qty * fill - FEE;
    t.exitIdx = idx;
    t.exitPrice = fill;
    t.exitReason = reason;
    t.pnl = t.dir * t.qty * (fill - t.entryPrice) - 2 * FEE;
    this.closed.push(t);
    this.open = null;
    return t;
  }

  /** Track excursions and drawdown at a tick; returns a triggered exit, if any. */
  mark(price: number): 'stop' | 'target' | null {
    const eq = this.equity(price);
    this.peak = Math.max(this.peak, eq);
    this.maxDrawdown = Math.max(this.maxDrawdown, (this.peak - eq) / this.peak);
    const t = this.open;
    if (!t) return null;
    const move = t.dir * (price - t.entryPrice);
    t.mfe = Math.max(t.mfe, move);
    t.mae = Math.max(t.mae, -move);
    if (t.stop !== undefined && t.dir * (price - t.stop) <= 0) return 'stop';
    if (t.target !== undefined && t.dir * (price - t.target) >= 0) return 'target';
    return null;
  }
}
