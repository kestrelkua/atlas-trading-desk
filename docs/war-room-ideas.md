# War Room: ideas for the next version

Ideas only. Nothing here is built yet, except removing the "fun mode" badge.

## The big idea: think in markets, not stocks

The Simulator trains your eyes on one chart. The War Room should train the opposite muscle: zooming out. When the world shakes, money doesn't disappear. It moves from one place to another. The player's job is to see where it's going before everyone else does, and to measure themselves against the whole market (the World Index), not against zero.

That gives the War Room a serious purpose of its own, and a one-line pitch:

> **The War Room: when the world shakes, money moves. Follow it.**

Everything below is judged against three goals: it should stay **simple to play**, make the **big picture** easier to see, and **teach something real**.

---

## 1. Names: from silly to wry

The current names are cartoonish. The fix is to move the joke from food and stereotypes to **economics and geopolitics**, with a dry, slightly dark edge. Every name should still be recognizable at a glance.

| Now | Proposed | One-line description (shown on hover) |
|---|---|---|
| 'Murica | **The United Debts** | Prints the world's reserve currency, and lately quite a lot of it. |
| Canadia | **North Apologia** | Ships oil south and apologizes for the price. |
| Tealand | **Great Brittle** | Lost an empire, kept the opinions. |
| Bonjouria | **Grèvance** | World-class cuisine, world-class general strikes. |
| Autobahnia | **Austeria** | Saves every euro, then lends it to the neighbors. |
| Bearlandia | **The Bleak Federation** | Eleven time zones, all of them winter. |
| Dragonia | **Supplychina** | Makes your phone, your shoes, and your supply-chain anxiety. |
| Sunrisia | **Deflatia** | Prices haven't moved since 1995. Neither have the salaries. |
| Cricketania | **Monsoonia** | A billion and a half people and the fastest-growing everything. |
| Petrolia | **The Crude Emirates** | Sand on top, money underneath. |
| Futbolia | **Volatilia** | Every decade is the best and the worst of times. |
| Savannia | **Cobaltia** | Your phone battery started here. Nobody asks how. |
| Down Undria | **Orestralia** | Digs up the planet and sells it to Supplychina. |
| *(new)* | **The Confederation of Discretia** | Neutral in every war, profitable in all of them. Home of the gold vaults. |

**Places:**
- **Strait of Hormuzzle**: the oil chokepoint.
- **Sue-Us Canal**: the shipping shortcut.
- **The Fab Strait**: where the world's chips are made.
- **The Wobbly Channel** goes away; it was too silly.

**Rule of thumb:** the humor lives in the **names and hover lines**. Headlines read like real newswire copy ("Tankers divert from the Strait of Hormuzzle; Brent jumps 6%"). That contrast keeps it light without making the learning feel like a joke.

---

## 2. Map upgrades

### Make it look like a real world
The low-poly blobs read as placeholders. Two options:
1. **Recommended: real coastlines, fictional borders.** Use a public-domain world outline (Natural Earth, simplified) so the continents are instantly recognizable, then draw our own fictional borders on top. It feels like a real ops-room map, and the countries are still clearly fictional.
2. **Hand-drawn stylized shapes with more detail.** More "Atlas" character, more work, and harder to read.

### Show *why* places matter: resources and routes
This is the most important map upgrade for learning. Each country gets small icons for what it supplies, and each icon links to a basket market:
- 🛢 oil fields → **Energy**
- 🔩 chip fabs → **Tech**
- 🏦 gold vaults → **Gold**
- ✈ air hubs → **Airlines**
- 🛡 arms industry → **Defense**

Add animated **shipping lanes and air corridors** (thin dashed lines). When a crisis hits a chokepoint, its lane turns red and breaks. The player learns to read the map as a supply chain: "the Strait closed, so oil can't get out, so Energy goes up and Airlines go down."

