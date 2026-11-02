/**
 * Home: the calm front door. A greeting, one line that knows you, one
 * suggestion, three doors, and a thought for the day. Everything else stays
 * inside the sections.
 */
import { geoCircle, geoNaturalEarth1, geoPath } from 'd3-geo';
import { MAP } from './mapdata';

export interface Resume {
  label: string;
  day: number;
  at: number;
}

export interface HomeContext {
  fresh: boolean;
  /** The one line under the greeting: the most worth saying right now (already escaped). */
  line: string;
  /** Monday to Sunday of this week: did you play that day? */
  week: boolean[];
  sim: Resume | null;
  war: Resume | null;
  focus: { skill: string; challenge: string } | null;
  weather: string | null;
  /** Sectors for the little pulse bubble, plus the last trading day they cover. */
  pulse: { sectors: SectorPulse[]; asOf: string } | null;
  /** The latest Game of the Day, once its file has loaded. */
  daily: { label: string; played: boolean } | null;
}

export interface SectorPulse {
  name: string;
  /** Change over the last 5 trading days, in %. */
  week: number;
  /** About a month of closes, for the sparkline. */
  spark: number[];
}

const NAME_KEY = 'atlas.name';
const WELCOME_KEY = 'atlas.welcome';
const SKIP_KEY = 'atlas.home.skip';

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

const read = <T>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: it lasts for this visit only */
  }
};

/** Stored as plain text (not JSON), as the first version of Home did. */
export function getName(): string {
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
  } catch {}
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The best moment of a session, said once when you come back Home. */
export function setWelcome(text: string) {
  write(WELCOME_KEY, { text, at: Date.now() });
}

/** A welcome-back line from the last 12 hours, if there is one. */
export function getWelcome(): string | null {
  const w = read<{ text: string; at: number } | null>(WELCOME_KEY, null);
  return w && Date.now() - w.at < 12 * 3_600_000 ? w.text : null;
}

export function clearWelcome() {
  write(WELCOME_KEY, null);
}

const today = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export type Period = 'morning' | 'day' | 'evening' | 'night';
export function periodOf(now: Date): Period {
  const h = now.getHours();
  return h < 5 || h >= 22 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'day' : 'evening';
}

function greeting(now: Date) {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** Days since a fixed date, so everyone sees the same thought on the same day. */
const dayNumber = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86_400_000);

interface Option {
  go: 'sim' | 'war';
  mode?: 'daily' | 'intraday';
  kicker: string;
  title: string;
  sub: string;
}

/**
 * Suggestions, best first. Continuing comes before anything new; after that the
 * clock decides: a quick round late at night, a crisis at the weekend, a focused
 * round otherwise.
 */
function options(c: HomeContext, now: Date): Option[] {
  if (c.fresh) return [{ go: 'sim', kicker: 'Start here', title: 'Your first round', sub: 'A guided four minutes on a real chart. No experience needed.' }];
  const out: Option[] = [];
  const resumes = [c.sim && { ...c.sim, go: 'sim' as const }, c.war && { ...c.war, go: 'war' as const }].filter(Boolean).sort((a, b) => b!.at - a!.at);
  for (const r of resumes) {
    out.push({
      go: r!.go,
      kicker: 'Pick up where you left off',
      title: esc(r!.label),
      sub: r!.go === 'sim' ? `Day ${r!.day}, paused right where you left it.` : `Day ${r!.day} of 120. The desk is waiting.`,
    });
  }
  const focus: Option = c.focus
    ? { go: 'sim', kicker: 'Today’s practice', title: `One round, focused on ${esc(c.focus.skill)}`, sub: esc(c.focus.challenge) }
    : { go: 'sim', kicker: 'Today’s practice', title: 'One Simulator round', sub: 'Finish a round with a trade to get your first skill check.' };
  const quick: Option = { go: 'sim', mode: 'intraday', kicker: 'Got five minutes?', title: 'One quick round', sub: 'Five days of five-minute bars. Short, and still real.' };
  const crisis: Option = { go: 'war', kicker: 'Settle in', title: 'A War Room crisis', sub: 'Zoom out and follow the money while the world shakes.' };
  const day = now.getDay();
  const p = periodOf(now);
  if (p === 'night') out.push(quick, focus, crisis);
  else if (day === 0 || day === 6) out.push(crisis, focus, quick);
  else out.push(focus, quick, crisis);
  return out;
}

function card(c: HomeContext, now: Date) {
  const list = options(c, now);
  const skip = read<{ day: string; n: number }>(SKIP_KEY, { day: '', n: 0 });
  const n = skip.day === today(now) ? skip.n % list.length : 0;
  const o = list[n];
  return `<button class="next-card" data-go="${o.go}"${o.mode ? ` data-sim-mode="${o.mode}"` : ''}>
      <span class="next-kicker">${o.kicker}</span><span class="next-title">${o.title}</span><span class="next-sub">${o.sub}</span><span class="next-arrow" aria-hidden="true">→</span>
    </button>
    ${list.length > 1 ? '<button class="link-btn not-today" data-home="skip">Not today</button>' : ''}`;
}

