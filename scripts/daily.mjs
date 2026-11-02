// Game of the Day: run once after the close. Pulls two years of daily bars for a
// ~100-company universe, picks one of the day's biggest movers, and writes one
// small file the app reads: public/daily/<date>.json, plus public/daily/index.json.
// It also carries the market and sector closes Home uses for its weather line.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { FACTS } from './daily-facts.mjs';

/** One line each: what the company does, plainly. Shown as the guess options. */
const UNIVERSE = {
  Technology: {
    etf: 'XLK',
    stocks: {
      AAPL: ['Apple', 'iPhones, Macs and the services that run on them.'],
      MSFT: ['Microsoft', 'Windows, Office and the Azure cloud.'],
      NVDA: ['Nvidia', 'Graphics chips that became the engine of AI.'],
      AMD: ['AMD', 'Processors and graphics chips for PCs and data centers.'],
      INTC: ['Intel', 'PC and server chips, made in its own factories.'],
      AVGO: ['Broadcom', 'Networking chips plus big enterprise software.'],
      ORCL: ['Oracle', 'Databases and a fast-growing cloud business.'],
      CRM: ['Salesforce', 'Software companies use to manage their customers.'],
      ADBE: ['Adobe', 'Photoshop, Acrobat and other creative software.'],
      CSCO: ['Cisco', 'The routers and switches that move internet traffic.'],
      QCOM: ['Qualcomm', 'The chips and patents inside most smartphones.'],
      MU: ['Micron', 'Memory chips: a famously boom-and-bust business.'],
    },
  },
  Financials: {
    etf: 'XLF',
    stocks: {
      JPM: ['JPMorgan Chase', "America's largest bank."],
      BAC: ['Bank of America', 'A giant consumer and corporate bank.'],
      GS: ['Goldman Sachs', 'Investment banking and trading.'],
      SCHW: ['Charles Schwab', 'A brokerage where millions keep their investments.'],
      MS: ['Morgan Stanley', 'Wealth management and investment banking.'],
      WFC: ['Wells Fargo', 'A big branch bank, strong in home loans.'],
      C: ['Citigroup', 'A global bank in the middle of a long turnaround.'],
      V: ['Visa', 'The payment network behind most card swipes.'],
      MA: ['Mastercard', 'The other big card payment network.'],
      AXP: ['American Express', 'Premium cards: it lends and runs the network.'],
      BLK: ['BlackRock', "The world's largest asset manager."],
      PYPL: ['PayPal', 'Online payments, including Venmo.'],
    },
  },
  Energy: {
    etf: 'XLE',
    stocks: {
      XOM: ['ExxonMobil', 'The largest US oil and gas company.'],
      CVX: ['Chevron', 'An integrated oil major, from wells to gas stations.'],
      OXY: ['Occidental', 'Oil producer, heavily focused on the Permian basin.'],
      COP: ['ConocoPhillips', 'The biggest pure oil and gas producer in the US.'],
      SLB: ['SLB', 'Oilfield services: the tools and crews that drill wells.'],
      EOG: ['EOG Resources', 'Shale oil and gas producer.'],
      PSX: ['Phillips 66', 'Refines crude into gasoline and chemicals.'],
      MPC: ['Marathon Petroleum', "America's largest refiner."],
      VLO: ['Valero', 'A refiner: it lives on the gap between crude and gasoline.'],
      HAL: ['Halliburton', 'Fracking and oilfield services.'],
      DVN: ['Devon Energy', 'Shale producer known for paying out its cash.'],
      KMI: ['Kinder Morgan', 'Pipelines that carry natural gas across the country.'],
    },
  },
  'Health Care': {
    etf: 'XLV',
    stocks: {
      PFE: ['Pfizer', 'Big drugmaker; COVID made it a household name.'],
      UNH: ['UnitedHealth', 'The largest US health insurer.'],
      MRNA: ['Moderna', 'mRNA vaccines, betting on what comes after COVID.'],
      JNJ: ['Johnson & Johnson', 'Drugs and medical devices.'],
      LLY: ['Eli Lilly', 'Drugmaker riding diabetes and weight-loss drugs.'],
      MRK: ['Merck', 'Drugmaker built around a blockbuster cancer drug.'],
      ABBV: ['AbbVie', 'Immunology drugs and Botox.'],
      AMGN: ['Amgen', 'One of the oldest biotech companies.'],
      TMO: ['Thermo Fisher', 'The lab equipment and supplies behind research.'],
      GILD: ['Gilead', 'HIV and liver disease drugs.'],
      CVS: ['CVS Health', 'Pharmacies plus a health insurer.'],
      ISRG: ['Intuitive Surgical', 'Robots that help surgeons operate.'],
    },
  },
  'Consumer Discretionary': {
    etf: 'XLY',
    stocks: {
      TSLA: ['Tesla', 'Electric cars, batteries and big promises.'],
      AMZN: ['Amazon', 'Online shopping, plus the AWS cloud.'],
      NKE: ['Nike', 'Sneakers and sportswear.'],
      HD: ['Home Depot', 'Home improvement stores; rides the housing market.'],
      MCD: ["McDonald's", 'Fast food, mostly run by franchisees.'],
      SBUX: ['Starbucks', 'Coffee shops around the world.'],
      LOW: ["Lowe's", 'The other big home improvement chain.'],
      BKNG: ['Booking Holdings', 'Online travel: hotels, flights and rentals.'],
      GM: ['General Motors', 'Detroit carmaker: trucks, SUVs and some EVs.'],
      F: ['Ford', 'Detroit carmaker, best known for the F-150.'],
      CMG: ['Chipotle', 'Fast-casual burritos and bowls.'],
      ABNB: ['Airbnb', 'Book a stay in someone else’s home.'],
    },
  },
  Communication: {
    etf: 'XLC',
    stocks: {
      META: ['Meta', 'Facebook, Instagram and WhatsApp, paid for by ads.'],
      NFLX: ['Netflix', 'Streaming movies and shows by subscription.'],
      DIS: ['Disney', 'Theme parks, films and streaming.'],
      GOOGL: ['Alphabet', 'Google search, YouTube and a big cloud business.'],
      T: ['AT&T', 'Phone and fiber internet service.'],
      VZ: ['Verizon', 'The largest US wireless carrier.'],
      CMCSA: ['Comcast', 'Cable and internet, plus NBC and Universal.'],
      TMUS: ['T-Mobile', 'The wireless carrier that grew by being the challenger.'],
      EA: ['Electronic Arts', 'Video games: sports titles and more.'],
      TTWO: ['Take-Two', 'Video games, including Grand Theft Auto.'],
      SNAP: ['Snap', 'Snapchat: camera-first social media.'],
      PINS: ['Pinterest', 'Pinboards of ideas, paid for by ads.'],
    },
  },
  Industrials: {
    etf: 'XLI',
    stocks: {
      BA: ['Boeing', 'Airliners and defense aircraft.'],
      CAT: ['Caterpillar', 'Bulldozers, mining trucks and engines.'],
      GE: ['GE Aerospace', 'Jet engines for most of the world’s airliners.'],
      HON: ['Honeywell', 'Industrial controls, aerospace parts and more.'],
      UPS: ['UPS', 'Package delivery: the brown trucks.'],
      DE: ['Deere', 'Tractors and farm machinery.'],
      LMT: ['Lockheed Martin', 'Fighter jets and missiles.'],
      RTX: ['RTX', 'Jet engines and missile defense.'],
      UNP: ['Union Pacific', 'Railroad across the western US.'],
      FDX: ['FedEx', 'Overnight shipping by air and road.'],
      MMM: ['3M', 'Post-its, tape and thousands of materials.'],
      DAL: ['Delta Air Lines', 'One of the big US airlines.'],
    },
  },
  'Consumer Staples': {
    etf: 'XLP',
    stocks: {
      PG: ['Procter & Gamble', 'Tide, Pampers, Gillette: things you buy every week.'],
      KO: ['Coca-Cola', 'Soft drinks sold almost everywhere.'],
      PEP: ['PepsiCo', 'Soda plus snacks like Doritos.'],
      WMT: ['Walmart', 'The largest retailer in the world.'],
      COST: ['Costco', 'Membership warehouse stores.'],
      MDLZ: ['Mondelez', 'Oreos, Cadbury and other snacks.'],
      CL: ['Colgate-Palmolive', 'Toothpaste and soap.'],
      PM: ['Philip Morris', 'Cigarettes abroad, and smoke-free alternatives.'],
      MO: ['Altria', 'Marlboro in the US.'],
      KHC: ['Kraft Heinz', 'Ketchup, mac and cheese, packaged food.'],
      TGT: ['Target', 'Big-box stores that mix essentials and style.'],
      KR: ['Kroger', 'The largest US supermarket chain.'],
    },
  },
};
const MARKET = 'SPY';
/** The replay: 90 trading days that end on the most recent close. */
const WINDOW = 90;
const KEEP_DAYS = 30;
const OUT = 'public/daily';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDaily(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d&includePrePost=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  const r = (await res.json()).chart.result[0];
  const q = r.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((x) => x == null)) continue;
    bars.push({ t: r.timestamp[i], o, h, l, c, v: q.volume[i] ?? 0 });
  }
  return bars;
}