**Hovering a country** shows its exposure, for example: "If the Crude Emirates are disrupted: Energy ▲, Airlines ▼."

### Clearer border states (with a legend)
Four states, each with its own look:
- **Stable:** faint cyan edge.
- **Tense:** amber edge.
- **Conflict:** red edge, pulsing, with a jagged "front line" drawn along the shared border.
- **Easing:** green edge that fades back to stable.

A small legend sits in the corner. Glow strength follows the tension meter, so the whole map gets "hotter" as things escalate.

### Smaller fixes
- **Labels:** fix the crowding in Europe (smaller font, leader lines, or labels only on hover at small sizes).
- **Dots:** size them by market impact, and let old ones fade over time.
- **Camera:** when a major dispatch lands, pan and zoom gently to the hotspot for a second, then ease back out.
- **Timeline strip under the map:** dispatches as ticks you can hover, so after a crisis you can scrub back through what happened.

---

## 3. Simple features that make it better

All of these keep the controls simple: + / − / × stays the core.

1. **Benchmark race line.** A small live chart showing your equity against the World Index, from the moment the crisis starts. The most motivating thing on screen, and it drives home "beat the market, not zero."
2. **Playbooks: one-click macro trades.** Buttons for the classic crisis moves, each trading several markets at once:
   - *Flight to safety:* sell World, buy Gold.
   - *Supply shock:* buy Energy, short Airlines.
   - *Escalation hedge:* buy Defense and Gold.
   - *Relief rally:* buy World, Tech and Airlines.
   - *Go to cash:* close everything.

   Fast and fun, and each one teaches a real pattern by name. The player can still trade markets one at a time.
3. **Rotation heatmap.** A tiny grid with one colored cell per market, showing how each did over the last 5 days *relative to the World Index*. You see the big picture in one glance.
4. **Exposure gauge.** Shows net exposure (are you betting up or down overall?) and gross exposure (how much risk in total). This teaches hedging: you can hold a lot of positions and still be close to neutral.
5. **Flashpoint calendar.** Scheduled moments known in advance: summits, ultimatums, tariff deadlines ("Tariff deadline: Day 34"). Same idea as the earnings calendar: you see risk coming and decide how to be positioned.
6. **Weekly desk memo.** Every ~10 trading days, a short pop-up recap: what moved most, what drove it, and how you compare. It encourages reflection without adding controls.

## 4. What would make it more exciting

- **An escalation ladder** in place of the plain tension number: five named levels (Calm → Watch → Tense → Crisis → Full War Footing). Each step up tints the UI slightly warmer and plays a short alert.
- **A breaking-news ticker** across the top of the War Room, scrolling minor dispatches. Big ones still pause the game.
- **Desk calls on major dispatches.** Like the Simulator's news cards: the game pauses with a 10-second clock and you pick a playbook or "Hold." Graded afterwards.
- **Market shocks as rare events:**
  - **Circuit breaker:** on extreme days, trading halts for the rest of the day. You learn you can't always get out.
  - **Sanctions freeze:** one market becomes untradeable for a few days. You learn not to put everything in one place.
- **Optional sound** (off by default): teletype ticks for dispatches, a low alarm for escalations.
- **The reveal as a payoff:** after the dust settles, show a short **real timeline** of the actual episode (for example, "Feb 24, 2022: invasion begins. Markets fell at the open, then closed higher.") next to your own trades. This is the "aha" moment, and it's real history.
- **Personal bests** per crisis, so you can replay a crisis and try to beat your own rotation.

## 5. Introducing and explaining the War Room

**First visit, a short briefing (about 60 seconds, skippable):**
1. *"When the world shakes, money moves."* The map lights up with a demo crisis.
2. *"Your job: beat the World Index."* Points at the benchmark. Explains that losing 5% while the world loses 15% is a win here.
3. *"Six markets, one portfolio."* Points at the basket: buy what benefits, short what suffers.
4. *"Read the map."* A dispatch lands; click the dot; see which markets it touches.
5. *"Use the playbooks."* One click, a real crisis trade.
6. *"Every crisis is real."* The prices come from actual events, revealed at the end.

