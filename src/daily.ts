/**
 * Game of the Day: one real stock, the same for everyone. Read its last 90
 * trading days in disguise, make three up-or-down calls, name the company,
 * then see what it is and how it's doing today.
 */
import { ColorType, createChart, type IChartApi, type ISeriesApi, type SeriesMarker, type Time } from 'lightweight-charts';
import { css, indexOf, timeOf } from './chart';

export interface DailyGame {
  date: string;
  sector: string;
  /** Disguised bars: open, high, low, close (rebased to 100) and volume relative to its average. */
  chart: [number, number, number, number, number][];
  options: { ticker: string; name: string; desc: string }[];
  answer: {
    ticker: string;
    name: string;
    desc: string;
    /** Two hints: a little-known deep cut, then a friendlier fun fact. Older games have none. */
    facts?: { deep: string; fun: string } | null;
    from: string;
    to: string;
    price: number;
    d1: number;
    hi52: number;
    lo52: number;
    y1: number;
    sectorD1: number | null;
    marketD1: number;
  };
  market: { t: number; closes: number[] };
  sectors: { name: string; closes: number[] }[];
}

export interface DailyResult {
  /** Each up-or-down call, and whether it was right. */
  calls: { up: boolean; right: boolean }[];
  /** Tickers guessed, in order; the last one is the answer once done. */
  guesses: string[];
  /** How many hints were opened. */
  hints?: number;
  done: boolean;
  at: string;
}

const KEY = 'atlas.daily.v1';
const base = import.meta.env.BASE_URL;
/** Bars shown before the replay starts, and the bars where it stops to ask. */
const WARM = 30;
const CALLS = [45, 62, 79];
const AHEAD = 10;
const STEP_MS = 190;

// ---------- Data and storage ----------

let gamePromise: Promise<DailyGame | null> | null = null;

/** The latest game, fetched once per visit. Null if there isn't one yet. */
export function loadDailyGame(): Promise<DailyGame | null> {
  gamePromise ??= (async () => {
    try {
      const idx = await (await fetch(`${base}daily/index.json`, { cache: 'no-cache' })).json();
      return (await (await fetch(`${base}daily/${idx.latest}.json`)).json()) as DailyGame;
    } catch {
      return null;
    }
  })();
  return gamePromise;
}