const nyDate = (t) => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const pct = (a, b) => +((a / b - 1) * 100).toFixed(2);
const round = (x, d = 2) => +x.toFixed(d);

/** A small seeded random, so a given day always picks the same options. */
function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

// ---------- Fetch ----------

const data = {};
const symbols = [MARKET, ...Object.values(UNIVERSE).flatMap((s) => [s.etf, ...Object.keys(s.stocks)])];
for (const s of symbols) {
  try {
    data[s] = await fetchDaily(s);
    process.stdout.write('.');
  } catch (e) {
    console.warn(`\nskipped ${s}: ${e.message}`);
  }
  await sleep(250);
}
console.log();

// Run during market hours, today's bar is still forming: leave it out until the close.
const nowNY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
const todayNY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
if (nowNY.getHours() * 60 + nowNY.getMinutes() < 16 * 60 + 20) {
  for (const s of Object.keys(data)) if (data[s].length && nyDate(data[s][data[s].length - 1].t) === todayNY) data[s].pop();
}

const spy = data[MARKET];
if (!spy?.length) throw new Error('No market data; nothing written.');
const lastT = spy[spy.length - 1].t;
const date = nyDate(lastT);

// ---------- Pick the stock ----------

await mkdir(OUT, { recursive: true });
const recent = new Set();
for (const f of (await readdir(OUT)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${date}.json`).sort().slice(-10)) {
  recent.add(JSON.parse(await readFile(`${OUT}/${f}`, 'utf8')).answer.ticker);
}

const movers = [];
for (const [sector, { stocks }] of Object.entries(UNIVERSE)) {
  for (const tk of Object.keys(stocks)) {
    const b = data[tk];
    // Needs a full year, and today's bar must be the market's latest day.
    if (!b || b.length < 200 || nyDate(b[b.length - 1].t) !== date) continue;
    movers.push({ tk, sector, d1: pct(b[b.length - 1].c, b[b.length - 2].c) });
  }
}
movers.sort((a, b) => Math.abs(b.d1) - Math.abs(a.d1));
const pick = movers.find((m) => !recent.has(m.tk)) ?? movers[0];
if (!pick) throw new Error('No eligible stocks; nothing written.');

// ---------- Build the game ----------

const bars = data[pick.tk];
const win = bars.slice(-WINDOW);
const base = win[0].c;
const avgVol = win.reduce((a, b) => a + b.v, 0) / win.length || 1;
// Disguised: prices rebased to 100, volume relative to its own average, no dates.
const chart = win.map((b) => [round((b.o / base) * 100), round((b.h / base) * 100), round((b.l / base) * 100), round((b.c / base) * 100), round(b.v / avgVol)]);

const rand = rng(date + pick.tk);
const { stocks, etf } = UNIVERSE[pick.sector];
const others = Object.keys(stocks).filter((t) => t !== pick.tk && data[t]);
const options = [pick.tk];
while (options.length < 4 && others.length) options.push(others.splice(Math.floor(rand() * others.length), 1)[0]);
options.sort(() => rand() - 0.5);

const last = bars[bars.length - 1];
// The 52 weeks are measured by date (two years are fetched), so re-running on a later day gives the same file.
const year = bars.filter((b) => b.t >= last.t - 365 * 86400);
const sec = data[etf];
const game = {
  date,
  sector: pick.sector,
  chart,
  options: options.map((t) => ({ ticker: t, name: stocks[t][0], desc: stocks[t][1] })),
  answer: {
    ticker: pick.tk,
    name: stocks[pick.tk][0],
    desc: stocks[pick.tk][1],
    facts: FACTS[pick.tk] ?? null,
    from: nyDate(win[0].t),
    to: date,
    price: round(last.c),
    d1: pick.d1,
    hi52: round(Math.max(...year.map((b) => b.h))),
    lo52: round(Math.min(...year.map((b) => b.l))),
    y1: pct(last.c, year[0].c),
    sectorD1: sec ? pct(sec[sec.length - 1].c, sec[sec.length - 2].c) : null,
    marketD1: pct(spy[spy.length - 1].c, spy[spy.length - 2].c),
  },
  // For Home's weather line and sector pulse.
  market: { t: lastT, closes: spy.slice(-23).map((b) => round(b.c)) },
  sectors: Object.entries(UNIVERSE)
    .filter(([, s]) => data[s.etf])
    .map(([name, s]) => ({ name, closes: data[s.etf].slice(-23).map((b) => round(b.c)) })),
};

await writeFile(`${OUT}/${date}.json`, JSON.stringify(game));

// Keep the last month of games; older ones are dropped.
const files = (await readdir(OUT)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
for (const f of files.slice(0, -KEEP_DAYS)) await rm(`${OUT}/${f}`);
const dates = files.slice(-KEEP_DAYS).map((f) => f.slice(0, 10));
await writeFile(`${OUT}/index.json`, JSON.stringify({ latest: dates[dates.length - 1], dates }));

console.log(`${date}: ${pick.tk} (${pick.sector}) ${pick.d1 > 0 ? '+' : ''}${pick.d1}% · ${movers.length} eligible · options ${options.join(', ')}`);