It would reuse the same coach-mark engine as the main tutorial, so the two feel like one product.

**Tone:** serious and cinematic, not jokey. The tab is simply "War Room," with a quiet subtitle like *Macro desk*.

**Unlocking later:** frame it as **clearance**: "War Room clearance: Navigator rank." It feels earned and fits the setting. For now it stays open for testing.

## 6. Using the War Room to learn

### War Room skills (separate from the Simulator's)
- **Big Picture:** your return compared with the World Index, adjusted for risk.
- **Rotation:** how much of your money sat in the markets that were winning.
- **Hedging:** your worst drop compared with the World Index's worst drop.
- **Dispatch Judgment:** desk calls graded on what happened next (reuses News Judgment).
- **Discipline:** not over-trading, not panic-selling at the bottom.

### Thesis tags (like the Simulator's reasons)
Each trade or playbook gets a reason: *Safe haven*, *Supply shock*, *Escalation hedge*, *Relief rally*, *Fade the overreaction*, *Rotation*. Each is checked against the data a few days later. For example, *Safe haven* is confirmed if the World Index fell and Gold beat it over the next 5 days.

### Lessons that come from real crisis behavior
- **Correlations go to 1 in a panic.** Nearly everything falls together at first. Diversification helps less than you think on day one.
- **Safe havens can fail.** In 2022, stocks *and* bonds *and* gold all fell at times. Nothing is guaranteed.
- **Buy the rumor, sell the news.** Markets often bottom near the moment fighting actually starts: 1991, 2003 and 2022 all saw rallies right as the conflict began. Fear peaks before the facts.
- **Supply shocks pick winners and losers.** The same event lifts Energy and sinks Airlines.
- **Relief rallies are violent.** Shorts get squeezed. Being right too early is the same as being wrong.
- **Beating the index vs making money.** You can lose money and still have done a great job.

### After-action review (the strongest learning tool)
At the end, replay the crisis on a timeline with **your trades laid over the dispatches**. Highlight:
- your best decision and your worst decision;
- two simple comparisons: **"Just hold the World Index"** and **"Panic seller"** (sold everything after the first big drop and never came back). Seeing the panic seller's result teaches more than any lesson text.

Finish with a one-line prompt: *"What would you do differently?"* It's saved to the journal.

### Connecting back to the Simulator
- War Room concepts (sector strength, safe havens, chokepoints) show up as context in Simulator rounds.
- Doing well in the War Room could unlock harder Simulator levels, and the reverse.

---

## 7. A suggested order

**Phase 1: polish (one session)**
- New wry names, hover lines and places.
- Real-coastline map, resource icons and lanes, border legend, label fixes.
- Benchmark race line, rotation heatmap, playbooks.
- The 60-second War Room briefing.

**Phase 2: learning (one session)**
- Thesis tags, War Room skills, desk calls.
- After-action review with the "hold" and "panic seller" comparisons.
- Three or four War Room lessons.

**Phase 3: depth (later)**
- A bonds market (teaches the 2022 lesson that safe havens can fail).
- Circuit breakers, sanctions freezes, flashpoint calendar, escalation ladder, sound.
- More crises. This needs a longer data history, for example the 2003 invasion of Iraq and the 2014 Crimea annexation. Airlines would switch to individual airline stocks, since the airline fund only goes back to 2015.

## 8. Things I'd deliberately *not* do
- **No casualty counts or graphic war imagery.** Keep the focus on markets and decisions.
- **No real leaders' names**, even as jokes.
- **No more than ~7 markets.** Past that it stops being "big picture" and becomes spreadsheet management.
- **No free-form order types** (limit orders and so on) in the War Room. The Simulator is where you micromanage; the War Room is where you allocate.
