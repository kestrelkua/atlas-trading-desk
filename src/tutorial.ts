import type { FixedScenario } from './data';
import type { Scenario } from './types';

/** The hand-picked chart: a tight base, a clean breakout on volume, then a choppy stretch. */
export const TUTORIAL_CHART: FixedScenario = {
  symbol: 'XOM',
  startTs: 1624887000,
  pre: 120,
  play: 90,
  alias: { name: 'Meridian Holdings', ticker: 'MRDN' },
  price: 50,
};
/** Play-relative bars where the script pauses. */
const BREAKOUT = 13;
export const TUTORIAL_NEWS_BAR = BREAKOUT + 9;

export interface TutorialApi {
  resume(): void;
  pause(): void;
  setTool(tool: 'level' | null): void;
  guideLine(show: boolean): void;
  openCalendar(open: boolean): void;
  setTicket(): void;
  hasOpenTrade(): boolean;
  equity(): number;
  skip(): void;
  /** Re-render anything whose enabled state depends on the current step. */
  refresh(): void;
}

type Trigger = { bar: number } | { event: string };

interface Step {
  title: string;
  body: string;
  target?: string;
  /** Event that completes the step; without one, the step has a Next button. */
  wait?: string;
  waitText?: string;
  /** Let the replay run until this happens, then show the step. */
  trigger?: Trigger;
  allow?: string[];
  resumeAfter?: boolean;
  onShow?(api: TutorialApi): void;
  onHide?(api: TutorialApi): void;
  skipIf?(api: TutorialApi): boolean;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Atlas',
    body: `<p>Atlas replays <b>real market history in disguise</b>. The stock's name, the year and the price level are hidden, so you can't cheat from memory, but every candle really happened.</p>
      <p>The point isn't to get lucky. It's to build the instincts of a trader: <b>make good decisions for good reasons</b>. Atlas grades your reasons, not just your results, because good reasons create good results over time.</p>
      <p>This practice round takes about four minutes. Let's go.</p>`,
  },
  {
    title: 'The chart',
    target: '.chart-wrap',
    body: `<p>Each candle is one trading day. <span class="up">Green</span> closed higher than it opened, <span class="down">red</span> closed lower. The thin wicks show the day's high and low.</p>
      <p>Everything on screen now is the <b>warm-up</b>: history you can study before the round starts. The bottom axis shows the month (time of year can matter), but never the year.</p>`,
  },
  {
    title: 'Your instruments',
    target: '#legend',
    body: `<p><b>SMAs</b> (8, 25, 50) are moving averages that show the trend. <b>Bollinger Bands</b> show how stretched price is. <b>Volume</b> shows how many shares traded. <b>MACD</b>, in the lower pane, shows momentum.</p>
      <p>Toggle any of them here. <b>Liquidity zones</b> highlight areas where lots of volume traded or where stop orders cluster.</p>`,
  },
  {
    title: 'The briefing',
    target: '#briefing',
    body: `<p>Before every round you get a briefing: how the broad market and this stock's sector have been doing, how volatile things are, and what the trend looks like. Read the conditions before you act.</p>`,
  },
  {
    title: 'Draw a level',
    target: '.chart-wrap',
    wait: 'level',
    waitText: 'Click the chart to draw a level.',
    allow: ['tool'],
    body: `<p>Price has been stuck in a tight range for weeks. The top of that range is <b>resistance</b>: a ceiling sellers keep defending.</p>
      <p>The Level tool is on. <b>Click the chart near the dashed guide</b> to mark the ceiling.</p>`,
    onShow: (api) => {
      api.setTool('level');
      api.guideLine(true);
    },
    onHide: (api) => {
      api.setTool(null);
      api.guideLine(false);
    },
  },
  {
    title: 'More drawing tools',
    target: '#tool-seg',
    body: `<p>You can also draw <b>trend lines</b> (click two points) and mark <b>swing</b> highs and lows. <b>Clear marks</b> wipes them all.</p>`,
  },
  {
    title: 'Commit to a bias',
    target: '#briefing',
    wait: 'bias',
    waitText: 'Pick Bullish, Neutral or Bearish.',
    allow: ['bias'],
    body: `<p>Before the round starts, say what you expect. Committing to a view keeps you honest, and the debrief will tell you whether you read it right.</p>`,
  },
  {
    title: 'The calendar',
    target: '.cal-wrap',
    body: `<p>Scheduled events show up here once their dates are announced, usually a few weeks ahead, just like the real market. <b>EARN</b> is the company's earnings report. Codes like <b>CPI</b>, <b>FED</b> and <b>JOBS</b> are economic releases that move the whole market.</p>
      <p>They're also pinned on the progress strip. Big events mean big moves, in either direction. Plan for them.</p>`,
    onShow: (api) => api.openCalendar(true),
    onHide: (api) => api.openCalendar(false),
  },
  {
    title: 'Start the round',
    target: '#play',
    wait: 'start',
    waitText: 'Press Start (or Space).',
    allow: ['play'],
    body: `<p>When you start, candles form live, tick by tick. Watch what happens at your level.</p>`,
  },
  {
    title: 'A breakout',
    trigger: { bar: BREAKOUT },
    target: '.chart-wrap',
    body: `<p>Price just <b>closed above your level</b>, on heavy volume. That's a <b>breakout</b>: buyers finally overpowered the sellers at the ceiling.</p>
      <p>That's a reason to buy. Let's take the trade.</p>`,
  },
  {
    title: 'Name your reason',
    target: '#chips',
    wait: 'tag:breakout',
    waitText: 'Select "Breakout / Breakdown".',
    allow: ['tag'],
    body: `<p>Every trade needs a reason. Atlas checks each reason against the chart and marks it ✓ or ✗. Hover any reason to see its exact rule.</p>`,
  },
  {
    title: 'Size and safety',
    target: '#order',
    body: `<p><b>Size</b> is how much of your account goes in. <b>Stop</b> is where you'll get out if you're wrong, measured in ATR (the average daily range). <b>Target</b> is optional, for taking profit automatically.</p>
      <p>We've set 25% size with a 1.5 ATR stop and no target, so the winner can run.</p>`,
    onShow: (api) => api.setTicket(),
  },
  {
    title: 'Buy',
    target: '.actions',
    wait: 'trade-open',
    waitText: 'Press Buy · Long (or B).',
    allow: ['trade'],
    resumeAfter: true,
    body: `<p>Go long. Your entry, stop and target appear as lines on the chart.</p>`,
  },
  {
    title: 'Watch the money',
    trigger: { bar: BREAKOUT + 6 },
    target: '#account',
    body: `<p>Here's your account. As price rises, your <b>open profit</b> and <b>equity</b> grow with it.</p>`,
  },
  {
    title: 'Protect your gains',
    target: '.manage',
    wait: 'stop:be',
    waitText: 'Press "Stop → breakeven".',
    allow: ['manage'],
    resumeAfter: true,
    body: `<p>Price has moved well in your favor. Moving your stop to <b>breakeven</b> (your entry price) means this trade can no longer lose money.</p>`,
  },
  {
    title: 'Breaking news',
    trigger: { event: 'news-shown' },
    target: '#decision',
    wait: 'news-decided',
    waitText: 'Make your call.',
    allow: ['decide'],
    resumeAfter: true,
    body: `<p>When a headline hits, the game pauses and you have a few seconds to decide. Normally a timer runs; here it waits for you.</p>
      <p>A few bars later, Atlas grades your call on what price actually did. Sometimes the smart move is to stay out.</p>`,
  },
  {
    title: 'Take your profit',
    trigger: { bar: BREAKOUT + 20 },
    target: '.manage',
    wait: 'trade-close',
    waitText: 'Press "Close position" (or X).',
    allow: ['close', 'manage'],
    skipIf: (api) => !api.hasOpenTrade(),
    body: `<p>Nice run. Close the position to lock in the profit.</p>`,
  },
  {
    title: 'Your journal',
    target: '#journal',
    body: `<p>Every trade lands in your journal with its reasons and their ✓/✗ marks. At the end of each round you get a full debrief, and lessons aimed at whatever you did worst.</p>`,
  },
  {
    title: "Now it's your call",
    body: `<p>The training wheels come off. The rest of this chart plays out <b>exactly as it really did</b>, and you decide everything: when to trade, which way, and when to get out.</p>
      <p>You might make money or lose it. Both are part of trading. Use the speed buttons if you like, then press Next.</p>`,
  },
];

