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
  /** How often each lesson's objective was attempted and passed in a round. */
  objectives: Record<string, { attempts: number; passes: number }>;
  tutorialDone: boolean;
}

const KEY = 'atlas.profile.v1';
const empty = (): Profile => ({
  rounds: [],
  ratings: { trend: null, setup: null, timing: null, risk: null, patience: null, news: null },
  lessonsSeen: {},
  objectives: {},
  tutorialDone: false,
});

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const saved = JSON.parse(raw);
    const base = empty();
    // Older saves predate some skills; fill them in as unrated.
    return { ...base, ...saved, ratings: { ...base.ratings, ...saved.ratings } };
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

export function resetProfile(keepTutorial: boolean) {
  saveProfile({ ...empty(), tutorialDone: keepTutorial });
}

export function recordObjective(p: Profile, lessonId: string, passed: boolean) {
  const o = (p.objectives[lessonId] ??= { attempts: 0, passes: 0 });
  o.attempts++;
  if (passed) o.passes++;
  saveProfile(p);
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

const passes = (p: Profile, id: string) => p.objectives[id]?.passes ?? 0;

/**
 * Picks the weakest skill and a lesson tier to match, reacting to progress:
 * passing a lesson's objective twice moves you up a tier (and past the advanced
 * one, on to the next weakest skill), while a skill that hasn't improved since
 * its advanced lesson drops back to the foundation.
 */
export function recommend(p: Profile): Recommendation | null {
  const rated = SKILLS.filter((s) => p.ratings[s.id] !== null).sort((a, b) => p.ratings[a.id]! - p.ratings[b.id]!);
  if (!rated.length) return null;
  const find = (id: SkillId, tier: Lesson['tier']) => LESSONS.find((l) => l.skill === id && l.tier === tier)!;
  const open = rated.filter((s) => passes(p, find(s.id, 'advanced').id) < 2);
  const skill = (open.length ? open : rated)[0];
  const rating = p.ratings[skill.id]!;
  const found = find(skill.id, 'foundation');
  const adv = find(skill.id, 'advanced');
  let tier: Lesson['tier'] = rating < 55 ? 'foundation' : 'advanced';
  let reason = `${skill.name} is your weakest skill (${rating}).`;
  if (skill !== rated[0]) reason = `You've mastered ${rated[0].name} lessons, so next up is ${skill.name} (${rating}).`;
  if (tier === 'foundation' && passes(p, found.id) >= 2) {
    tier = 'advanced';
    reason += ' You passed the foundation objective twice, so this one steps it up.';
  } else if (tier === 'foundation' && found.id in p.lessonsSeen && rating > p.lessonsSeen[found.id] + 8) {
    tier = 'advanced';
    reason += ' You have improved since the foundation lesson, so this one steps it up.';
  } else if (tier === 'advanced' && adv.id in p.lessonsSeen && rating <= p.lessonsSeen[adv.id] && passes(p, adv.id) === 0) {
    tier = 'foundation';
    reason += ' It has not improved since your last lesson, so we are going back to the foundation.';
  }
  return { lesson: tier === 'foundation' ? found : adv, reason };
}

export function markLessonSeen(p: Profile, lesson: Lesson) {
  p.lessonsSeen[lesson.id] = p.ratings[lesson.skill] ?? 0;
  saveProfile(p);
}
