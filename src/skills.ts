import type { Trade } from './account';

export const SKILLS = [
  { id: 'trend', name: 'Trend Reading', blurb: 'Trading with the prevailing direction' },
  { id: 'setup', name: 'Setup Accuracy', blurb: 'Your stated reasons match what the chart shows' },
  { id: 'timing', name: 'Entry Timing', blurb: 'How little heat your entries take' },
  { id: 'risk', name: 'Risk Control', blurb: 'Stops, sizing, and cutting losers' },
  { id: 'patience', name: 'Patience', blurb: 'Selectivity, and letting winners outlast losers' },
] as const;

export type SkillId = (typeof SKILLS)[number]['id'];
export type SkillScores = Record<SkillId, number | null>;

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Grades the process behind the trades, not the P&L. */
export function scoreRound(trades: Trade[], playBars: number, startEquity: number): SkillScores {
  if (!trades.length) return { trend: null, setup: null, timing: null, risk: null, patience: null };

  const trend = mean(
    trades.map((t) => {
      if (t.ctx.trend === 'range') return 0.5;
      return (t.dir === 1) === (t.ctx.trend === 'up') ? 1 : 0;
    }),
  ) * 100;

  const verdicts = trades.flatMap((t) => Object.values(t.verified));
  const setup = verdicts.length ? (verdicts.filter(Boolean).length / verdicts.length) * 100 : 0;

  const heat = mean(trades.map((t) => t.mae / (t.atr || 1)));
  const timing = 100 - 38 * Math.max(0, heat - 0.3);

  const wins = trades.filter((t) => (t.pnl ?? 0) > 0);
  const losses = trades.filter((t) => (t.pnl ?? 0) <= 0);
  const stopUse = trades.filter((t) => t.stopAtEntry).length / trades.length;
  const avgWin = wins.length ? mean(wins.map((t) => t.pnl!)) : 0;
  const avgLoss = losses.length ? Math.abs(mean(losses.map((t) => t.pnl!))) : 0;
  const payoff = !losses.length ? 1 : !wins.length ? 0 : Math.min(avgWin / (avgLoss || 1) / 2, 1);
  const worst = losses.length ? Math.max(...losses.map((t) => Math.abs(t.pnl!))) / startEquity : 0;
  const worstScore = Math.max(0, Math.min(1, (0.05 - worst) / 0.04));
  const risk = stopUse * 40 + payoff * 35 + worstScore * 25;

  const per100 = (trades.length / playBars) * 100;
  const selectivity = Math.max(0, Math.min(1, (15 - per100) / 11));
  const held = (ts: Trade[]) => mean(ts.map((t) => (t.exitIdx ?? t.entryIdx) - t.entryIdx + 1));
  const holdRatio = wins.length && losses.length ? Math.min(1, held(wins) / held(losses)) : 0.6;
  const patience = selectivity * 60 + holdRatio * 40;

  return {
    trend: clamp(trend),
    setup: clamp(setup),
    timing: clamp(timing),
    risk: clamp(risk),
    patience: clamp(patience),
  };
}
