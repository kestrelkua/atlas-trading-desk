# Atlas — Ideas Repository

Nothing here is locked in. Ideas move to "Built" once they ship.

## Built in v0.1
- Replay engine on transformed real data: hidden ticker and dates, prices rescaled, intrabar tick path so candles form live
- Two modes: 1 year of daily bars, 5 days of 5-minute bars (each with a warm-up period)
- Indicators that update as candles form: SMA 8/25/50, Bollinger 20/2, MACD 12/26/9, volume
- Warm-up phase: briefing (market regime, sector strength, trend), drawing levels and swing marks, committing to a bias
- Wire headlines pinned to the bars where the real data made outsized moves, plus noise items and occasional wild ones
- Context panels: the stock, its sector ETF and the broad market, all hidden, as % change
- Paper trading: long/short, ATR-based stops and targets, 1% risk sizing, breakeven/trail/tighten/loosen, fees and slippage
- Required reason tags, checked against objective chart rules (✓/✗)
- Debrief: identity reveal, return vs buy & hold, drawdown, per-reason scorecard
- Skill scoring (Trend Reading, Setup Accuracy, Entry Timing, Risk Control, Patience), moving-average ratings, ranks
- Adaptive lessons: weakest skill picks the lesson; tier steps up when you improve and back down when you don't
- Today's Market snapshot from the last data refresh

## Next up
- **Prediction drills**: freeze the chart and ask "up, down or sideways over the next 10 bars?" 5-second reps, spaced repetition on the patterns you miss
- **Real historical headlines**: attach real news to the bar it happened on, rewritten by Claude (offline, at data-build time) so it doesn't give away the ticker
- **Lesson drills**: each lesson gets a matching scenario chosen from the library (e.g. a squeeze lesson starts you on a real squeeze)
- **Curated scenario library**: tag stretches by type (earnings gap, squeeze, crash, slow grind) and serve them by skill level
- **Bigger data library**: Yahoo only serves 60 days of 5-minute history. Add a provider with deeper intraday history and cache it over time

## Later
- **Live news input**: paste or stream a current headline, then show how sectors historically reacted to similar news. Keep it educational, not buy/sell advice
- **"From today" mode**: start from the current market and generate a plausible future by stitching real historical stretches whose conditions (trend, volatility) match today's
- **Mirrored data**: flipped series to double the library, used only on calm stretches or as a labeled mode, because real markets fall faster than they rise
- **Multi-stock rounds / sector rotation**: manage a small portfolio across sectors as news hits
- **Limit orders, partial exits, scaling in**
- **Draggable stop and target lines on the chart**
- **Accounts and sync** so progress follows you across devices
