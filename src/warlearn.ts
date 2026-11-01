/**
 * What the War Room teaches: thesis tags checked against the data, desk calls,
 * five big-picture skills, a lesson for each, and the progress that ties them together.
 * Kept apart from the Simulator's profile so the two can evolve separately.
 */

// ---------- Theses ----------

export type ThesisId = 'safe' | 'supply' | 'hedge' | 'relief' | 'fade' | 'rotation' | 'gut';

/** What happened over the following days, from the trade's point of view (dir-adjusted, in %). */
export interface Forward {
  /** The traded market vs the World Index (for the World Index itself, its own move). */
  rel: number;
  world: number;
  /** Energy minus Airlines: the supply-shock spread. */
  spread: number;
  /** The traded market's move vs the World Index over the 3 days before the trade. */
  prior: number;
}

export const THESES: { id: ThesisId; name: string; blurb: string; check?: (f: Forward) => [boolean, string] }[] = [
  {
    id: 'safe', name: 'Safe haven', blurb: 'Fear is rising; this will hold up better than the market.',
    check: (f) => (f.world < 0 && f.rel > 0 ? [true, 'The World Index fell and your position beat it.'] : f.world >= 0 ? [false, 'The fear faded: the World Index rose instead.'] : [false, 'The market fell, but so did your "safe" position, by more.']),
  },
  {
    id: 'supply', name: 'Supply shock', blurb: "Something can't get through; producers win, consumers lose.",
    check: (f) => (f.spread > 0 && f.rel > 0 ? [true, 'Energy beat Airlines and your side of the trade won.'] : f.spread <= 0 ? [false, 'The squeeze never came: Energy lagged Airlines.'] : [false, 'Energy beat Airlines, but your position still lagged.']),
  },
  {
    id: 'hedge', name: 'Escalation hedge', blurb: 'Insurance in case things get worse.',
    check: (f) => (f.rel > 0 ? [true, 'The insurance paid: it beat the World Index.'] : [false, 'Things calmed down, so the insurance cost you. Hedges are allowed to lose.']),
  },
  {
    id: 'relief', name: 'Relief rally', blurb: 'The worst is priced in; buyers are coming back.',
    check: (f) => (f.world > 0 && f.rel > 0 ? [true, 'The relief rally arrived and you were on board.'] : f.world <= 0 ? [false, 'Too early: the World Index kept falling.'] : [false, 'The market rallied, but your position missed it.']),
  },
  {
    id: 'fade', name: 'Fade the move', blurb: 'The last move overshot; it will snap back.',
    check: (f) => (f.prior >= 0 ? [false, 'Not really a fade: you traded with the recent move, not against it.'] : f.rel > 0 ? [true, 'The overreaction snapped back.'] : [false, 'The move kept going. Sometimes it is not an overreaction.']),
  },
  {
    id: 'rotation', name: 'Rotation', blurb: 'Money is moving into (or out of) this market.',
    check: (f) => (f.rel > 0 ? [true, 'Money kept rotating your way.'] : [false, 'The rotation went the other way.']),
  },
  { id: 'gut', name: 'No reason', blurb: "Just a feeling. Fine, but it can't be checked." },
];

export const thesisName = (id: ThesisId) => THESES.find((t) => t.id === id)!.name;

// ---------- Desk calls ----------

export type CallGrade = 'good' | 'okay' | 'poor';
export const CALL_POINTS: Record<CallGrade, number> = { good: 100, okay: 65, poor: 25 };

/**
 * Grades a desk call against what each option would have made (in %, over the
 * next few days). Holding is a real choice: it's right when nothing paid much.
 */
export function gradeCall(choice: string, outcomes: Record<string, number>): CallGrade {
  const best = Math.max(...Object.values(outcomes));
  const mine = outcomes[choice === 'none' ? 'hold' : choice] ?? 0;
  if (choice === 'none') return best < 1.5 ? 'okay' : 'poor';
  if (mine >= best - 0.75) return 'good';
  if (mine > 0 || (choice === 'hold' && best < 1.5)) return 'okay';
  return 'poor';
}

// ---------- Skills ----------

export type WarSkillId = 'bigpicture' | 'rotation' | 'hedging' | 'dispatch' | 'discipline';
export type WarScores = Record<WarSkillId, number | null>;

export const WAR_SKILLS: { id: WarSkillId; name: string; blurb: string }[] = [
  { id: 'bigpicture', name: 'Big Picture', blurb: 'Your return against the World Index.' },
  { id: 'rotation', name: 'Rotation', blurb: 'How much of your money sat on the winning side, day by day.' },
  { id: 'hedging', name: 'Hedging', blurb: "Your worst drop against the World Index's worst drop, while actually invested." },
  { id: 'dispatch', name: 'Dispatch Judgment', blurb: 'Desk calls, graded on what happened next.' },
  { id: 'discipline', name: 'Discipline', blurb: 'Not over-trading, and not selling in a panic at the bottom.' },
];

export interface WarFacts {
  ret: number;
  world: number;
  trades: number;
  /** Your worst peak-to-trough drop, and the World Index's, as fractions. */
  ddYou: number;
  ddWorld: number;
  /** Average gross exposure as a fraction of equity. */
  avgGross: number;
  /** Share of exposure on the winning side, day by day (null if you were never invested). */
  hit: number | null;
  callPoints: number[];
  goodCalls: number;
  panicSells: number;
  thesesRight: number;
  thesesChecked: number;
}

const clamp = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

