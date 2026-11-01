import type { Trade } from './account';
import type { NewsCall } from './news';
import type { SkillId } from './skills';

/** What happened in the round so far, for checking a lesson's objective live. */
export interface RoundFacts {
  trades: Trade[];
  calls: NewsCall[];
  swingBeforeFirstTrade: boolean;
  earningsSeen: number;
  earningsFlat: number;
}

export interface ObjectiveStatus {
  done: boolean;
  failed: boolean;
  progress: string;
}

export interface Lesson {
  id: string;
  skill: SkillId;
  tier: 'foundation' | 'advanced';
  title: string;
  body: string[];
  challenge: string;
  objective(f: RoundFacts): ObjectiveStatus;
}

const confirmed = (t: Trade, id: string) => t.tags.includes(id) && t.verified[id];
const stopDist = (t: Trade) => (t.initialStop === undefined ? Infinity : Math.abs(t.entryPrice - t.initialStop));

/** "Every trade must satisfy X", with at least `min` trades. */
function everyTrade(f: RoundFacts, ok: (t: Trade) => boolean, min = 1): ObjectiveStatus {
  const n = f.trades.length;
  const good = f.trades.filter(ok).length;
  return { done: n >= min && good === n, failed: good < n, progress: `${good} of ${n} trades${n < min ? ` (need ${min})` : ''}` };
}

