# Atlas Trading Desk

A paper-trading simulator that replays real market history in disguise, grades the reasoning behind your trades, and serves lessons matched to your weakest skill.

```bash
npm install
npm run fetch-data   # pulls price history into public/data (already done once)
npm run build-map    # bakes the War Room map into src/mapdata.ts (already done once)
npm run dev
# Pushing to main deploys to https://kestrelkua.github.io/atlas-trading-desk/ (GitHub Actions)
```

- `scripts/fetch-data.mjs`: downloads daily (10y) and 5-minute (60d) bars for the stocks, sector ETFs and SPY
- `scripts/build-map.mjs`: merges real Natural Earth countries into the War Room's fictional nations and writes `src/mapdata.ts`
- `src/data.ts`: picks a random stretch, hides its identity, rescales prices
- `src/replay.ts`: plays bars tick by tick
- `src/indicators.ts`: SMA, Bollinger, MACD, ATR without lookahead
- `src/context.ts`: what the chart objectively shows; checks your reason tags
- `src/skills.ts`, `src/profile.ts`, `src/lessons.ts`: scoring, ranks, adaptive lessons
- `IDEAS.md`: roadmap and idea backlog
