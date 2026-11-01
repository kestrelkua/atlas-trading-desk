import type { Bar, Manifest, Mode, Raw, Scenario } from './types';

const base = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<Raw[]>>();
let manifestP: Promise<Manifest> | null = null;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(`Missing data file ${path}. Run "npm run fetch-data".`);
  return res.json();
}

export function loadManifest(): Promise<Manifest> {
  return (manifestP ??= getJson<Manifest>('manifest.json'));
}

export function loadSeries(mode: Mode, symbol: string): Promise<Raw[]> {
  const key = `${mode}/${symbol}`;
  if (!cache.has(key)) cache.set(key, getJson<Raw[]>(`${key}.json`));
  return cache.get(key)!;
}

export const MODES: Record<Mode, { label: string; short: string }> = {
  daily: { label: '1 Year · Daily', short: '1Y · 1D' },
  intraday: { label: '5 Days · 5 Min', short: '5D · 5m' },
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const utcDay = (t: number) => Math.floor(t / 86400);

const etClock = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const etMonthDay = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
const etMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short' });
const etWeekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' });
const etDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const ALIAS_ROOTS = [
  'Meridian', 'Polaris', 'Lodestar', 'Isobar', 'Contour', 'Bearing', 'Sextant', 'Longitude',
  'Azimuth', 'Equator', 'Tropic', 'Mercator', 'Compass Rose', 'Headland', 'Fathom', 'Cartouche',
];
const ALIAS_SUFFIX = ['Holdings', 'Industries', 'Systems', 'Group', 'Corp', 'Partners'];

function makeAlias() {
  const root = pick(ALIAS_ROOTS);
  const letters = root.replace(/[^A-Za-z]/g, '').toUpperCase();
  const ticker = (letters[0] + letters.slice(1).replace(/[AEIOU]/g, '')).slice(0, 4).padEnd(3, 'X');
  return { name: `${root} ${pick(ALIAS_SUFFIX)}`, ticker };
}

/** Closes of `other` aligned to the timestamps of `ref`, carrying the last value forward. */
function align(ref: Raw[], other: Raw[]): number[] {
  const map = new Map(other.map((r) => [r[0], r[4]]));
  let last = other[0][4];
  return ref.map((r) => (last = map.get(r[0]) ?? last));
}

/** A hand-picked stretch (used by the tutorial) instead of a random one. */
export interface FixedScenario {
  symbol: string;
  startTs: number;
  pre: number;
  play: number;
  alias: { name: string; ticker: string };
  price: number;
}

export async function buildScenario(mode: Mode, fixed?: FixedScenario): Promise<Scenario> {
  const m = await loadManifest();
  const sector = fixed ? Object.keys(m.sectors).find((k) => m.sectors[k].stocks.includes(fixed.symbol))! : pick(Object.keys(m.sectors));
  const { etf, stocks } = m.sectors[sector];
  const symbol = fixed?.symbol ?? pick(stocks.filter((s) => m.symbols[s]));
  const [raw, mkt, sec] = await Promise.all([
    loadSeries(mode, symbol),
    loadSeries(mode, m.market),
    loadSeries(mode, etf),
  ]);

  let start: number, pre: number, end: number;
  const labels: string[] = [];
  const ticks: string[] = [];

  if (mode === 'daily') {
    pre = fixed?.pre ?? 120;
    const play = fixed?.play ?? 252;
    if (fixed) {
      start = raw.findIndex((r) => r[0] === fixed.startTs);
      if (start < 0) throw new Error('Tutorial chart is missing from the data. Run "npm run fetch-data".');
    } else {
      // Only use stretches where the sector ETF already existed.
      const first = raw.findIndex((r) => r[0] >= Math.max(mkt[0][0], sec[0][0]));
      start = first + Math.floor(Math.random() * (raw.length - first - pre - play));
    }
    end = start + pre + play;
    // Month and day are shown (seasonality matters); the year stays hidden.
    let lastMonth = '';
    for (let i = 0; i < pre + play; i++) {
      const k = i - pre;
      const date = new Date(raw[start + i][0] * 1000);
      const month = etMonth.format(date);
      labels.push(`${k < 0 ? `Warm-up day ${pre + k + 1}` : `Day ${k + 1}`} · ${etMonthDay.format(date)}`);
      ticks.push(month !== lastMonth ? month : etMonthDay.format(date));
      lastMonth = month;
    }
  } else {
    const preDays = 2;
    const playDays = 5;
    const dayStarts: number[] = [];
    raw.forEach((r, i) => {
      if (i === 0 || utcDay(r[0]) !== utcDay(raw[i - 1][0])) dayStarts.push(i);
    });
    // Skip the first (possibly partial) day of the download.
    const d0 = 1 + Math.floor(Math.random() * (dayStarts.length - preDays - playDays - 1));
    start = dayStarts[d0];
    pre = dayStarts[d0 + preDays] - start;
    const endDay = d0 + preDays + playDays;
    end = endDay < dayStarts.length ? dayStarts[endDay] : raw.length;
    let d = d0;
    for (let i = start; i < end; i++) {
      while (d + 1 < dayStarts.length && dayStarts[d + 1] <= i) d++;
      const rel = d - d0 - preDays;
      const date = new Date(raw[i][0] * 1000);
      const clock = etClock.format(date);
      const dayName = `${rel < 0 ? `Warm-up ${preDays + rel + 1}` : `Day ${rel + 1}`} · ${etWeekday.format(date)}`;
      labels.push(`${dayName} · ${clock}`);
      ticks.push(i === dayStarts[d] ? dayName : clock);
    }
  }

  const slice = raw.slice(start, end);
  const target = fixed?.price ?? Math.round(rand(14, 220));
  const scale = target / slice[pre - 1][4];
  const volScale = fixed ? 1 : rand(0.4, 2.5);
  const r2 = (x: number) => Math.round(x * scale * 100) / 100;
  const bars: Bar[] = slice.map(([, o, h, l, c, v]) => ({
    o: r2(o),
    h: r2(h),
    l: r2(l),
    c: r2(c),
    v: Math.round(v * volScale),
  }));

  return {
    mode,
    symbol,
    sector,
    etf,
    alias: fixed?.alias ?? makeAlias(),
    bars,
    pre,
    labels,
    ticks,
    market: align(slice, mkt),
    sectorSeries: align(slice, sec),
    startDate: etDate.format(new Date(slice[pre][0] * 1000)),
    endDate: etDate.format(new Date(slice[slice.length - 1][0] * 1000)),
    scale,
  };
}
