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

## Built in v0.2
- Guided tutorial on first open: a scripted practice round on a real breakout (XOM, Dec 2021), coach marks on the real controls, a free-play finish, then a win/loss message with a famous quote. Skippable, replayable from the ? button
- Placement round: the first real round after the tutorial sets starting ratings
- Interactive news: headlines pause the game for a 10-second call (long / short / stay out, or hold / close), graded on what price did over the next bars
- Event calendar: earnings land on each quarter's biggest real gap, macro releases on the market's biggest real moves (plus one quiet non-event); listed in a dropdown and pinned on the progress strip, with a heads-up the bar before
- New skill: News Judgment, with two lessons
- Reasons: Breakout / Breakdown (replaces Squeeze breakout) and Liquidity zone (high-volume areas + stop clusters), with an optional Liquidity zones overlay
- Lesson objectives run live in the simulator; passing one twice levels up the lesson, and mastered skills hand off to the next weakest
- Trend line drawing tool; months and days on the daily axis (year still hidden), weekdays on intraday

## Built in v0.3 · War Room (fun mode)
- Fictional world map with silly countries ('Murica, Canadia, Bearlandia, Dragonia, Tealand, Bonjouria, Autobahnia, Petrolia, Cricketania, Sunrisia, Down Undria, Futbolia, Savannia) and places (Strait of Hmm-uz)
- Four crises played over real prices of real episodes (2018 trade war, 2022 invasion of Ukraine, Oct 2023 Middle East, 2025 tariff shock), revealed at the end
- A six-market basket (World Index, Defense, Energy, Gold, Airlines, Tech) with long/short positions up to 2× equity
- Dispatches written from the real moves, shown as map dots and in a log; click to read (pauses), big ones auto-pause; borders light up red/amber/green; a tension meter
- Unlocked from the start for testing

## War Room ideas
- Rank lock (e.g. Navigator) once testing is done
- Chokepoint closures, circuit-breaker halts, sanctions that freeze a position
- War Room skills and lessons (rotation, safe havens, "buy the invasion")
- More crises and more instruments (bonds, shipping)

## Next up
- **Prediction drills**: freeze the chart and ask "up, down or sideways over the next 10 bars?" 5-second reps, spaced repetition on the patterns you miss
- **Real historical headlines**: attach real news to the bar it happened on, rewritten by Claude (offline, at data-build time) so it doesn't give away the ticker
- **Lesson drills**: each lesson gets a matching scenario chosen from the library (e.g. a squeeze lesson starts you on a real squeeze)
- **Curated scenario library**: tag stretches by type (earnings gap, squeeze, crash, slow grind) and serve them by skill level
- **Bigger data library**: Yahoo only serves 60 days of 5-minute history. Add a provider with deeper intraday history and cache it over time

## Later
- **Source credibility on news** (rumor vs confirmed vs analyst note), for harder levels
- **Sector spillover news** (a competitor's or the sector's news hits your stock), for harder levels
- **Live news input**: paste or stream a current headline, then show how sectors historically reacted to similar news. Keep it educational, not buy/sell advice
- **"From today" mode**: start from the current market and generate a plausible future by stitching real historical stretches whose conditions (trend, volatility) match today's
- **Mirrored data**: flipped series to double the library, used only on calm stretches or as a labeled mode, because real markets fall faster than they rise
- **Multi-stock rounds / sector rotation**: manage a small portfolio across sectors as news hits
- **Limit orders, partial exits, scaling in**
- **Draggable stop and target lines on the chart**
- **Accounts and sync** so progress follows you across devices
