import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LogicalRange,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Point } from './indicators';
import type { Bar } from './types';

export const timeOf = (i: number) => ((i + 1) * 86400) as UTCTimestamp;
export const indexOf = (t: Time) => (t as number) / 86400 - 1;

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export type Overlay = 'sma8' | 'sma25' | 'sma50' | 'bb' | 'volume' | 'macd' | 'liquidity';
type MarkerKind = 'trades' | 'news' | 'swings';

/** Candles with SMAs, Bollinger Bands and volume on top; MACD in a synced pane below. */
export class ChartView {
  readonly main: IChartApi;
  readonly macd: IChartApi;
  readonly candles: ISeriesApi<'Candlestick'>;
  private volume: ISeriesApi<'Histogram'>;
  private sma8: ISeriesApi<'Line'>;
  private sma25: ISeriesApi<'Line'>;
  private sma50: ISeriesApi<'Line'>;
  private bbU: ISeriesApi<'Line'>;
  private bbM: ISeriesApi<'Line'>;
  private bbL: ISeriesApi<'Line'>;
  private hist: ISeriesApi<'Histogram'>;
  private macdLine: ISeriesApi<'Line'>;
  private sigLine: ISeriesApi<'Line'>;
  private markers: Record<MarkerKind, SeriesMarker<Time>[]> = { trades: [], news: [], swings: [] };
  private lines = new Map<string, IPriceLine>();
  private trendLines: ISeriesApi<'Line'>[] = [];
  private shown: { bar: Bar; p: Point }[] = [];
  labels: string[] = [];
  ticks: string[] = [];

  constructor(mainEl: HTMLElement, private macdEl: HTMLElement) {
    this.main = createChart(mainEl, this.options(false));
    this.macd = createChart(macdEl, { ...this.options(true), layout: { ...this.options(true).layout, attributionLogo: false } });
    this.candles = this.main.addCandlestickSeries({ priceLineVisible: false });
    this.volume = this.main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    this.main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const line = (width: 1 | 2, style = LineStyle.Solid) =>
      this.main.addLineSeries({ lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    this.sma8 = line(1);
    this.sma25 = line(2);
    this.sma50 = line(2);
    this.bbU = line(1, LineStyle.Dashed);
    this.bbM = line(1, LineStyle.Dotted);
    this.bbL = line(1, LineStyle.Dashed);
    this.hist = this.macd.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
    this.macdLine = this.macd.addLineSeries({ lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
    this.sigLine = this.macd.addLineSeries({ lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    this.applyTheme();

    let syncing = false;
    const sync = (to: IChartApi) => (r: LogicalRange | null) => {
      if (!r || syncing) return;
      syncing = true;
      to.timeScale().setVisibleLogicalRange(r);
      syncing = false;
    };
    this.main.timeScale().subscribeVisibleLogicalRangeChange(sync(this.macd));
    this.macd.timeScale().subscribeVisibleLogicalRangeChange(sync(this.main));
  }

  private options(showTime: boolean) {
    return {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, fontFamily: "'Alegreya Sans', system-ui, sans-serif", fontSize: 12 },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { minimumWidth: 72 },
      timeScale: {
        visible: showTime,
        rightOffset: 6,
        barSpacing: 6,
        tickMarkFormatter: (t: Time) => this.ticks[indexOf(t)] ?? '',
      },
      localization: {
        timeFormatter: (t: Time) => this.labels[indexOf(t)] ?? '',
        priceFormatter: (p: number) => p.toFixed(2),
      },
    };
  }

  applyTheme() {
    const ink2 = css('--ink-2');
    const grid = css('--grid');
    const rule = css('--rule');
    const accent = css('--accent');
    for (const c of [this.main, this.macd]) {
      c.applyOptions({
        layout: { textColor: ink2 },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } },
        rightPriceScale: { borderColor: rule },
        timeScale: { borderColor: rule },
        crosshair: {
          vertLine: { color: ink2, labelBackgroundColor: accent },
          horzLine: { color: ink2, labelBackgroundColor: accent },
        },
      });
    }
    const up = css('--up');
    const down = css('--down');
    this.candles.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
    this.sma8.applyOptions({ color: css('--gold') });
    this.sma25.applyOptions({ color: accent });
    this.sma50.applyOptions({ color: css('--plum') });
    const band = css('--band');
    this.bbU.applyOptions({ color: band });
    this.bbM.applyOptions({ color: rgba(band, 0.6) });
    this.bbL.applyOptions({ color: band });
    this.macdLine.applyOptions({ color: accent });
    this.sigLine.applyOptions({ color: css('--gold') });
    // Per-bar colors are baked into the data, so redraw what is on screen.
    if (this.shown.length) this.redraw();
  }

  reset(bars: Bar[], points: Point[], count: number, labels: string[], ticks: string[]) {
    this.labels = labels;
    this.ticks = ticks;
    this.shown = bars.slice(0, count).map((bar, i) => ({ bar, p: points[i] }));
    for (const k of Object.keys(this.markers) as MarkerKind[]) this.markers[k] = [];
    this.candles.setMarkers([]);
    for (const l of this.lines.values()) this.candles.removePriceLine(l);
    this.lines.clear();
    this.clearTrendLines();
    this.redraw();
    // Wait for autoSize to measure the container before framing the view.
    const frame = () => this.main.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 110), to: count + 25 });
    requestAnimationFrame(() => requestAnimationFrame(frame));
  }