const DOOR_ART = {
  sim: `<svg viewBox="0 0 48 32" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="9" y1="12" x2="9" y2="28"/><line x1="19" y1="8" x2="19" y2="24"/><line x1="29" y1="11" x2="29" y2="21"/><line x1="39" y1="3" x2="39" y2="19"/></g><rect x="6" y="16" width="6" height="8" rx="1" class="dn"/><rect x="16" y="11" width="6" height="10" rx="1" class="up"/><rect x="26" y="13" width="6" height="5" rx="1" class="dn"/><rect x="36" y="6" width="6" height="11" rx="1" class="up"/></svg>`,
  war: `<svg viewBox="0 0 48 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="24" cy="16" r="13"/><ellipse cx="24" cy="16" rx="6" ry="13"/><line x1="11" y1="16" x2="37" y2="16"/><path d="M13 9.5h22M13 22.5h22" stroke-width="1.1"/><circle cx="31" cy="11" r="2.2" class="pin"/></svg>`,
  daily: `<svg viewBox="0 0 48 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="10" y="4" width="28" height="25" rx="3"/><line x1="10" y1="11" x2="38" y2="11"/><line x1="17" y1="2" x2="17" y2="7" stroke-linecap="round"/><line x1="31" y1="2" x2="31" y2="7" stroke-linecap="round"/><line x1="24" y1="14" x2="24" y2="26" stroke-linecap="round"/><rect x="21" y="16.5" width="6" height="7" rx="1" class="up" stroke="none"/></svg>`,
  lessons: `<svg viewBox="0 0 48 32" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="6" y1="8" x2="42" y2="8" opacity="0.3"/><line x1="6" y1="16" x2="42" y2="16" opacity="0.3"/><line x1="6" y1="24" x2="42" y2="24" opacity="0.3"/></g><g stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="8" x2="30" y2="8" class="bar"/><line x1="6" y1="16" x2="22" y2="16" class="bar"/><line x1="6" y1="24" x2="36" y2="24" class="bar"/></g></svg>`,
};

const projection = geoNaturalEarth1()
  .scale(MAP.proj.scale)
  .translate(MAP.proj.translate as [number, number]);
const toPath = geoPath(projection);

/** Where the sun is overhead right now (a simple model, accurate to a degree or so). */
function subsolar(now: Date): [number, number] {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const dayOfYear = (now.getTime() - start) / 86_400_000;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  return [-15 * (utcHours - 12), declination];
}

/** The faint world map, with the night side of the planet softly shaded as it is right now. */
function backdrop(now: Date) {
  const [lon, lat] = subsolar(now);
  const anti: [number, number] = [lon > 0 ? lon - 180 : lon + 180, -lat];
  const night = toPath(geoCircle().center(anti).radius(90)());
  const deep = toPath(geoCircle().center(anti).radius(78)());
  return `<svg class="home-backdrop" viewBox="0 0 ${MAP.w} ${MAP.h}" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
    <path d="${MAP.graticule}" class="grat"/>
    <path d="${night}" class="night"/>
    <path d="${deep}" class="night"/>
    ${Object.values(MAP.countries).map((d) => `<path d="${d}" class="land"/>`).join('')}
  </svg>`;
}

export function homeView(c: HomeContext, now = new Date()) {
  const name = getName();
  const [quote, who] = THOUGHTS[((dayNumber(now) % THOUGHTS.length) + THOUGHTS.length) % THOUGHTS.length];
  const todayIdx = (now.getDay() + 6) % 7;
  const dots = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
    .map((d, i) => `<span class="day ${c.week[i] ? 'on' : ''} ${i === todayIdx ? 'today' : ''}" title="${c.week[i] ? 'Played' : 'Not yet'}">${d}</span>`)
    .join('');
  return `
    ${backdrop(now)}
    <div class="home-inner">
      <img class="home-mark" src="icons/icon.svg" alt="" />
      <h1 class="home-greet">${greeting(now)}${name ? `, <button class="name-btn" data-name="edit" title="Change your name">${esc(name)}</button>` : ''}.</h1>
      <p class="home-line">${c.line}</p>
      ${name ? '' : '<p class="name-ask"><button class="link-btn" data-name="edit">What should we call you?</button></p>'}
      <form class="name-form" hidden>
        <input name="n" maxlength="24" autocomplete="given-name" placeholder="Your first name" aria-label="Your first name" value="${esc(name)}" />
        <button class="btn small primary" type="submit">Save</button>
      </form>
      ${c.fresh ? '' : `<div class="week" aria-label="Days played this week">${dots}</div>`}
      ${card(c, now)}
      <nav class="doors" aria-label="Where to">
        <button class="door" data-go="sim">${DOOR_ART.sim}<span class="door-text"><span class="door-title">Simulator</span><span class="door-sub">One stock, one chart. Learn to read it and trade it.</span></span></button>
        <button class="door" data-go="war">${DOOR_ART.war}<span class="door-text"><span class="door-title">War Room</span><span class="door-sub">Zoom out: follow the money when the world shakes.</span></span></button>
        <button class="door" data-go="daily">${DOOR_ART.daily}<span class="door-text"><span class="door-title">Game of the Day</span><span class="door-sub">${
          c.daily ? (c.daily.played ? `✓ Played ${esc(c.daily.label)}. A new stock after the next close.` : `${esc(c.daily.label)} · one real stock, under five minutes.`) : 'One real stock a day, under five minutes.'
        }</span></span></button>
        <button class="door" data-go="lessons">${DOOR_ART.lessons}<span class="door-text"><span class="door-title">Lessons &amp; Progress</span><span class="door-sub">Your skills, your passport, and what to practice next.</span></span></button>
      </nav>
      ${c.pulse ? pulseHtml(c.pulse) : ''}
      ${c.weather ? `<p class="weather"><span class="weather-lbl">Market weather</span> ${c.weather}</p>` : ''}
      <figure class="thought">
        <blockquote>“${esc(quote)}”</blockquote>
        <figcaption>${esc(who)}</figcaption>
      </figure>
    </div>`;
}