function readAll(): Record<string, DailyResult> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeResult(date: string, r: DailyResult) {
  const all = readAll();
  all[date] = r;
  // A couple of months of history is plenty.
  for (const d of Object.keys(all).sort().slice(0, -60)) delete all[d];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export const dailyResult = (date: string): DailyResult | null => readAll()[date] ?? null;
/** When each finished game was played, for Home's week dots and the passport. */
export const dailyPlays = (): string[] => Object.values(readAll()).filter((r) => r.done).map((r) => r.at);

const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const asDate = (d: string) => new Date(`${d}T12:00:00`);
export const dailyLabel = (d: string) => asDate(d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const shortDate = (d: string, year = false) => asDate(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
const signed = (x: number, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}%`;
const dir = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// ---------- The view ----------

type Stage = 'loading' | 'none' | 'read' | 'guess' | 'reveal';

export class DailyView {
  private game: DailyGame | null = null;
  private stage: Stage = 'loading';
  private chart: IChartApi | null = null;
  private candles: ISeriesApi<'Candlestick'> | null = null;
  private volume: ISeriesApi<'Histogram'> | null = null;
  private shown = WARM;
  private timer = 0;
  private waiting = false;
  private calls: { at: number; up: boolean; right?: boolean }[] = [];
  private guesses: string[] = [];
  private hintsUsed = 0;
  /** Real price per disguised point, once revealed. */
  private scale = 1;

  constructor(private root: HTMLElement) {
    root.addEventListener('click', (e) => this.onClick(e));
  }

  async open() {
    if (this.game) {
      // Back from elsewhere mid-replay: carry on where it stopped.
      return;
    }
    this.root.innerHTML = '<div class="daily-inner"><p class="muted daily-loading">Fetching today’s stock…</p></div>';
    this.game = await loadDailyGame();
    if (!this.game) {
      this.stage = 'none';
      this.root.innerHTML = `<div class="daily-inner"><header class="daily-head"><p class="eyebrow">Game of the Day</p><h2>No game yet</h2><p class="muted">The first one appears after the next market close.</p></header></div>`;
      return;
    }
    const saved = dailyResult(this.game.date);
    this.render();
    if (saved?.done) {
      this.calls = saved.calls.map((c, i) => ({ at: CALLS[i], ...c }));
      this.guesses = saved.guesses;
      this.hintsUsed = saved.hints ?? 0;
      this.reveal(false);
    } else this.toRead();
  }

  pause() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = 0;
    const flash = this.root.querySelector('.daily-flash')?.outerHTML ?? '';
    this.prompt(`${flash}<p class="muted">Paused on day ${this.shown}.</p><button class="btn primary" data-daily="play">Resume</button>`);
  }

  applyTheme() {
    if (!this.chart) return;
    const ink2 = css('--ink-2');
    const up = css('--up');
    const down = css('--down');
    this.chart.applyOptions({
      layout: { textColor: ink2 },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--grid') } },
      rightPriceScale: { borderColor: css('--rule') },
      crosshair: { vertLine: { color: ink2, labelBackgroundColor: css('--accent') }, horzLine: { color: ink2, labelBackgroundColor: css('--accent') } },
    });
    this.candles?.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    this.volume?.applyOptions({ color: css('--rule') });
    this.drawMarkers();
  }

  private render() {
    const g = this.game!;
    const today = g.date === nyToday();
    this.root.innerHTML = `
      <div class="daily-inner">
        <header class="daily-head">
          <p class="eyebrow">Game of the Day${today ? '' : ' · the latest one'}</p>
          <h2>${dailyLabel(g.date)}</h2>
          <p class="muted">One real stock, its last 90 trading days, prices disguised. Read the chart, then name the company.</p>
        </header>
        <ol class="daily-steps" aria-label="Steps">
          <li data-step="read">Read</li>
          <li data-step="guess">Guess</li>
          <li data-step="reveal">Today</li>
        </ol>
        <section class="card daily-board">
          <div class="daily-chart"></div>
          <div class="daily-prompt" aria-live="polite"></div>
        </section>
        <section class="daily-guess" hidden></section>
        <section class="daily-reveal" hidden></section>
      </div>`;
    this.chart?.remove();
    const el = this.root.querySelector<HTMLElement>('.daily-chart')!;
    this.chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, fontFamily: "'Alegreya Sans', system-ui, sans-serif", fontSize: 12, attributionLogo: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      rightPriceScale: { scaleMargins: { top: 0.08, bottom: 0.22 } },
      localization: {
        timeFormatter: (t: Time) => `Day ${indexOf(t) + 1}`,
        priceFormatter: (p: number) => (this.stage === 'reveal' ? `$${(p * this.scale).toFixed(2)}` : p.toFixed(1)),
      },
    });
    this.volume = this.chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    this.chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    this.candles = this.chart.addCandlestickSeries({ priceLineVisible: false });
    this.applyTheme();
  }

  private draw() {
    const bars = this.game!.chart.slice(0, this.shown);
    this.candles!.setData(bars.map(([o, h, l, c], i) => ({ time: timeOf(i), open: o, high: h, low: l, close: c })));
    this.volume!.setData(bars.map((b, i) => ({ time: timeOf(i), value: b[4] })));
    this.chart!.timeScale().setVisibleLogicalRange({ from: -1, to: this.game!.chart.length + 1 });
    this.drawMarkers();
  }

  private drawMarkers() {
    if (!this.candles || !this.game) return;
    const m: SeriesMarker<Time>[] = this.calls
      .filter((c) => c.at < this.shown)
      .map((c) => ({
        time: timeOf(c.at),
        position: c.up ? 'belowBar' : 'aboveBar',
        shape: c.up ? 'arrowUp' : 'arrowDown',
        color: c.right === undefined ? css('--ink-2') : c.right ? css('--up') : css('--down'),
        text: c.right === undefined ? '' : c.right ? '✓' : '✗',
      }));
    this.candles.setMarkers(m);
  }

  private setStep(s: Stage) {
    this.stage = s;
    this.root.querySelectorAll<HTMLElement>('[data-step]').forEach((li) => {
      const order = ['read', 'guess', 'reveal'];
      li.classList.toggle('on', li.dataset.step === s);
      li.classList.toggle('done', order.indexOf(li.dataset.step!) < order.indexOf(s));
    });
  }

  private prompt(html: string) {
    this.root.querySelector('.daily-prompt')!.innerHTML = html;
  }

  // ---------- 1. Read the chart ----------

  private toRead() {
    this.setStep('read');
    this.shown = WARM;
    this.calls = [];
    this.draw();
    this.prompt(`<p>Here are the first ${WARM} days. Press play: the chart will stop three times and ask where it goes next.</p>
      <button class="btn primary" data-daily="play">Play</button>`);
  }

  private play() {
    if (this.timer || this.waiting) return;
    this.prompt('<p class="muted">Watching…</p><button class="btn ghost small" data-daily="pause">Pause</button>');
    this.timer = window.setInterval(() => this.tick(), STEP_MS);
  }

  private tick() {
    const g = this.game!;
    this.shown++;
    // Grade any call whose ten days are now done.
    for (const c of this.calls) {
      if (c.right === undefined && this.shown - 1 === c.at + AHEAD) {
        const move = g.chart[c.at + AHEAD][3] / g.chart[c.at][3] - 1;
        c.right = c.up ? move > 0 : move < 0;
        this.flash(`${c.right ? '✓' : '✗'} You said ${c.up ? 'up' : 'down'}. Ten days later it was ${signed(move * 100)}.`);
      }
    }
    this.draw();
    if (CALLS.includes(this.shown - 1) && !this.calls.some((c) => c.at === this.shown - 1)) return this.ask();
    if (this.shown >= g.chart.length) return this.endRead();
  }

  private flash(text: string) {
    const p = this.root.querySelector('.daily-prompt');
    if (!p) return;
    let f = p.querySelector('.daily-flash');
    if (!f) {
      f = document.createElement('p');
      f.className = 'daily-flash';
      p.prepend(f);
    }
    f.textContent = text;
  }

  private ask() {
    clearInterval(this.timer);
    this.timer = 0;
    this.waiting = true;
    const n = this.calls.length + 1;
    const flash = this.root.querySelector('.daily-flash')?.outerHTML ?? '';
    this.prompt(`${flash}<p><b>Call ${n} of 3.</b> Day ${this.shown} of ${this.game!.chart.length}. Over the next ${AHEAD} days, up or down?</p>
      <div class="daily-calls"><button class="btn up" data-daily="up">▲ Up</button><button class="btn down" data-daily="down">▼ Down</button></div>`);
  }

  private call(up: boolean) {
    this.calls.push({ at: this.shown - 1, up });
    this.waiting = false;
    this.drawMarkers();
    this.play();
  }

  private endRead() {
    clearInterval(this.timer);
    this.timer = 0;
    const g = this.game!;
    const right = this.calls.filter((c) => c.right).length;
    const flash = this.root.querySelector('.daily-flash')?.outerHTML ?? '';
    this.prompt(`${flash}<p>${right} of 3 calls right. That last candle is ${dailyLabel(g.date)}: <b class="${dir(g.answer.d1)}">${signed(g.answer.d1)}</b> in one day.</p>
      <button class="btn primary" data-daily="to-guess">Name the company →</button>`);
    writeResult(g.date, { calls: this.calls.map((c) => ({ up: c.up, right: !!c.right })), guesses: [], done: false, at: new Date().toISOString() });
  }

  // ---------- 2. Name the company ----------

  private toGuess() {
    const g = this.game!;
    this.setStep('guess');
    this.prompt('');
    const box = this.root.querySelector<HTMLElement>('.daily-guess')!;
    box.hidden = false;
    box.innerHTML = `
      <h3>It’s a ${esc(g.sector)} company. Which one?</h3>
      <div class="daily-hints"></div>
      <p class="daily-hint-row"><button class="link-btn" data-daily="hint">💡 Need a hint?</button></p>
      <p class="muted daily-miss" hidden></p>
      <div class="daily-options">
        ${g.options.map((o) => `<button class="daily-option" data-daily="guess" data-t="${o.ticker}"><span class="opt-name">${esc(o.name)} <span class="opt-tk">${o.ticker}</span></span><span class="opt-desc">${esc(o.desc)}</span></button>`).join('')}
      </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private guess(t: string, btn: HTMLElement) {
    const g = this.game!;
    if (this.guesses.includes(t)) return;
    this.guesses.push(t);
    if (t === g.answer.ticker) return this.reveal(true);
    btn.classList.add('wrong');
    btn.setAttribute('disabled', '');
    const miss = this.root.querySelector<HTMLElement>('.daily-miss')!;
    miss.hidden = false;
    const left = this.hintList().length - this.hintsUsed;
    miss.textContent = `Not ${g.options.find((o) => o.ticker === t)!.name}.${left ? ' Try again, or take a hint.' : ' Try again.'}`;
  }

  /** The hint ladder: the deep cut first, then the fun fact, then the numbers. */
  private hintList(): { label: string; text: string }[] {
    const a = this.game!.answer;
    const numbers = `Over the past year it is ${signed(a.y1, 0)}. It closed at $${a.price.toFixed(2)}, between a 52-week low of $${a.lo52.toFixed(0)} and a high of $${a.hi52.toFixed(0)}.`;
    return a.facts
      ? [
          { label: 'A deep cut', text: a.facts.deep },
          { label: 'A fun fact', text: a.facts.fun },
          { label: 'The numbers', text: numbers },
        ]
      : [{ label: 'The numbers', text: numbers }];
  }

  private hint() {
    const list = this.hintList();
    if (this.hintsUsed >= list.length) return;
    const h = list[this.hintsUsed++];
    const box = this.root.querySelector<HTMLElement>('.daily-hints')!;
    box.insertAdjacentHTML('beforeend', `<p class="daily-hint"><span class="hint-lbl">Hint ${this.hintsUsed} · ${h.label}</span>${esc(h.text)}</p>`);
    const btn = this.root.querySelector<HTMLElement>('[data-daily="hint"]')!;
    if (this.hintsUsed >= list.length) btn.parentElement!.hidden = true;
    else btn.textContent = `💡 Another hint (${this.hintsUsed + 1} of ${list.length})`;
  }

  // ---------- 3. See today ----------

  private reveal(fresh: boolean) {
    const g = this.game!;
    const a = g.answer;
    this.stage = 'reveal';
    this.setStep('reveal');
    this.shown = g.chart.length;
    this.scale = a.price / g.chart[g.chart.length - 1][3];
    this.chart!.applyOptions({ localization: { priceFormatter: (p: number) => `$${(p * this.scale).toFixed(2)}` } });
    this.draw();
    const right = this.calls.filter((c) => c.right).length;
    this.prompt(`<p class="muted">Prices on the axis are now real.</p>`);
    if (fresh) writeResult(g.date, { calls: this.calls.map((c) => ({ up: c.up, right: !!c.right })), guesses: this.guesses, hints: this.hintsUsed, done: true, at: new Date().toISOString() });
    this.root.querySelector<HTMLElement>('.daily-guess')!.hidden = true;
    const box = this.root.querySelector<HTMLElement>('.daily-reveal')!;
    box.hidden = false;
    const pos = Math.max(0, Math.min(100, ((a.price - a.lo52) / (a.hi52 - a.lo52 || 1)) * 100));
    const tries = this.guesses.length;
    // A fact you haven't already seen as a hint, if there is one left.
    const dyk = a.facts ? [a.facts.deep, a.facts.fun][this.hintsUsed] : undefined;
    box.innerHTML = `
      <section class="card daily-today">
        <p class="eyebrow">It was</p>
        <h2>${esc(a.name)} <span class="opt-tk">${a.ticker}</span></h2>
        <p class="muted">${esc(a.desc)} The chart ran from ${shortDate(a.from)} to ${shortDate(a.to, true)}.</p>
        ${dyk ? `<p class="daily-dyk"><span class="hint-lbl">Did you know?</span>${esc(dyk)}</p>` : ''}
        <div class="today-row">
          <div><span class="today-lbl">Last close</span><span class="today-big">$${a.price.toFixed(2)}</span></div>
          <div><span class="today-lbl">${dailyLabel(g.date).split(',')[0]}</span><span class="today-big ${dir(a.d1)}">${signed(a.d1)}</span></div>
          <div><span class="today-lbl">Past year</span><span class="today-big ${dir(a.y1)}">${signed(a.y1, 0)}</span></div>
        </div>
        <div class="range52" aria-label="52-week range">
          <span>$${a.lo52.toFixed(0)}</span>
          <span class="range-track"><span class="range-dot" style="left:${pos.toFixed(1)}%"></span></span>
          <span>$${a.hi52.toFixed(0)}</span>
        </div>
        <p class="today-context">${esc(g.sector)}${a.sectorD1 !== null ? ` <b class="${dir(a.sectorD1)}">${signed(a.sectorD1)}</b>` : ''} · whole market <b class="${dir(a.marketD1)}">${signed(a.marketD1)}</b> that day.
          ${Math.abs(a.d1) > Math.abs(a.marketD1) * 3 ? 'A move this much bigger than the market usually means company news: earnings, guidance or a deal.' : 'It moved roughly with the market.'}</p>
      </section>
      <section class="card daily-result">
        <p><b>Your game:</b> ${right} of 3 chart calls · ${tries ? `named it in ${tries} ${tries === 1 ? 'try' : 'tries'}` : 'not named'}${this.hintsUsed ? ` · ${this.hintsUsed} ${this.hintsUsed === 1 ? 'hint' : 'hints'}` : ''}</p>
        <p class="daily-share-line">${this.shareGrid()}</p>
        <div class="daily-actions">
          <button class="btn primary" data-daily="share">Share result</button>
          <button class="btn ghost" data-go="home">Back home</button>
        </div>
        <p class="muted small">A new stock after the next market close.</p>
      </section>`;
    if (fresh) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private shareGrid() {
    return `${this.calls.map((c) => (c.right ? '🟩' : '🟥')).join('')} · ${this.guesses.length}/4${this.hintsUsed ? ` · ${'💡'.repeat(this.hintsUsed)}` : ''}`;
  }

  private async share() {
    const g = this.game!;
    const text = `Atlas · Game of the Day · ${shortDate(g.date)}\nChart calls ${this.calls.map((c) => (c.right ? '🟩' : '🟥')).join('')}\nNamed it in ${this.guesses.length}/4${this.hintsUsed ? ` with ${'💡'.repeat(this.hintsUsed)}` : ''}`;
    const url = location.href.split('#')[0];
    const btn = this.root.querySelector<HTMLButtonElement>('[data-daily="share"]')!;
    try {
      if (navigator.share) await navigator.share({ text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        btn.textContent = 'Copied';
      }
    } catch {
      /* cancelled */
    }
  }

  private onClick(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-daily]');
    if (!el) return;
    const a = el.dataset.daily;
    if (a === 'play') this.play();
    else if (a === 'pause') this.pause();
    else if (a === 'up' || a === 'down') this.call(a === 'up');
    else if (a === 'to-guess') this.toGuess();
    else if (a === 'guess') this.guess(el.dataset.t!, el);
    else if (a === 'hint') this.hint();
    else if (a === 'share') this.share();
  }
}
