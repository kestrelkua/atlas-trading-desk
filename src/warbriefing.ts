import { placeCoach } from './tutorial';

interface Step {
  title: string;
  body: string;
  target?: string;
}

const STEPS: Step[] = [
  {
    title: 'When the world shakes, money moves',
    body: `<p>The Simulator trains your eye on one chart. The War Room trains the opposite skill: zooming out.</p>
      <p>In a crisis, money doesn't vanish. It moves from what's threatened to what benefits. Your job is to see where it's going.</p>`,
  },
  {
    title: 'Read the map',
    target: '.map-card',
    body: `<p>Borders light up as tension rises: <b class="t-amber">amber</b> is tense, <b class="t-red">red</b> is conflict, <b class="t-green">green</b> is easing.</p>
      <p>Icons show what each nation supplies (oil, chips, gold), and dashed lines are shipping lanes. When a lane turns red, something can't get through. Hover anything for details.</p>`,
  },
  {
    title: 'Your benchmark is the World Index',
    target: '.race-heat',
    body: `<p>Here you're not measured against zero. You're measured against the whole market.</p>
      <p>Lose 5% while the World Index loses 15%, and you did your job well. The race line shows you against it, and the heatmap shows which markets are winning right now.</p>`,
  },
  {
    title: 'Six markets, one portfolio',
    target: '.basket-table',
    body: `<p><b>+</b> buys, <b>−</b> sells or shorts, <b>×</b> closes. Buy what benefits, short what suffers.</p>
      <p>Click a market's name to see its chart below.</p>`,
  },
  {
    title: 'Playbooks',
    target: '.playbooks',
    body: `<p>The classic crisis trades, one click each. Each one trades several markets at once and teaches a real pattern by name.</p>
      <p>You can always trade markets one at a time instead.</p>`,
  },
  {
    title: 'Dispatches',
    target: '.war-log-card',
    body: `<p>News arrives here and as dots on the map. Big stories pause the clock so you can think. Click any dot or dispatch to reread it.</p>`,
  },
  {
    title: 'Every crisis is real',
    body: `<p>The names are invented, but the prices come from real geopolitical episodes. You'll find out which one when the dust settles.</p>
      <p>Read the situation report, then press Begin.</p>`,
  },
];

/** The War Room's first-visit briefing, using the same coach card as the main tutorial. */
export class WarBriefing {
  private i = 0;
  private coach = document.getElementById('coach')!;
  private spot = document.getElementById('spot')!;
  private onDone: () => void = () => {};
  active = false;

  constructor() {
    window.addEventListener('resize', () => this.place());
    this.coach.addEventListener('click', (e) => {
      if (!this.active) return;
      const t = e.target as HTMLElement;
      if (t.closest('[data-brief="next"]')) this.go(this.i + 1);
      if (t.closest('[data-brief="back"]')) this.go(this.i - 1);
      if (t.closest('[data-brief="skip"]')) this.finish();
    });
  }

  start(onDone: () => void) {
    this.onDone = onDone;
    this.active = true;
    this.go(0);
  }

  private go(i: number) {
    if (i >= STEPS.length) return this.finish();
    this.i = Math.max(0, i);
    const step = STEPS[this.i];
    const last = this.i === STEPS.length - 1;
    this.coach.innerHTML = `
      <div class="count">War Room briefing · ${this.i + 1} of ${STEPS.length}</div>
      <h4>${step.title}</h4>
      ${step.body}
      <div class="foot">
        ${this.i ? '<button class="btn ghost small" data-brief="back">Back</button>' : ''}
        <button class="btn primary" data-brief="next">${last ? 'Read the report' : 'Next'}</button>
        <button class="skip" data-brief="skip">Skip briefing</button>
      </div>`;
    this.coach.hidden = false;
    this.coach.classList.toggle('center', !step.target);
    requestAnimationFrame(() => this.place());
  }

  private place() {
    if (!this.active) return;
    const step = STEPS[this.i];
    placeCoach(this.coach, this.spot, step.target ? document.querySelector<HTMLElement>(step.target) : null);
  }

  private finish() {
    this.active = false;
    this.coach.hidden = true;
    this.spot.hidden = true;
    this.onDone();
  }
}