  private redraw() {
    const s = this.shown;
    const t = (i: number) => timeOf(i);
    const lineData = (f: (p: Point) => number | undefined) =>
      s.map(({ p }, i) => {
        const v = f(p);
        return v === undefined ? { time: t(i) } : { time: t(i), value: v };
      });
    this.candles.setData(s.map(({ bar }, i) => ({ time: t(i), open: bar.o, high: bar.h, low: bar.l, close: bar.c })));
    this.volume.setData(s.map(({ bar }, i) => ({ time: t(i), value: bar.v, color: this.volColor(bar) })));
    this.sma8.setData(lineData((p) => p.sma8));
    this.sma25.setData(lineData((p) => p.sma25));
    this.sma50.setData(lineData((p) => p.sma50));
    this.bbU.setData(lineData((p) => p.bbU));
    this.bbM.setData(lineData((p) => p.bbM));
    this.bbL.setData(lineData((p) => p.bbL));
    this.hist.setData(s.map(({ p }, i) => ({ time: t(i), value: p.hist, color: this.histColor(p.hist) })));
    this.macdLine.setData(lineData((p) => p.macd));
    this.sigLine.setData(lineData((p) => p.signal));
  }

  private volColor(b: Bar) {
    return rgba(b.c >= b.o ? css('--up') : css('--down'), 0.35);
  }

  private histColor(h: number) {
    return rgba(h >= 0 ? css('--up') : css('--down'), 0.6);
  }

  update(i: number, bar: Bar, p: Point) {
    this.shown[i] = { bar, p };
    const time = timeOf(i);
    const set = (s: ISeriesApi<'Line'>, v: number | undefined) => v !== undefined && s.update({ time, value: v });
    this.candles.update({ time, open: bar.o, high: bar.h, low: bar.l, close: bar.c });
    this.volume.update({ time, value: bar.v, color: this.volColor(bar) });
    set(this.sma8, p.sma8);
    set(this.sma25, p.sma25);
    set(this.sma50, p.sma50);
    set(this.bbU, p.bbU);
    set(this.bbM, p.bbM);
    set(this.bbL, p.bbL);
    this.hist.update({ time, value: p.hist, color: this.histColor(p.hist) });
    set(this.macdLine, p.macd);
    set(this.sigLine, p.signal);
  }

  setOverlay(o: Overlay, visible: boolean) {
    const series = {
      sma8: [this.sma8],
      sma25: [this.sma25],
      sma50: [this.sma50],
      bb: [this.bbU, this.bbM, this.bbL],
      volume: [this.volume],
      macd: [],
      liquidity: [],
    }[o];
    for (const s of series) s.applyOptions({ visible });
    if (o === 'macd') this.macdEl.hidden = !visible;
  }

  addMarker(kind: MarkerKind, m: SeriesMarker<Time>) {
    this.markers[kind].push(m);
    this.flushMarkers();
  }

  clearMarkers(kind: MarkerKind) {
    this.markers[kind] = [];
    this.flushMarkers();
  }

  private flushMarkers() {
    const all = [...this.markers.trades, ...this.markers.news, ...this.markers.swings];
    all.sort((a, b) => (a.time as number) - (b.time as number));
    this.candles.setMarkers(all);
  }

  /** Create, move or (with null) remove a horizontal line on the price chart. */
  setLine(key: string, price: number | null, opts: { color: string; title: string; style?: LineStyle }) {
    const existing = this.lines.get(key);
    if (price === null) {
      if (existing) this.candles.removePriceLine(existing);
      this.lines.delete(key);
      return;
    }
    const o = { price, color: opts.color, title: opts.title, lineStyle: opts.style ?? LineStyle.Solid, lineWidth: 1 as const, axisLabelVisible: true };
    if (existing) existing.applyOptions(o);
    else this.lines.set(key, this.candles.createPriceLine(o));
  }

  /** A straight line between two clicked points (bar index, price). */
  addTrendLine(a: { i: number; price: number }, b: { i: number; price: number }) {
    if (a.i === b.i) return;
    const [p, q] = a.i < b.i ? [a, b] : [b, a];
    const series = this.main.addLineSeries({
      color: css('--accent'),
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      autoscaleInfoProvider: () => null,
    });
    series.setData([
      { time: timeOf(p.i), value: p.price },
      { time: timeOf(q.i), value: q.price },
    ]);
    this.trendLines.push(series);
  }

  clearTrendLines() {
    for (const s of this.trendLines) this.main.removeSeries(s);
    this.trendLines = [];
  }

  lineKeys(prefix: string) {
    return [...this.lines.keys()].filter((k) => k.startsWith(prefix));
  }
}

export { css, rgba };
