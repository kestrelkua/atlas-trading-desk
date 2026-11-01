import { LESSONS, type Lesson } from './lessons';
import { SKILLS, type SkillId, type SkillScores } from './skills';
import type { Mode } from './types';

export interface RoundRecord {
  at: string;
  mode: Mode;
  symbol: string;
  ret: number;
  buyHold: number;
  trades: number;
  scores: SkillScores;
}

export interface Profile {
  rounds: RoundRecord[];
  ratings: SkillScores;
  /** Rating of the skill when each lesson was last opened. */
  lessonsSeen: Record<string, number>;
}

const KEY = 'atlas.profile.v1';
const empty = (): Profile => ({
  rounds: [],
  ratings: { trend: null, setup: null, timing: null, risk: null, patience: null },
  lessonsSeen: {},
});

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty(), ...JSON.parse(raw) } : empty();
  } catch {
    return empty();
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

export function resetProfile() {
  saveProfile(empty());
}

export function recordRound(p: Profile, r: RoundRecord) {
  p.rounds.push(r);
  for (const { id } of SKILLS) {
    const s = r.scores[id];
    if (s === null) continue;
    const prev = p.ratings[id];
    p.ratings[id] = prev === null ? s : Math.round(prev * 0.6 + s * 0.4);
  }
  saveProfile(p);
}

/** `rounds` keeps one lucky round from vaulting anyone up the ranks. */
export const LEVELS = [
  { name: 'Apprentice', min: 0, rounds: 0 },
  { name: 'Navigator', min: 40, rounds: 2 },
  { name: 'Cartographer', min: 55, rounds: 4 },
  { name: 'Pathfinder', min: 70, rounds: 7 },
  { name: 'Atlas', min: 85, rounds: 10 },
];

export function composite(p: Profile): number | null {
  const xs = SKILLS.map((s) => p.ratings[s.id]).filter((x): x is number => x !== null);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

export function level(p: Profile) {
  const c = composite(p) ?? 0;
  let i = 0;
  const played = p.rounds.filter((r) => r.trades > 0).length;
  while (i + 1 < LEVELS.length && c >= LEVELS[i + 1].min && played >= LEVELS[i + 1].rounds) i++;
  const next = LEVELS[i + 1];
  return { index: i, name: LEVELS[i].name, score: c, next, progress: next ? (c - LEVELS[i].min) / (next.min - LEVELS[i].min) : 1 };
}

/** Recent 3 rounds against the 3 before them, for one skill. */
export function skillTrend(p: Profile, id: SkillId): number | null {
  const xs = p.rounds.map((r) => r.scores[id]).filter((x): x is number => x !== null);
  if (xs.length < 4) return null;
  const recent = xs.slice(-3);
  const before = xs.slice(-6, -3);
  const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  return Math.round(avg(recent) - avg(before));
}

export interface Recommendation {
  lesson: Lesson;
  reason: string;
}

/**
 * Picks the weakest skill and a lesson tier to match. If the player already saw the
 * advanced lesson and hasn't improved since, it drops back to the foundation.
 */
export function recommend(p: Profile): Recommendation | null {
  const rated = SKILLS.filter((s) => p.ratings[s.id] !== null);
  if (!rated.length) return null;
  const weakest = rated.reduce((a, b) => (p.ratings[b.id]! < p.ratings[a.id]! ? b : a));
  const rating = p.ratings[weakest.id]!;
  const find = (tier: Lesson['tier']) => LESSONS.find((l) => l.skill === weakest.id && l.tier === tier)!;
  let tier: Lesson['tier'] = rating < 55 ? 'foundation' : 'advanced';
  let reason = `${weakest.name} is your weakest skill (${rating}).`;
  const adv = find('advanced');
  if (tier === 'advanced' && adv.id in p.lessonsSeen && rating <= p.lessonsSeen[adv.id]) {
    tier = 'foundation';
    reason += ' It has not improved since your last lesson, so we are going back to the foundation.';
  } else if (tier === 'foundation' && find('foundation').id in p.lessonsSeen && rating > p.lessonsSeen[find('foundation').id] + 8) {
    tier = 'advanced';
    reason += ' You have improved since the foundation lesson, so this one steps it up.';
  }
  return { lesson: find(tier), reason };
}

export function markLessonSeen(p: Profile, lesson: Lesson) {
  p.lessonsSeen[lesson.id] = p.ratings[lesson.skill] ?? 0;
  saveProfile(p);
}
