/**
 * The passport: progress as travel. Stamps are worked out from what you've
 * already done; the only thing stored is the day each one first appeared.
 */
import { LESSONS } from './lessons';
import { LEVELS, level, type Profile } from './profile';
import { WAR_LESSONS, type WarProfile } from './warlearn';

export interface Stamp {
  id: string;
  title: string;
  sub: string;
  kind: 'start' | 'rank' | 'crisis' | 'lesson' | 'war-lesson';
  earned: boolean;
  /** When it first appeared, as a short date. */
  date?: string;
}

const KEY = 'atlas.stamps.v1';
/** Crisis titles, matched against finished War Room rounds. */
const CRISES = ['The Eastern Border Crisis', 'The Tariff Escalation', 'The Pacific Trade Dispute', 'The Gulf Shipping Crisis'];

interface Stored {
  dates: Record<string, string>;
  /** Stamps already announced on Home. */
  shown: string[];
}

function load(): Stored {
  try {
    return { dates: {}, shown: [], ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { dates: {}, shown: [] };
  }
}

function store(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

function all(p: Profile, w: WarProfile): Omit<Stamp, 'date'>[] {
  const rank = level(p).index;
  const crises = new Set(w.rounds.map((r) => r.crisis));
  const passed = (id: string, o: Record<string, { passes: number }>) => (o[id]?.passes ?? 0) > 0;
  return [
    { id: 'tutorial', title: 'First steps', sub: 'Finished the tutorial', kind: 'start', earned: p.tutorialDone },
    { id: 'first-round', title: 'First voyage', sub: 'Played a full round', kind: 'start', earned: p.rounds.length > 0 },
    { id: 'first-crisis', title: 'Into the War Room', sub: 'Saw a crisis through', kind: 'start', earned: w.rounds.length > 0 },
    ...LEVELS.slice(1).map((l, i) => ({ id: `rank-${l.name}`, title: l.name, sub: 'Rank reached', kind: 'rank' as const, earned: rank >= i + 1 })),
    ...CRISES.map((c) => ({ id: `crisis-${c}`, title: c.replace(/^The /, ''), sub: 'Crisis completed', kind: 'crisis' as const, earned: crises.has(c) })),
    ...LESSONS.map((l) => ({ id: `lesson-${l.id}`, title: l.title, sub: 'Lesson objective met', kind: 'lesson' as const, earned: passed(l.id, p.objectives) })),
    ...WAR_LESSONS.map((l) => ({ id: `war-${l.id}`, title: l.title, sub: 'War Room objective met', kind: 'war-lesson' as const, earned: passed(l.id, w.objectives) })),
  ];
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Every stamp, earned or not, dating any that are new. */
export function stamps(p: Profile, w: WarProfile): Stamp[] {
  const s = load();
  let changed = false;
  const list = all(p, w).map((x) => {
    if (x.earned && !s.dates[x.id]) {
      s.dates[x.id] = shortDate(new Date());
      changed = true;
    }
    return { ...x, date: s.dates[x.id] };
  });
  if (changed) store(s);
  return list;
}

/** The newest stamp Home hasn't announced yet; announcing it marks it shown. */
export function takeNewStamp(p: Profile, w: WarProfile): Stamp | null {
  const list = stamps(p, w).filter((x) => x.earned);
  const s = load();
  const fresh = list.find((x) => !s.shown.includes(x.id));
  if (!fresh) return null;
  // Everything earned so far counts as announced, so a backlog doesn't drip out one a day.
  s.shown = list.map((x) => x.id);
  store(s);
  return fresh;
}

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function stampHtml(x: Stamp, tilt = 0) {
  return `<div class="stamp ${x.kind} ${x.earned ? 'earned' : 'blank'}" style="--tilt:${tilt}deg" title="${esc(x.earned ? `${x.title}: ${x.sub}` : `Not yet: ${x.sub.toLowerCase()}`)}">
    <span class="stamp-title">${esc(x.title)}</span>
    <span class="stamp-sub">${esc(x.sub)}</span>
    ${x.earned && x.date ? `<span class="stamp-date">${esc(x.date)}</span>` : ''}
  </div>`;
}

export function passportView(p: Profile, w: WarProfile) {
  const list = stamps(p, w);
  const earned = list.filter((x) => x.earned).length;
  // A stable little tilt per stamp, so the page looks hand-stamped but never reshuffles.
  const tilt = (id: string) => ((([...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 9) - 4) * 1.2);
  return `
    <section class="card full passport">
      <h3>Passport</h3>
      <p class="muted">${earned} of ${list.length} stamps. Every crisis you finish and every lesson objective you meet adds one.</p>
      <div class="stamps">${list.map((x) => stampHtml(x, tilt(x.id))).join('')}</div>
    </section>`;
}
