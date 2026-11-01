export type Raw = [number, number, number, number, number, number];

export interface Bar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Mode = 'daily' | 'intraday';

export interface Manifest {
  market: string;
  sectors: Record<string, { etf: string; stocks: string[] }>;
  fetchedAt: string;
  symbols: Record<string, { daily: number; intraday: number }>;
}

export interface Scenario {
  mode: Mode;
  symbol: string;
  sector: string;
  etf: string;
  /** Fictional identity shown during play; the real one is revealed at the end. */
  alias: { name: string; ticker: string };
  /** Scaled bars: [0, pre) is warm-up, [pre, bars.length) is played. */
  bars: Bar[];
  pre: number;
  labels: string[];
  ticks: string[];
  /** Raw closes of the broad market and the sector ETF, aligned to bars. */
  market: number[];
  sectorSeries: number[];
  startDate: string;
  endDate: string;
  scale: number;
}
