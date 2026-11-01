import type { SkillId } from './skills';

export interface Lesson {
  id: string;
  skill: SkillId;
  tier: 'foundation' | 'advanced';
  title: string;
  body: string[];
  challenge: string;
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
    challenge: 'Next round, only trade in the direction of the SMA stack. Sit out when the averages are tangled.',
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
    challenge: 'Find one divergence next round and mark it with a swing marker before you act on it.',
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
    challenge: 'Get every tag confirmed next round, even if it means fewer trades.',
  },
  {
    id: 'setup-2',
    skill: 'setup',
    tier: 'advanced',
    title: 'Confluence: stacking independent reasons',
    body: [
      'The best entries line up two or three reasons that come from different information. MACD and SMAs are both built from closing prices, so they mostly agree with each other.',
      'Volume and price levels add new information. A level that holds on a volume surge, inside a trend, is real confluence.',
    ],
    challenge: 'Only enter with at least two confirmed tags, one of them Level play or Volume surge.',
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
    challenge: 'After any unusually large bar, wait at least 2 bars before entering.',
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
    challenge: 'Mark a level in warm-up. Wait for a break and a retest, then put your stop 0.5 to 1 ATR past the level.',
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
    challenge: 'Set a stop on every trade, and use 1% risk sizing.',
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
    challenge: 'Take no more than 4 trades next round.',
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
    challenge: 'Use the Trail button on a winning trade instead of closing it by hand.',
  },
];
