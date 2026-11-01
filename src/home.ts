/**
 * Home: the calm front door. A greeting, one suggestion, a thought for the day,
 * and three doors. Everything else stays inside the sections.
 */
import { MAP } from './mapdata';

export interface HomeContext {
  fresh: boolean;
  levelName: string | null;
  /** Monday to Sunday of this week: did you play that day? */
  week: boolean[];
  roundsThisWeek: number;
  simInProgress: boolean;
  war: { op: string; day: number } | null;
  focus: { skill: string; challenge: string } | null;
}

const NAME_KEY = 'atlas.name';

/** Short, well-attributed lines; one a day, the same for everyone. */
const THOUGHTS: [string, string][] = [
  ['The stock market is a device for transferring money from the impatient to the patient.', 'Warren Buffett'],
  ['In the short run, the market is a voting machine, but in the long run, it is a weighing machine.', 'Benjamin Graham'],
  ['Risk comes from not knowing what you’re doing.', 'Warren Buffett'],
  ['Bull markets are born on pessimism, grow on skepticism, mature on optimism, and die on euphoria.', 'John Templeton'],
  ['Know what you own, and know why you own it.', 'Peter Lynch'],
  ['Be fearful when others are greedy, and greedy when others are fearful.', 'Warren Buffett'],
  ['The big money is not in the buying and the selling, but in the waiting.', 'Charlie Munger'],
  ['The goal of a successful trader is to make the best trades. Money is secondary.', 'Alexander Elder'],
  ['Investing should be more like watching paint dry or watching grass grow.', 'Paul Samuelson'],
  ['The individual investor should act consistently as an investor and not as a speculator.', 'Benjamin Graham'],
  ['Cut short your losses, and let your profits run on.', 'David Ricardo'],
  ["I have not failed. I've just found 10,000 ways that won't work.", 'Thomas Edison'],
];

function getName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function setName(name: string) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* storage unavailable: the name lasts for this visit only */
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function greeting(now: Date) {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Days since a fixed date, so everyone sees the same thought on the same day. */
const dayNumber = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86_400_000);

/** The single most useful next step. */
function card(c: HomeContext) {
  const make = (go: string, kicker: string, title: string, sub: string) =>
    `<button class="next-card" data-go="${go}"><span class="next-kicker">${kicker}</span><span class="next-title">${title}</span><span class="next-sub">${sub}</span><span class="next-arrow" aria-hidden="true">→</span></button>`;
  if (c.fresh) return make('sim', 'Start here', 'Your first round', 'A guided four minutes on a real chart. No experience needed.');
  if (c.simInProgress) return make('sim', 'Pick up where you left off', 'Your Simulator round', 'The chart is paused right where you left it.');
  if (c.war) return make('war', 'Pick up where you left off', esc(c.war.op), `Day ${c.war.day} of 120. The desk is waiting.`);
  if (c.focus) return make('sim', 'Today’s practice', `One round, focused on ${esc(c.focus.skill)}`, esc(c.focus.challenge));
  return make('sim', 'Today’s practice', 'One Simulator round', 'Finish a round with a trade to get your first skill check.');
}

const DOOR_ART = {
  sim: `<svg viewBox="0 0 48 32" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="9" y1="12" x2="9" y2="28"/><line x1="19" y1="8" x2="19" y2="24"/><line x1="29" y1="11" x2="29" y2="21"/><line x1="39" y1="3" x2="39" y2="19"/></g><rect x="6" y="16" width="6" height="8" rx="1" class="dn"/><rect x="16" y="11" width="6" height="10" rx="1" class="up"/><rect x="26" y="13" width="6" height="5" rx="1" class="dn"/><rect x="36" y="6" width="6" height="11" rx="1" class="up"/></svg>`,
  war: `<svg viewBox="0 0 48 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="24" cy="16" r="13"/><ellipse cx="24" cy="16" rx="6" ry="13"/><line x1="11" y1="16" x2="37" y2="16"/><path d="M13 9.5h22M13 22.5h22" stroke-width="1.1"/><circle cx="31" cy="11" r="2.2" class="pin"/></svg>`,
  lessons: `<svg viewBox="0 0 48 32" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="6" y1="8" x2="42" y2="8" opacity="0.3"/><line x1="6" y1="16" x2="42" y2="16" opacity="0.3"/><line x1="6" y1="24" x2="42" y2="24" opacity="0.3"/></g><g stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="8" x2="30" y2="8" class="bar"/><line x1="6" y1="16" x2="22" y2="16" class="bar"/><line x1="6" y1="24" x2="36" y2="24" class="bar"/></g></svg>`,
};