export class Tutorial {
  active = false;
  free = false;
  freeStartEquity = 0;
  private i = -1;
  private waiting: Trigger | null = null;
  private coach = document.getElementById('coach')!;
  private spot = document.getElementById('spot')!;

  constructor(private api: TutorialApi) {
    window.addEventListener('resize', () => this.place());
    this.coach.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-coach="next"]')) this.complete();
      if (t.closest('[data-coach="skip"]')) this.api.skip();
    });
  }

  start() {
    this.active = true;
    this.free = false;
    this.go(0);
  }

  stop() {
    this.active = false;
    this.waiting = null;
    this.hide();
  }

  /** Whether an action is allowed right now. */
  allows(action: string) {
    if (!this.active) return true;
    if (this.free) return action !== 'mode' && action !== 'new';
    if (this.waiting) return false;
    return STEPS[this.i]?.allow?.includes(action) ?? false;
  }

  emit(event: string) {
    if (!this.active || this.free) return;
    if (this.waiting && 'event' in this.waiting && this.waiting.event === event) return this.show();
    if (!this.waiting && STEPS[this.i]?.wait === event) this.complete();
  }

  barClosed(rel: number) {
    if (this.active && this.waiting && 'bar' in this.waiting && this.waiting.bar === rel) {
      this.api.pause();
      this.show();
    }
  }

  private go(i: number) {
    STEPS[this.i]?.onHide?.(this.api);
    this.i = i;
    const step = STEPS[i];
    if (!step) return;
    if (step.trigger) {
      this.waiting = step.trigger;
      this.hide();
      this.api.refresh();
    } else this.show();
  }

  private show() {
    this.waiting = null;
    const step = STEPS[this.i];
    if (step.skipIf?.(this.api)) return this.go(this.i + 1);
    step.onShow?.(this.api);
    const last = this.i === STEPS.length - 1;
    this.coach.innerHTML = `
      <div class="count">Tutorial · ${this.i + 1} of ${STEPS.length}</div>
      <h4>${step.title}</h4>
      ${step.body}
      <div class="foot">
        ${step.wait ? `<span class="waiting">${step.waitText ?? ''}</span>` : `<button class="btn primary" data-coach="next">${last ? "Let's trade" : 'Next'}</button>`}
        <button class="skip" data-coach="skip">Skip tutorial</button>
      </div>`;
    this.coach.hidden = false;
    this.coach.classList.toggle('center', !step.target);
    this.api.refresh();
    requestAnimationFrame(() => this.place());
  }

  private complete() {
    const step = STEPS[this.i];
    if (this.i === STEPS.length - 1) {
      step.onHide?.(this.api);
      this.free = true;
      this.freeStartEquity = this.api.equity();
      this.hide();
      this.api.refresh();
      this.api.resume();
      return;
    }
    const next = this.i + 1;
    this.go(next);
    if (step.resumeAfter || STEPS[next]?.trigger) this.api.resume();
  }

  private hide() {
    this.coach.hidden = true;
    this.spot.hidden = true;
  }

  private place() {
    if (this.coach.hidden) return;
    const step = STEPS[this.i];
    const el = step?.target ? document.querySelector<HTMLElement>(step.target) : null;
    const cw = this.coach.offsetWidth;
    const ch = this.coach.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!el || el.offsetParent === null) {
      this.spot.hidden = true;
      this.coach.style.left = `${(vw - cw) / 2}px`;
      this.coach.style.top = `${Math.max(16, (vh - ch) / 2)}px`;
      return;
    }
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(this.spot.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    this.spot.hidden = false;
    // Prefer the side with the most room, then clamp into the viewport.
    let left: number;
    let top: number;
    if (vw - r.right > cw + 24) [left, top] = [r.right + 16, r.top];
    else if (r.left > cw + 24) [left, top] = [r.left - cw - 16, r.top];
    else if (vh - r.bottom > ch + 24) [left, top] = [r.left, r.bottom + 16];
    else [left, top] = [r.left, r.top - ch - 16];
    if (r.height > vh * 0.6 && r.width > vw * 0.4) [left, top] = [r.left + 24, r.top + 24];
    this.coach.style.left = `${Math.min(Math.max(16, left), vw - cw - 16)}px`;
    this.coach.style.top = `${Math.min(Math.max(16, top), vh - ch - 16)}px`;
  }
}