export function scoreWar(f: WarFacts): WarScores {
  const active = f.trades > 0;
  return {
    bigpicture: active ? clamp(50 + 4 * (f.ret - f.world)) : null,
    rotation: f.hit === null ? null : clamp(50 + (f.hit - 0.5) * 200),
    hedging: f.avgGross < 0.25 || f.ddWorld < 0.01 ? null : clamp(50 + 50 * (1 - f.ddYou / f.ddWorld)),
    dispatch: f.callPoints.length ? clamp(f.callPoints.reduce((a, b) => a + b, 0) / f.callPoints.length) : null,
    discipline: active ? clamp(85 - 15 * f.panicSells - Math.max(0, f.trades - 40)) : null,
  };
}

// ---------- Lessons ----------

export interface WarLesson {
  id: string;
  skill: WarSkillId;
  title: string;
  body: string[];
  objective: { text: string; check: (f: WarFacts) => boolean };
}

export const WAR_LESSONS: WarLesson[] = [
  {
    id: 'war-index', skill: 'bigpicture', title: 'Beat the index, not zero',
    body: [
      'In a crisis almost everything falls. If you judge yourself against zero, you will feel like a failure even when you did well, and like a genius when you just got lucky.',
      'Professionals judge themselves against a benchmark. Losing 5% while the World Index loses 15% is ten points of real skill. Making 2% while it makes 12% is ten points of missed opportunity.',
    ],
    objective: { text: 'Finish ahead of the World Index.', check: (f) => f.trades > 0 && f.ret > f.world },
  },
  {
    id: 'war-supply', skill: 'rotation', title: 'Supply shocks pick winners and losers',
    body: [
      "The same headline lifts one market and sinks another. When oil can't get out, oil producers earn more per barrel while airlines pay more for every flight.",
      'Rotation means following the money as it moves: out of what is threatened, into what benefits. You do not need to predict the news, only to think one step past it: who pays, and who gets paid?',
    ],
    objective: { text: 'Keep at least 60% of your exposure on the winning side.', check: (f) => f.hit !== null && f.hit >= 0.6 },
  },
  {
    id: 'war-correlation', skill: 'hedging', title: 'Correlations go to 1 in a panic',
    body: [
      'On the worst days nearly everything falls together. Owning six different markets helps far less than you would think on day one of a crisis.',
      'Safe havens can fail too: in 2022 stocks, bonds and even gold all fell at times. A real hedge is something that rises when your other positions fall, like a short, not just something different.',
    ],
    objective: { text: "Stay at least 30% invested and keep your worst drop smaller than the World Index's.", check: (f) => f.avgGross >= 0.3 && f.ddYou < f.ddWorld },
  },
  {
    id: 'war-relief', skill: 'dispatch', title: 'Relief rallies are violent',
    body: [
      'Fear builds slowly and leaves all at once. When peace talks or a pause are announced, the most beaten-down markets often jump the most in a single day, and anyone short gets squeezed.',
      'A good desk call weighs both paths: what if it gets worse, and what if it gets better? Sometimes the best call is to hold and let the story develop.',
    ],
    objective: { text: 'Make at least 3 desk calls, with 2 graded good.', check: (f) => f.callPoints.length >= 3 && f.goodCalls >= 2 },
  },
  {
    id: 'war-rumor', skill: 'discipline', title: 'Fear peaks before the facts',
    body: [
      'Buy the rumor, sell the news. Markets often bottom near the moment the fighting actually starts: 1991, 2003 and 2022 all saw rallies right as the conflict began. The uncertainty was worse than the news.',
      'Selling everything after the first big drop feels safe, but it usually locks in the loss right before the rebound. Have a plan before the scary headline, not after it.',
    ],
    objective: { text: 'No panic sells at the lows, and fewer than 30 trades.', check: (f) => f.trades > 0 && f.panicSells === 0 && f.trades < 30 },
  },
];

// ---------- Progress ----------

export interface WarRound {
  at: string;
  crisis: string;
  ret: number;
  world: number;
  trades: number;
  scores: WarScores;
  note?: string;
}

export interface WarProfile {
  rounds: WarRound[];
  ratings: WarScores;
  objectives: Record<string, { attempts: number; passes: number }>;
}

const KEY = 'atlas.war.v1';
const emptyScores = (): WarScores => ({ bigpicture: null, rotation: null, hedging: null, dispatch: null, discipline: null });
const empty = (): WarProfile => ({ rounds: [], ratings: emptyScores(), objectives: {} });

export function loadWarProfile(): WarProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved ? { ...empty(), ...saved, ratings: { ...emptyScores(), ...saved.ratings } } : empty();
  } catch {
    return empty();
  }
}

export function saveWarProfile(p: WarProfile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this visit only */
  }
}

export function resetWarProfile() {
  saveWarProfile(empty());
}

export function recordWarRound(p: WarProfile, r: WarRound, objective: { id: string; passed: boolean } | null) {
  p.rounds.push(r);
  for (const { id } of WAR_SKILLS) {
    const s = r.scores[id];
    if (s === null) continue;
    const prev = p.ratings[id];
    p.ratings[id] = prev === null ? s : Math.round(prev * 0.6 + s * 0.4);
  }
  if (objective) {
    const o = (p.objectives[objective.id] ??= { attempts: 0, passes: 0 });
    o.attempts++;
    if (objective.passed) o.passes++;
  }
  saveWarProfile(p);
}

/** The lesson for your weakest War Room skill, skipping ones whose objective you've passed twice. */
export function recommendWar(p: WarProfile): WarLesson | null {
  const rated = WAR_SKILLS.filter((s) => p.ratings[s.id] !== null).sort((a, b) => p.ratings[a.id]! - p.ratings[b.id]!);
  if (!rated.length) return null;
  const lessonFor = (id: WarSkillId) => WAR_LESSONS.find((l) => l.skill === id)!;
  const open = rated.filter((s) => (p.objectives[lessonFor(s.id).id]?.passes ?? 0) < 2);
  return lessonFor((open.length ? open : rated)[0].id);
}
