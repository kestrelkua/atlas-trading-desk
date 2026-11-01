import type { NewsItem } from './events';

export type Choice = 'long' | 'short' | 'out' | 'hold' | 'close';

/** One decision the player made when a headline hit, graded once price has had time to react. */
export interface NewsCall {
  idx: number;
  kind: NewsItem['kind'];
  headline: string;
  choice: Choice;
  timedOut: boolean;
  price: number;
  atr: number;
  /** Direction of the position held when the headline hit (0 = flat). */
  posDir: 1 | -1 | 0;
  resolveAt: number;
  fwd?: number;
  grade?: 'good' | 'ok' | 'bad';
}

export const REACTION_BARS = { daily: 5, intraday: 6 };

export const CHOICE_LABEL: Record<Choice, string> = {
  long: 'Went long',
  short: 'Went short',
  out: 'Stayed out',
  hold: 'Held',
  close: 'Closed',
};

/** Grades a call on what price did next, measured in ATRs from the decision price. */
export function gradeCall(c: NewsCall, price: number) {
  const fwd = (price - c.price) / (c.atr || 1);
  const d = c.posDir;
  let grade: NewsCall['grade'];
  switch (c.choice) {
    case 'long':
      grade = fwd >= 0.5 ? 'good' : fwd <= -0.5 ? 'bad' : 'ok';
      break;
    case 'short':
      grade = fwd <= -0.5 ? 'good' : fwd >= 0.5 ? 'bad' : 'ok';
      break;
    case 'out':
      grade = Math.abs(fwd) < 1 ? 'good' : 'ok';
      break;
    case 'hold':
      grade = d * fwd >= 0 ? 'good' : d * fwd <= -1 ? 'bad' : 'ok';
      break;
    case 'close':
      grade = d * fwd <= 0 ? 'good' : d * fwd >= 1 ? 'bad' : 'ok';
      break;
  }
  c.fwd = fwd;
  c.grade = grade;
  return c;
}

export function explainGrade(c: NewsCall, bars: number) {
  const move = `${c.fwd! >= 0 ? '+' : '−'}${Math.abs(c.fwd!).toFixed(1)} ATR over ${bars} bars`;
  const mark = { good: '✓', ok: '~', bad: '✗' }[c.grade!];
  return `${mark} ${CHOICE_LABEL[c.choice]}${c.timedOut ? ' (time ran out)' : ''} · price ${move}`;
}