// ---------- Sector pulse: one sector at a time, quietly taking turns ----------

let pulseAt = -1;

function spark(v: number[]) {
  const w = 54, h = 16;
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(h - 1 - ((x - lo) / span) * (h - 2)).toFixed(1)}`).join(' ');
  return `<svg class="pulse-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" /></svg>`;
}

function pulseInner(x: SectorPulse, asOf: string) {
  const dir = x.week >= 0.15 ? 'up' : x.week <= -0.15 ? 'down' : 'flat';
  const chg = `${x.week >= 0 ? '+' : '−'}${Math.abs(x.week).toFixed(1)}%`;
  return `<span class="pulse-name">${esc(x.name)}</span>${spark(x.spark)}<span class="pulse-chg ${dir}">${chg}</span><span class="pulse-when">week to ${esc(asOf)}</span>`;
}

function pulseHtml(p: { sectors: SectorPulse[]; asOf: string }) {
  // A random sector each visit, then they take turns.
  if (pulseAt < 0 || pulseAt >= p.sectors.length) pulseAt = Math.floor(Math.random() * p.sectors.length);
  const x = p.sectors[pulseAt];
  return `<button class="pulse" data-home="pulse" title="Tap for another sector" aria-live="polite">${pulseInner(x, p.asOf)}</button>`;
}

let pulseData: { sectors: SectorPulse[]; asOf: string } | null = null;
let pulseTimer = 0;

/** Swaps the bubble to the next sector with a short fade. */
function nextPulse(root: HTMLElement) {
  const el = root.querySelector<HTMLElement>('.pulse');
  if (!el || !pulseData) return;
  pulseAt = (pulseAt + 1) % pulseData.sectors.length;
  const x = pulseData.sectors[pulseAt];
  el.classList.add('fading');
  setTimeout(() => {
    el.innerHTML = pulseInner(x, pulseData!.asOf);
    el.classList.remove('fading');
  }, 260);
}

/** Starts (or restarts) the slow rotation. It rests while you hover, while Home is hidden, and for reduced motion. */
export function startPulse(root: HTMLElement, data: { sectors: SectorPulse[]; asOf: string } | null) {
  pulseData = data;
  clearInterval(pulseTimer);
  if (!data || data.sectors.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  pulseTimer = window.setInterval(() => {
    const el = root.querySelector('.pulse');
    if (root.hidden || document.hidden || !el || el.matches(':hover, :focus-visible')) return;
    nextPulse(root);
  }, 9000);
}

/** Name editing and "Not today" live entirely on Home; `rerender` redraws it after a change. */
export function wireHome(root: HTMLElement, rerender: () => void) {
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-home="pulse"]')) {
      nextPulse(root);
      return;
    }
    if (t.closest('[data-home="skip"]')) {
      const s = read<{ day: string; n: number }>(SKIP_KEY, { day: '', n: 0 });
      write(SKIP_KEY, { day: today(), n: s.day === today() ? s.n + 1 : 1 });
      return rerender();
    }
    if (!t.closest('[data-name="edit"]')) return;
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

/** Your note from last time, shown on the first Home visit of one day only, so it never nags. */
export function noteToShow(latest: { at: string; note: string } | null): string | null {
  if (!latest) return null;
  const shown = read<{ at: string; day: string } | null>('atlas.note.shown', null);
  if (shown && shown.at === latest.at && shown.day !== today()) return null;
  write('atlas.note.shown', { at: latest.at, day: today() });
  return latest.note;
}
