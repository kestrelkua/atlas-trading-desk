// Pulls a library of real price history once and caches it as static JSON in public/data.
// The game only ever reads these files, so no API keys or rate limits during play.
import { mkdir, writeFile } from 'node:fs/promises';

const SECTORS = {
  Technology: { etf: 'XLK', stocks: ['AAPL', 'NVDA', 'MSFT', 'AMD', 'INTC'] },
  Financials: { etf: 'XLF', stocks: ['JPM', 'BAC', 'GS', 'SCHW'] },
  Energy: { etf: 'XLE', stocks: ['XOM', 'CVX', 'OXY'] },
  'Health Care': { etf: 'XLV', stocks: ['PFE', 'UNH', 'MRNA'] },
  'Consumer Discretionary': { etf: 'XLY', stocks: ['TSLA', 'AMZN', 'NKE'] },
  Communication: { etf: 'XLC', stocks: ['META', 'NFLX', 'DIS'] },
  Industrials: { etf: 'XLI', stocks: ['BA', 'CAT', 'GE'] },
};
const MARKET = 'SPY';
// Extra instruments for the War Economy basket: defense, gold, airlines.
const WAR = ['ITA', 'GLD', 'JETS'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBars(symbol, range, interval) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}&includePrePost=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol} ${interval}: HTTP ${res.status}`);
  const json = await res.json();
  const r = json.chart.result[0];
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
    if ([o, h, l, c].some((x) => x == null)) continue;
    bars.push([r.timestamp[i], +o.toFixed(4), +h.toFixed(4), +l.toFixed(4), +c.toFixed(4), v ?? 0]);
  }
  return bars;
}

const manifest = { market: MARKET, sectors: SECTORS, war: WAR, fetchedAt: new Date().toISOString(), symbols: {} };
const all = [MARKET, ...WAR, ...Object.values(SECTORS).flatMap((s) => [s.etf, ...s.stocks])];

for (const dir of ['daily', 'intraday']) await mkdir(`public/data/${dir}`, { recursive: true });

for (const sym of all) {
  try {
    const daily = await fetchBars(sym, '10y', '1d');
    await sleep(400);
    const intraday = await fetchBars(sym, '60d', '5m');
    await writeFile(`public/data/daily/${sym}.json`, JSON.stringify(daily));
    await writeFile(`public/data/intraday/${sym}.json`, JSON.stringify(intraday));
    manifest.symbols[sym] = { daily: daily.length, intraday: intraday.length };
    console.log(`${sym.padEnd(5)} daily ${daily.length}  5m ${intraday.length}`);
  } catch (e) {
    console.warn(`skip ${sym}: ${e.message}`);
  }
  await sleep(400);
}

await writeFile('public/data/manifest.json', JSON.stringify(manifest, null, 2));
console.log('done');