export const LESSONS: Lesson[] = [
  {
    id: 'trend-1',
    skill: 'trend',
    tier: 'foundation',
    title: 'Reading the trend with moving averages',
    body: [
      'When the 8 SMA sits above the 25, and the 25 above the 50, the averages are stacked bullish. Reverse that order and they are stacked bearish.',
      'Trades in the direction of the stack have the wind at their back. When the averages are tangled together, the market is ranging, and trend signals become coin flips.',
    ],
    challenge: 'Only trade in the direction of the SMA stack. Sit out when the averages are tangled.',
    objective: (f) => everyTrade(f, (t) => (t.dir === 1 ? t.ctx.trend === 'up' : t.ctx.trend === 'down')),
  },
  {
    id: 'trend-2',
    skill: 'trend',
    tier: 'advanced',
    title: 'Trend strength and exhaustion',
    body: [
      'A trend that has run more than about 3 ATR away from its 25 SMA is stretched, and stretched trends tend to snap back toward the average.',
      'Warning signs of a tiring trend: lower highs inside an uptrend, and MACD divergence, where price makes a new high but the MACD makes a lower one.',
    ],
    challenge: 'Mark a swing high or low (a possible divergence) before your first trade.',
    objective: (f) => ({
      done: f.swingBeforeFirstTrade && f.trades.length > 0,
      failed: !f.swingBeforeFirstTrade && f.trades.length > 0,
      progress: f.trades.length ? (f.swingBeforeFirstTrade ? 'Swing marked first ✓' : 'Traded before marking a swing') : 'Mark a swing, then trade',
    }),
  },
  {
    id: 'setup-1',
    skill: 'setup',
    tier: 'foundation',
    title: 'Name your setup before you click',
    body: [
      'A trade without a reason is a guess. Every reason tag has a precise definition. For example, "MACD cross" means the MACD line crossed its signal line within the last 3 bars.',
      'If the chart does not show what you claimed, the tag gets an ✗. That is not a punishment: it shows the gap between what you think you see and what is there.',
    ],
    challenge: 'Get every tag confirmed, even if it means fewer trades.',
    objective: (f) => everyTrade(f, (t) => t.tags.every((id) => t.verified[id])),
  },
  {
    id: 'setup-2',
    skill: 'setup',
    tier: 'advanced',
    title: 'Confluence: stacking independent reasons',
    body: [
      'The best entries line up two or three reasons that come from different information. MACD and SMAs are both built from closing prices, so they mostly agree with each other.',
      'Volume and price location add new information. A liquidity zone or level that holds on a volume surge, inside a trend, is real confluence.',
    ],
    challenge: 'Only enter with at least two confirmed tags, one of them Level play, Liquidity zone or Volume surge.',
    objective: (f) =>
      everyTrade(
        f,
        (t) => Object.values(t.verified).filter(Boolean).length >= 2 && ['level', 'liquidity', 'volume'].some((id) => confirmed(t, id)),
      ),
  },
  {
    id: 'timing-1',
    skill: 'timing',
    tier: 'foundation',
    title: "Don't chase",
    body: [
      'Heat is how far price moves against you after you enter. Buying right after a huge candle usually means buying from someone who is taking profit.',
      'Patient entries wait for a pullback toward the 8 SMA or a level you marked. You will miss some moves, but you will take far less heat on the ones you catch.',
    ],
    challenge: 'Keep your average heat under 0.8 ATR over at least 2 trades. Wait for pullbacks instead of chasing big bars.',
    objective: (f) => {
      const n = f.trades.length;
      const heat = n ? f.trades.reduce((s, t) => s + t.mae / (t.atr || 1), 0) / n : 0;
      return { done: n >= 2 && heat < 0.8, failed: false, progress: n ? `Average heat ${heat.toFixed(2)} ATR · ${n} trade${n === 1 ? '' : 's'}` : 'No trades yet' };
    },
  },
  {
    id: 'timing-2',
    skill: 'timing',
    tier: 'advanced',
    title: 'Entering on the retest',
    body: [
      'Breakouts often come back to test the level they broke. Old resistance becomes support.',
      'Entering on the retest gives you a tight, logical stop just beyond the level. If the level fails, you know quickly and cheaply.',
    ],
    challenge: 'Take a confirmed Breakout or Level trade with a stop no more than 1 ATR away.',
    objective: (f) => {
      const hit = f.trades.some((t) => (confirmed(t, 'breakout') || confirmed(t, 'level')) && stopDist(t) <= t.atr * 1.05);
      return { done: hit, failed: false, progress: hit ? 'Done ✓' : 'Not yet' };
    },
  },
  {
    id: 'risk-1',
    skill: 'risk',
    tier: 'foundation',
    title: 'Know your exit before your entry',
    body: [
      'Set the stop when you enter. Size the position so that a stop-out costs about 1% of your equity.',
      'Position size = (equity × 1%) ÷ (distance from entry to stop). The ticket\'s "1% risk" size button does this math for you.',
    ],
    challenge: 'Set a stop on every trade, and risk no more than about 1% of equity on each.',
    objective: (f) => everyTrade(f, (t) => t.stopAtEntry && (t.qty * stopDist(t)) / 100_000 <= 0.012),
  },
  {
    id: 'risk-2',
    skill: 'risk',
    tier: 'advanced',
    title: 'Reward-to-risk and expectancy',
    body: [
      'Expectancy = win rate × average win − loss rate × average loss. With a 2:1 payoff you can be wrong 60% of the time and still make money.',
      'Move your stop to breakeven only after price has moved one full stop distance in your favor. Do it sooner and normal noise will knock you out.',
    ],
    challenge: 'Set every target at least 2× your stop distance.',
    objective: (f) =>
      everyTrade(f, (t) => t.initialTarget !== undefined && Math.abs(t.initialTarget - t.entryPrice) >= 1.95 * stopDist(t)),
  },
  {
    id: 'patience-1',
    skill: 'patience',
    tier: 'foundation',
    title: 'Fewer, better trades',
    body: [
      'Overtrading bleeds fees and slippage, and usually means you are trading noise. Most of any replay is nothing special. Your edge lives in a few spots.',
      'Sitting on your hands is a position too.',
    ],
    challenge: 'Take between 1 and 4 trades this round.',
    objective: (f) => {
      const n = f.trades.length;
      return { done: n >= 1 && n <= 4, failed: n > 4, progress: `${n} of 4 trades used` };
    },
  },
  {
    id: 'patience-2',
    skill: 'patience',
    tier: 'advanced',
    title: 'Let winners run, cut losers short',
    body: [
      'People naturally grab small wins and hold onto losers hoping they come back. This is called the disposition effect. Your journal compares how long you hold winners against how long you hold losers.',
      'A trailing stop lets a winner keep going while locking in gains, without you having to guess the top.',
    ],
    challenge: 'Use the Trail button on a trade that ends up a winner.',
    objective: (f) => {
      const hit = f.trades.some((t) => t.trailed && (t.pnl ?? 0) > 0);
      return { done: hit, failed: false, progress: hit ? 'Done ✓' : 'Trail a winner' };
    },
  },
  {
    id: 'news-1',
    skill: 'news',
    tier: 'foundation',
    title: 'Judge the reaction, not the headline',
    body: [
      'Price often moves before the news, and big scheduled events are partly priced in. A "great" report that sells off tells you more than the report itself.',
      'Plenty of headlines are noise. Staying out is a real decision, and often the right one.',
    ],
    challenge: 'Make at least 3 news calls, with at least 2 graded good.',
    objective: (f) => {
      const good = f.calls.filter((c) => c.grade === 'good').length;
      return { done: f.calls.length >= 3 && good >= 2, failed: false, progress: `${f.calls.length} calls · ${good} good` };
    },
  },
  {
    id: 'news-2',
    skill: 'news',
    tier: 'advanced',
    title: 'Trading around scheduled events',
    body: [
      'Earnings and macro releases are on the calendar in advance. You can reduce risk before them, hold through with a stop you can live with, or wait and trade the reaction.',
      'Remember that an overnight gap can jump straight past your stop. Holding through earnings is a bet on direction, not a setup.',
    ],
    challenge: 'Be flat going into every earnings report, then trade the reaction if you like it.',
    objective: (f) => ({
      done: f.earningsSeen > 0 && f.earningsFlat === f.earningsSeen,
      failed: f.earningsFlat < f.earningsSeen,
      progress: `Flat into ${f.earningsFlat} of ${f.earningsSeen} earnings so far`,
    }),
  },
];
