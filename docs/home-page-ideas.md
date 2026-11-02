# Home: what makes a home page feel like home

The research behind the Home rework. Everything below is built except the Game of the Day door, which waits for that phase.

## The short version

A good home page does three things, in this order:

1. **Recognizes you.** It knows who you are, what time it is, and where you left off.
2. **Offers one next step.** One obvious thing to do, and everything else one tap away.
3. **Asks nothing of you.** No alarms, no red numbers, nothing you can lose by just looking.

Atlas's Home already does a fair amount of this. The ideas below make it feel like it *remembers* you, *notices you growing*, and gives each visit a *good ending*.

---

## 1. What the research says

The evidence varies. A few ideas rest on solid research; most of the home-screen specifics are practitioner experience. I've marked which is which.

### Calm technology: inform, don't demand
Calm technology began at Xerox PARC (Weiser and Brown, 1995) and was turned into design principles by Amber Case. The core idea: good technology lives in your **periphery**. It informs without demanding focus, and moves to the center only when needed. ([Wikipedia](https://en.wikipedia.org/wiki/Calm_technology), [O'Reilly](https://oreilly.com/content/principles-calm-technology-we-are-not-bad-at-technology-technology-is-bad-at-us), [Case](https://www.caseorganic.com/post/principles-of-calm-technology))

**For Atlas:** Home is the periphery of the whole app. It should hint ("your Risk Control is improving") rather than report (a table of six scores).

### Cozy design: safety, abundance, softness
Game designers (Project Horseshoe, 2017–18) defined "coziness" with three pillars ([Lost Garden](https://lostgarden.com/2018/01/24/cozy-games/), [80.lv](https://80.lv/articles/using-coziness-in-game-design)):
- **Safety:** you can be vulnerable without consequence.
- **Abundance:** generosity and plenty; nothing feels scarce or rationed.
- **Softness:** strong visual cues that this is a low-stress place.

The same sources name what breaks it: **pop-ups and interruptions**, and anything that feels like it's selling to you.

**For Atlas:** Home is the "safe room" of a game about risk. Nothing on it should be able to cost you anything.

### Motivation: autonomy, competence, relatedness
Self-Determination Theory says people stay motivated when three needs are met ([NN/g](https://www.nngroup.com/articles/autonomy-relatedness-competence/), [UX Mag](https://uxmag.com/articles/autonomy-relatedness-and-competence-in-ux-design)):
- **Autonomy:** I chose this.
- **Competence:** I'm getting better.
- **Relatedness:** I'm connected to something beyond myself.

This one has strong academic backing. Most of Home's warmth can come from feeding these three needs.

### Unfinished things pull you back
The Ovsiankina effect: people tend to return to interrupted tasks, even without a reward. A 2025 meta-analysis found this resumption effect holds up generally, while the better-known Zeigarnik "memory" effect does not replicate reliably ([Wikipedia](https://en.wikipedia.org/wiki/Ovsiankina_effect), [Ghibellini & Meier 2025](https://ideas.repec.org/a/pal/palcom/v12y2025i1d10.1057_s41599-025-05000-w.html)). Linking it to "continue where you left off" buttons is a reasonable inference, though no study has tested that button directly.

**For Atlas:** "Pick up where you left off" is the right idea, but today it forgets as soon as you close the app.

### Endings shape memory: the peak-end rule
Kahneman's research (1993): we remember an experience by its **high point and its ending**, not its average ([Coglode](https://www.coglode.com/research/peak-end-rule), [summary](https://concepts.dsebastien.net/concept/peak-end-rule/)). This is well established.

**For Atlas:** Home is where every session *ends*, not only where it begins. That makes it the best place for a good ending.

### One primary action
Hick's law: decision time grows with the number of choices. Practitioner guidance converges on **one primary action per screen**, with secondary options clearly quieter ([think.design](https://think.design/blog/understanding-hicks-law-ux-design/), [Uxcel](https://uxcel.com/blog/hicks-law-in-ux-design-simplifying-choices-for-faster-decisions)). The law is strongest when you don't already know what you want, which is exactly the tired, first-glance moment.

### Time of day
Spotify's home changes its greeting and suggestions by time of day ([TechCrunch](https://techcrunch.com/?p=1956169)). Headspace built its Today tab around morning, afternoon and night activities, and refreshed it again in June 2026 ([Headspace](https://help.headspace.com/hc/en-us/articles/51443842967195-Refreshed-Today-Tab-Experience-June-2026), [Cur.at](https://cur.at/UjZvbxT?m=web)).

### Warnings from other apps
- **Streaks can eat the goal.** A study of 859 streak designs argues that once a streak gets a badge on the home screen, protecting the number can matter more than learning ([Mobbin](https://mobbin.com/blog/streaks-are-about-losing-a-study-of-859-streak-designs)).
- **Don't celebrate trading itself.** Robinhood removed its confetti animation in 2021 after regulators and Congress criticized it for gamifying investing for inexperienced users ([CNBC](https://www.cnbc.com/2021/03/31/robinhood-gets-rid-of-confetti-feature-amid-scrutiny-over-gamification.html)). Atlas should celebrate *learning* (an objective met, a thesis that held up), never the act of trading.
- **Apple's Activity rings** aim to motivate "on an almost subconscious level" with shapes instead of numbers ([MobiHealthNews](https://www.mobihealthnews.com/news/jay-blahnik-what-separates-apple-watch-other-fitness-trackers)). That's the same reason Home uses day dots instead of a streak count.

### Three levels of feeling (Don Norman)
Norman's emotional design has three levels, used in research on fitness apps ([CROSBI](https://www.bib.irb.hr/1050020)):
- **Visceral:** how it looks and feels in the first second.
- **Behavioral:** how easy it is to use.
- **Reflective:** what it says about *who you are becoming*.

Home today is strong on the first two. The reflective level is the biggest opening.

---

## 2. How Atlas's Home does today

| Principle | Today | Gap |
|---|---|---|
| Recognizes you | Greeting by time, optional name, week dots | Doesn't remember your *words* or your last session |
| One next step | One card above three doors | The card can't be dismissed ("not today") |
| Asks nothing | No numbers, no alerts | Good. Keep it that way. |
| Safety, abundance, softness | Paper palette, faint map, gentle motion | Same look at every hour of the day |
| Competence | Rank name and rounds this week | Shows a *label*, not *growth* |
| Relatedness | A thought for the day | Nothing connects to the real market yet |
| Resumption | "Pick up where you left off" | Forgotten when the app closes |
| Peak-end | Nothing | Returning Home after a round has no ending |
| Reflective | Rank name | No sense of a journey |

---

## 3. Ideas, from small to bigger

### Small, high-warmth changes

**1. A welcome-back line (peak-end).**
When you come back to Home after finishing a round or crisis, one line replaces the status:
> *Welcome back. Your safe-haven call on Gold held up.*

It picks the **best moment** of the session: a thesis that held up, an objective met, a desk call graded good. It never picks the score. It fades back to normal on the next visit. This gives every session a good ending without any confetti.

**2. Show growth, not a label (competence).**
Swap "Apprentice · 3 rounds this week" for the most encouraging true sentence:
> *Risk Control is up 6 this week.*

If nothing improved, fall back to the rank. Never show a decline on Home; that belongs in Lessons & Progress.

**3. "Not today" on the card (autonomy).**
A small "Not today" link under the suggestion swaps it for a different one (a War Room crisis instead of a Simulator round, or a short lesson instead of a full round). Choosing feels better than being told.

**4. Suggestions that know the time.**
Like Spotify and Headspace, the card adapts to the clock:
- **Late night:** "Got five minutes? One quick round." (short intraday mode)
- **Morning or afternoon:** a full round, focused on your weakest skill.
- **Weekend:** "Settle in for a crisis." (War Room)

**5. Your own words greet you (reflective).**
If you wrote a note in an after-action review, Home can show it once, quietly:
> *Last time you wrote: "Take profits on gold sooner."*

Nothing feels more like *your* home than your own handwriting on the wall. It also closes the learning loop: you see the lesson right before you play again.

**6. Light that follows the day (softness).**
The faint world map behind Home shows **real day and night** right now, a soft shadow over the half of the world where it's dark. In the evening the page warms slightly toward amber. It's cartographic, it changes every time you open the app, and it asks for nothing.

### Medium

**7. Remember games in progress (resumption).**
Save the Simulator round or War Room crisis when you leave, so "Pick up where you left off" still works tomorrow. This is the biggest *functional* gap: the effect pulls people back, but only if the door is still open.

**8. "Market weather" (relatedness, once Game of the Day exists).**
One line, in keeping with the Atlas theme:
> *Markets today: calm seas. Tech led, Energy lagged.*

A weather metaphor keeps it calm and in the periphery: no tickers, no red numbers. It's the first thing on Home that connects you to the real world.

**9. Game of the Day as a fourth door.**
A dated door ("Saturday, Nov 7") that shows a check mark once you've played. It's the natural daily reason to open Home.

### Bigger: the reflective level

**10. A passport of stamps (the journey).**
In an app called Atlas, progress should feel like *travel*. Each finished crisis stamps its region; each lesson objective passed earns a stamp; each rank is a new title on the cover. The full passport lives in Lessons & Progress. Home shows only the newest stamp, small, near the greeting:
> *New stamp: The Gulf Shipping Crisis.*

This builds identity ("I'm becoming a Cartographer") and abundance (a collection that only grows) without points or leaderboards.

---

## 4. Things Home should never do

- **No red numbers, P&L or scores.** Home is the safe room.
- **No streak counter or "don't lose your streak" messages.** The day dots stay as dots.
- **No badges, alert counts or pop-ups.** Interruptions are exactly what break coziness.
- **No celebration of trading activity.** Celebrate learning only (a thesis held up, an objective met).
- **No more than one card.** Everything else is a door.
- **No live tickers.** Real-market connection comes as one calm sentence, not a feed.

---

## 5. Suggested order

1. **Next session (small):** welcome-back line, growth sentence, "Not today", time-aware suggestions, your own note. All of these use data Atlas already saves.
2. **Then:** real day and night on the map, and saving games in progress.
3. **With Game of the Day:** market weather and the fourth door.
4. **Later:** the passport of stamps.

Each step keeps Home on a single screen, with one card and three (later four) doors.