const QUOTES = {
  win: [
    ['The goal of a successful trader is to make the best trades. Money is secondary.', 'Alexander Elder'],
    ['The stock market is a device for transferring money from the impatient to the patient.', 'Warren Buffett'],
    ["It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", 'George Soros'],
  ],
  loss: [
    ["I have not failed. I've just found 10,000 ways that won't work.", 'Thomas Edison'],
    ['Risk comes from not knowing what you’re doing.', 'Warren Buffett'],
    ['In the short run, the market is a voting machine, but in the long run, it is a weighing machine.', 'Benjamin Graham'],
  ],
  flat: [['In the short run, the market is a voting machine, but in the long run, it is a weighing machine.', 'Benjamin Graham']],
};

export function tutorialResult(s: Scenario, freePnl: number, freeTrades: number, money: (x: number) => string) {
  const kind = freeTrades === 0 ? 'flat' : freePnl >= 0 ? 'win' : 'loss';
  const [quote, who] = QUOTES[kind][Math.floor(Math.random() * QUOTES[kind].length)];
  const message = {
    win: `You finished the free part <b class="up">up ${money(freePnl)}</b>. Enjoy it, but remember that one good round can be luck. What makes it repeatable is the reasoning behind every trade, and that's what Atlas grades.`,
    loss: `You finished the free part <b class="down">down ${money(-freePnl)}</b>, and that's okay. It's the market: everyone loses sometimes, including the best traders in the world. What matters is keeping losses small and reasons honest, and that's exactly what we'll train.`,
    flat: `You sat out the free part. Patience is a real skill, but you'll learn fastest by taking reps.`,
  }[kind];
  return `
    <h2 id="debrief-title" style="margin:0">Tutorial complete</h2>
    <div class="reveal">
      <div class="muted">${s.alias.name} (${s.alias.ticker}) was</div>
      <div class="was">${s.symbol}</div>
      <div class="muted">${s.sector} · ${s.startDate} to ${s.endDate}</div>
    </div>
    <p>${message}</p>
    <blockquote class="famous">“${quote}”<cite>— ${who}</cite></blockquote>
    <p>Your next round is your <b>placement round</b>. It sets your starting skill ratings and picks your first lesson. From then on, every lesson comes with an objective you can work on right here in the simulator.</p>
    <div class="modal-actions"><button class="btn primary" data-act="tutorial-finish">Start my first real round</button></div>`;
}