/** Faint world map behind the page, for the cartographic feel. */
const BACKDROP = `<svg class="home-backdrop" viewBox="0 0 ${MAP.w} ${MAP.h}" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
  <path d="${MAP.graticule}" class="grat"/>
  ${Object.values(MAP.countries).map((d) => `<path d="${d}" class="land"/>`).join('')}
</svg>`;

export function homeView(c: HomeContext, now = new Date()) {
  const name = getName();
  const [quote, who] = THOUGHTS[((dayNumber(now) % THOUGHTS.length) + THOUGHTS.length) % THOUGHTS.length];
  const today = (now.getDay() + 6) % 7;
  const dots = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    .map((d, i) => `<span class="day ${c.week[i] ? 'on' : ''} ${i === today ? 'today' : ''}" title="${c.week[i] ? 'Played' : 'Not yet'}">${d}</span>`)
    .join('');
  const status = c.fresh
    ? 'Welcome to Atlas.'
    : [c.levelName, c.roundsThisWeek ? `${c.roundsThisWeek} round${c.roundsThisWeek === 1 ? '' : 's'} this week` : 'A fresh week'].filter(Boolean).join(' · ');
  return `
    ${BACKDROP}
    <div class="home-inner">
      <img class="home-mark" src="icons/icon.svg" alt="" />
      <h1 class="home-greet">${greeting(now)}${name ? `, <button class="name-btn" data-name="edit" title="Change your name">${esc(name)}</button>` : ''}.</h1>
      <p class="home-status">${status}</p>
      ${name ? '' : '<p class="name-ask"><button class="link-btn" data-name="edit">What should we call you?</button></p>'}
      <form class="name-form" hidden>
        <input name="n" maxlength="24" autocomplete="given-name" placeholder="Your first name" aria-label="Your first name" value="${esc(name)}" />
        <button class="btn small primary" type="submit">Save</button>
      </form>
      ${c.fresh ? '' : `<div class="week" aria-label="Days played this week">${dots}</div>`}
      ${card(c)}
      <nav class="doors" aria-label="Where to">
        <button class="door" data-go="sim">${DOOR_ART.sim}<span class="door-text"><span class="door-title">Simulator</span><span class="door-sub">One stock, one chart. Learn to read it and trade it.</span></span></button>
        <button class="door" data-go="war">${DOOR_ART.war}<span class="door-text"><span class="door-title">War Room</span><span class="door-sub">Zoom out: follow the money when the world shakes.</span></span></button>
        <button class="door" data-go="lessons">${DOOR_ART.lessons}<span class="door-text"><span class="door-title">Lessons &amp; Progress</span><span class="door-sub">Your skills, and what to practice next.</span></span></button>
      </nav>
      <figure class="thought">
        <blockquote>“${esc(quote)}”</blockquote>
        <figcaption>${esc(who)}</figcaption>
      </figure>
    </div>`;
}

/** Name editing lives entirely on Home; `rerender` redraws it after a change. */
export function wireHome(root: HTMLElement, rerender: () => void) {
  root.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-name="edit"]')) return;
    const form = root.querySelector<HTMLFormElement>('.name-form')!;
    form.hidden = false;
    root.querySelector<HTMLElement>('.name-ask')?.setAttribute('hidden', '');
    form.querySelector('input')!.focus();
  });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = (e.target as HTMLFormElement).querySelector('input')!;
    setName(input.value.trim().replace(/\s+/g, ' '));
    rerender();
  });
}
