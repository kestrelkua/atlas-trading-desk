import type { Bar } from './types';

export interface ReplayHandlers {
  onBarOpen(i: number): void;
  onTick(i: number, partial: Bar): void;
  onBarClose(i: number): void;
  onEnd(): void;
}

export const TICKS_PER_BAR = 10;

/**
 * A plausible path inside one bar: open → first extreme → second extreme → close.
 * Up bars usually visit the low first, down bars the high. The extremes land on
 * exact ticks so stops placed inside the bar's range are always tested.
 */
export function buildPath(b: Bar): number[] {
  const T = TICKS_PER_BAR;
  const lowFirst = b.c >= b.o ? Math.random() < 0.7 : Math.random() < 0.3;
  const ka = 1 + Math.floor(Math.random() * 4);
  const km = 5 + Math.floor(Math.random() * 4);
  const way: [number, number][] = [
    [0, b.o],
    [ka, lowFirst ? b.l : b.h],
    [km, lowFirst ? b.h : b.l],
    [T - 1, b.c],
  ];
  const path: number[] = [];
  let s = 0;
  for (let k = 0; k < T; k++) {
    while (k > way[s + 1][0]) s++;
    const [k0, p0] = way[s];
    const [k1, p1] = way[s + 1];
    const p = p0 + ((p1 - p0) * (k - k0)) / (k1 - k0);
    const onWaypoint = way.some(([wk]) => wk === k);
    const jitter = onWaypoint ? 0 : (b.h - b.l) * 0.1 * (Math.random() - 0.5);
    path.push(Math.min(b.h, Math.max(b.l, p + jitter)));
  }
  return path;
}

/** The bar as it looks after tick `k` of its path (the last tick is the finished bar). */
export function partialAt(b: Bar, path: number[], k: number): Bar {
  if (k >= TICKS_PER_BAR - 1) return b;
  const seg = path.slice(0, k + 1);
  return { o: b.o, h: Math.max(...seg), l: Math.min(...seg), c: seg[seg.length - 1], v: Math.round((b.v * (k + 1)) / TICKS_PER_BAR) };
}

export class Replay {
  i: number;
  k = 0;
  speed = 2;
  playing = false;
  done = false;
  private path: number[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;

  constructor(private bars: Bar[], start: number, private h: ReplayHandlers) {
    this.i = start;
  }

  play() {
    if (this.done || this.playing) return;
    this.playing = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  /** Finish the forming bar, or play one whole bar if none is forming. */
  stepBar() {
    if (this.done) return;
    do this.tick();
    while (this.k !== 0 && !this.done);
  }

  private loop = () => {
    const now = performance.now();
    this.acc += now - this.last;
    this.last = now;
    const dt = 1000 / (this.speed * TICKS_PER_BAR);
    let n = 0;
    while (this.acc >= dt && this.playing && !this.done && n++ < 60) {
      this.acc -= dt;
      this.tick();
    }
    if (this.playing && !this.done) this.raf = requestAnimationFrame(this.loop);
  };

  private tick() {
    if (this.k === 0) {
      this.path = buildPath(this.bars[this.i]);
      this.h.onBarOpen(this.i);
    }
    const last = this.k === TICKS_PER_BAR - 1;
    this.h.onTick(this.i, partialAt(this.bars[this.i], this.path, this.k));
    this.k++;
    if (last) {
      this.h.onBarClose(this.i);
      this.k = 0;
      this.i++;
      if (this.i >= this.bars.length) {
        this.done = true;
        this.playing = false;
        this.h.onEnd();
      }
    }
  }
}
