import type { Account, Trade } from './account';
import { tagById, TAGS } from './context';
import { MODES } from './data';
import type { Briefing, CalendarEvent, NewsItem } from './events';
import { LESSONS, type Lesson, type ObjectiveStatus } from './lessons';
import { REACTION_BARS, explainGrade, type NewsCall } from './news';
import { LEVELS, level, skillTrend, type Profile, type Recommendation } from './profile';
import { SKILLS, type SkillScores } from './skills';
import type { Scenario } from './types';
import { WAR_LESSONS, WAR_SKILLS, recommendWar, type WarProfile } from './warlearn';

export const money = (x: number) =>
  (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x: number, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`;
export const tone = (x: number) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** A sparkline that fills left-to-right over `total` slots, with a dashed baseline at `baseIdx`. */
export function spark(values: number[], total: number, baseIdx: number) {
  if (values.length < 2) return '<svg viewBox="0 0 100 30"></svg>';
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (i / (total - 1)) * 100;
  const y = (v: number) => 28 - ((v - lo) / (hi - lo || 1)) * 26;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join('');
  const base = values[Math.min(baseIdx, values.length - 1)];
  const color = values[values.length - 1] >= base ? 'var(--up)' : 'var(--down)';
  return `<svg viewBox="0 0 100 30" preserveAspectRatio="none">
    <line x1="${x(baseIdx)}" x2="${x(baseIdx)}" y1="0" y2="30" stroke="var(--rule)" stroke-width="0.6" vector-effect="non-scaling-stroke"/>
    <line x1="0" x2="100" y1="${y(base)}" y2="${y(base)}" stroke="var(--ink-3)" stroke-dasharray="2 2" stroke-width="0.6" vector-effect="non-scaling-stroke"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

export function briefing(s: Scenario, b: Briefing, opts: { phase: string; bias: string | null; levels: number }) {
  const warm = opts.phase === 'briefing';
  const biasBtn = (v: string, label: string) =>
    `<button data-act="bias" data-v="${v}" class="${opts.bias === v ? 'active' : ''}">${label}</button>`;
  return `
    <h3>Briefing</h3>
    <p class="note">“${esc(b.note)}”</p>
    <dl class="facts num">
      <dt>Broad market</dt><dd class="${tone(b.marketChange)}">${pct(b.marketChange)}</dd>
      <dt>Market volatility</dt><dd>${b.marketVol.toFixed(0)}% · ${b.regime}</dd>
      <dt>Sector vs market</dt><dd class="${tone(b.sectorRel)}">${pct(b.sectorRel)}</dd>
      <dt>${esc(s.alias.ticker)} warm-up move</dt><dd class="${tone(b.stockChange)}">${pct(b.stockChange)}</dd>
      <dt>Trend</dt><dd>${b.trend}</dd>
      <dt>Average range (ATR)</dt><dd>${b.atrPct.toFixed(1)}% per bar</dd>
      <dt>From warm-up high</dt><dd class="${tone(b.fromHigh)}">${pct(b.fromHigh)}</dd>
    </dl>
    <p class="hint">Earnings dates and economic releases appear on the calendar once they're announced, usually a few weeks ahead.</p>
    ${b.bigMoveExpected ? '<div class="flag">Options desk: the market is pricing an <b>outsized move</b> in this period.</div>' : ''}
    ${
      warm
        ? `<p class="kicker">Your read</p>
      <div class="seg bias">${biasBtn('bull', 'Bullish')}${biasBtn('neutral', 'Neutral')}${biasBtn('bear', 'Bearish')}</div>
      <ul class="checklist">
        <li class="${opts.levels >= 2 ? 'ok' : ''}">Draw at least 2 levels (${opts.levels} so far)</li>
        <li class="${opts.bias ? 'ok' : ''}">Commit to a bias</li>
        <li>Note where the SMAs are stacked</li>
      </ul>
      <button class="btn primary" data-act="start" style="width:100%">Start round</button>`
        : opts.bias
          ? `<p class="kicker">Your bias</p><div>${{ bull: 'Bullish', neutral: 'Neutral', bear: 'Bearish' }[opts.bias]}</div>`
          : ''
    }`;
}

export function context(s: Scenario, cur: number) {
  const n = cur + 1;
  const total = s.bars.length;
  const base = s.pre - 1;
  const row = (label: string, xs: number[]) => {
    const v = xs.slice(0, n);
    const ref = v[Math.min(base, v.length - 1)];
    const chg = (v[v.length - 1] / ref - 1) * 100;
    return `<div class="spark-row"><span>${label}</span>${spark(v, total, base)}<span class="v num ${tone(chg)}">${pct(chg)}</span></div>`;
  };
  const stock = s.bars.map((b) => b.c);
  const rel =
    ((stock[cur] / stock[base] - 1) - (s.sectorSeries[cur] / s.sectorSeries[base] - 1)) * 100;
  return `
    <h3>Context</h3>
    ${row(s.alias.ticker, stock)}
    ${row('Sector', s.sectorSeries)}
    ${row('Market', s.market)}
    <p class="hint">Changes since the round started. Relative strength vs sector:
      <b class="num ${tone(rel)}">${pct(rel)}</b></p>`;
}

const KIND_LABEL: Record<NewsItem['kind'], string> = {
  move: 'Headline',
  noise: 'Headline',
  wild: 'Wild headline',
  earnings: 'Earnings',
  macro: 'Economic release',
};

export function wireItem(n: NewsItem, label: string) {
  return `<li data-idx="${n.idx}" class="${n.kind === 'wild' ? 'wild' : n.tone}"><span class="when">${KIND_LABEL[n.kind]} · ${esc(label)}</span>${esc(n.headline)}</li>`;
}

export function decision(n: NewsItem, open: Trade | null, timed: boolean) {
  const btn = (v: string, label: string, cls = '') => `<button class="btn ${cls}" data-act="decide" data-v="${v}">${label}</button>`;
  const choices = open
    ? btn('hold', 'Hold') + btn('close', 'Close position', open.dir === 1 ? 'sell' : 'buy')
    : btn('long', 'Go long', 'buy') + btn('short', 'Go short', 'sell') + btn('out', 'Stay out');
  return `
    <p class="kicker">Breaking · ${KIND_LABEL[n.kind]}</p>
    <p class="headline">${esc(n.headline)}</p>
    ${timed ? '<div class="timer"><span></span></div>' : ''}
    <div class="choices">${choices}</div>
    <p class="hint">${open ? 'You have an open position.' : 'New trades use your ticket settings for size, stop and target.'} Graded on what price does next.</p>`;
}

const known = (events: CalendarEvent[], cur: number) => events.filter((e) => e.announceIdx <= cur);

export function pins(events: CalendarEvent[], s: Scenario, cur: number) {
  const total = s.bars.length - s.pre;
  return known(events, cur)
    .map((e) => {
      const left = ((e.idx - s.pre + 0.5) / total) * 100;
      return `<span class="${e.kind} ${e.idx <= cur ? 'past' : ''}" style="left:${left}%" title="${esc(e.title)} · ${esc(s.labels[e.idx])}">${e.code}</span>`;
    })
    .join('');
}

export function calendar(events: CalendarEvent[], s: Scenario, cur: number) {
  const list = known(events, cur);
  const body = list.length
    ? list
        .map((e) => {
          const past = e.idx <= cur;
          let status: string;
          if (past) {
            const move = (s.bars[e.idx].c / s.bars[e.idx - 1].c - 1) * 100;
            status = `<span class="num ${tone(move)}">${pct(move)}</span>`;
          } else status = `<span class="muted">${e.idx - cur === 1 ? 'next bar' : `in ${e.idx - cur} bars`}</span>`;
          return `<div class="cal-item ${past ? 'past' : ''}">
        <span class="pin-icon ${e.kind}">${e.code}</span>
        <span>${esc(e.title)}<span class="when">${esc(s.labels[e.idx])} · ${esc(e.detail)}</span></span>
        ${status}</div>`;
        })
        .join('')
    : '<p class="muted">Nothing announced yet. Dates appear here a few weeks ahead.</p>';
  return `<h3>Event calendar</h3>${body}
    <p class="hint"><b>EARN</b> = this company's earnings report. <b>CPI, FED, JOBS, SALES, GDP</b> = economic releases that move the whole market. Big events can gap straight past a stop.</p>`;
}

export const announcedAhead = (events: CalendarEvent[], cur: number) => known(events, cur).filter((e) => e.idx > cur).length;

export function objective(l: Lesson, st: ObjectiveStatus, ended: boolean) {
  const mark = st.done ? '<span class="up">✓ Complete</span>' : st.failed ? '<span class="down">✗ Missed</span>' : ended ? '<span class="down">✗ Not met</span>' : '<span class="muted">In progress</span>';
  return `
    <h3>Lesson objective</h3>
    <div class="obj-title">${esc(l.challenge)}</div>
    <div class="obj-status num">${mark} · ${esc(st.progress)}</div>
    <p class="hint">From "${esc(l.title)}". Pass it twice to level up this lesson.</p>`;
}

export function account(a: Account, price: number, s: Scenario | null) {
  const eq = a.equity(price);
  const ret = (eq / a.start - 1) * 100;
  const t = a.open;
  const openPnl = a.openPnl(price);
  let pos = '<div class="position">Flat. No open position.</div>';
  if (t && s) {
    const side = t.dir === 1 ? 'Long' : 'Short';
    pos = `<div class="position ${t.dir === 1 ? 'long' : 'short'} num">
      <b>${side} ${t.qty.toLocaleString()}</b> @ ${t.entryPrice.toFixed(2)}
      <span class="${tone(openPnl)}" style="float:right">${money(openPnl)}</span><br/>
      <span class="muted">Stop ${t.stop?.toFixed(2) ?? 'none'} · Target ${t.target?.toFixed(2) ?? 'none'}</span>
    </div>`;
  }
  return `
    <h3>Account</h3>
    <div class="acct-grid num">
      <div><div class="lbl">Equity</div><div class="val">${money(eq)}</div></div>
      <div><div class="lbl">Return</div><div class="val ${tone(ret)}">${pct(ret, 2)}</div></div>
      <div><div class="lbl">Cash</div><div>${money(a.cash)}</div></div>
      <div><div class="lbl">Max drawdown</div><div>${pct(-a.maxDrawdown * 100, 2)}</div></div>
    </div>
    ${pos}`;
}

export function order(opts: {
  open: Trade | null;
  canTrade: boolean;
  size: number | string;
  stopAtr: number | null;
  targetAtr: number | null;
  tags: Set<string>;
}) {
  const seg = (act: string, items: readonly (number | string | null)[], cur: unknown, fmt: (x: number | string | null) => string) =>
    `<div class="seg">${items
      .map((x) => `<button data-act="${act}" data-v="${x}" class="${x === cur ? 'active' : ''}">${fmt(x)}</button>`)
      .join('')}</div>`;
  if (opts.open) {
    return `
      <h3>Manage position</h3>
      <div class="manage">
        <button class="btn" data-act="be">Stop → breakeven</button>
        <button class="btn" data-act="trail">Trail 1 ATR</button>
        <button class="btn" data-act="tighten">Tighten ¼ ATR</button>
        <button class="btn" data-act="loosen">Loosen ¼ ATR</button>
        ${opts.open.stop === undefined ? '<button class="btn wide" data-act="addstop">Add stop (1.5 ATR)</button>' : ''}
        <button class="btn wide ${opts.open.dir === 1 ? 'sell' : 'buy'}" data-act="close">Close position (X)</button>
      </div>
      <p class="hint">Managing a trade is part of the skill. Trailing a winner beats guessing the top.</p>`;
  }
  return `
    <h3>Order ticket</h3>
    <div class="field">
      <div class="row"><span>Size</span><span id="size-info" class="num"></span></div>
      ${seg('size', [0.1, 0.25, 0.5, 1, 'risk'], opts.size, (x) => (x === 'risk' ? '1% risk' : `${(x as number) * 100}%`))}
    </div>
    <div class="field">
      <div class="row"><span>Stop</span><span id="stop-px" class="num"></span></div>
      ${seg('stop', [null, 1, 1.5, 2, 3], opts.stopAtr, (x) => (x === null ? 'None' : `${x}×`))}
    </div>
    <div class="field">
      <div class="row"><span>Target</span><span id="target-px" class="num"></span></div>
      ${seg('target', [null, 1.5, 2, 3, 4], opts.targetAtr, (x) => (x === null ? 'None' : `${x}×`))}
    </div>
    <div class="field">
      <div class="row"><span>Reason (pick at least one)</span></div>
      <div class="chips" id="chips">${TAGS.map(
        (t) => `<button class="chip ${opts.tags.has(t.id) ? 'on' : ''}" data-act="tag" data-v="${t.id}" title="${esc(t.rule)}">${t.label}</button>`,
      ).join('')}</div>
    </div>
    <div class="actions">
      <button class="btn buy" data-act="buy" ${opts.canTrade ? '' : 'disabled'}>Buy · Long (B)</button>
      <button class="btn sell" data-act="short" ${opts.canTrade ? '' : 'disabled'}>Sell short (S)</button>
    </div>
    <p class="hint">${opts.canTrade ? 'Stops and targets are in multiples of ATR, the average bar range.' : 'Trading opens when the round starts.'}</p>`;
}

export function journal(trades: Trade[], labels: string[]) {
  if (!trades.length) return '<li class="muted">No trades yet.</li>';
  return trades
    .map((t) => {
      const tags = t.tags
        .map((id) => `${tagById(id).label} <span class="${t.verified[id] ? 'ok-mark' : 'no-mark'}">${t.verified[id] ? '✓' : '✗'}</span>`)
        .join(' · ');
      const exit = t.exitIdx !== undefined ? ` → ${t.exitPrice!.toFixed(2)} <span class="muted">(${t.exitReason})</span>` : ' · open';
      return `<li>
        <div class="top num"><span><b>${t.dir === 1 ? 'L' : 'S'}${t.id}</b> ${t.entryPrice.toFixed(2)}${exit}</span>
        <span class="${tone(t.pnl ?? 0)}">${t.pnl !== undefined ? money(t.pnl) : ''}</span></div>
        <div class="tags">${tags}</div>
        <div class="muted" style="font-size:0.8rem">${esc(labels[t.entryIdx] ?? '')}</div>
      </li>`;
    })
    .join('');
}

function skillRows(scores: SkillScores, ratings: SkillScores, before?: SkillScores) {
  return SKILLS.map((sk) => {
    const s = scores[sk.id];
    const r = ratings[sk.id];
    const b = before?.[sk.id];
    const delta = r !== null && b !== null && b !== undefined ? r - b : null;
    return `<div class="skill-row">
      <span title="${esc(sk.blurb)}">${sk.name}</span>
      <div class="meter">${r !== null ? `<span style="width:${r}%"></span>` : ''}${s !== null ? `<i class="tick" style="left:${s}%"></i>` : ''}</div>
      <span class="num">${s === null ? '<span class="muted">n/a</span>' : `${s}`} ${
        delta ? `<span class="${tone(delta)}">(${delta > 0 ? '+' : ''}${delta})</span>` : ''
      }</span>
    </div>`;
  }).join('');
}

export function lessonCard(l: Lesson, reason?: string) {
  return `<div class="lesson-card">
    <div class="tier">${l.tier} · ${SKILLS.find((s) => s.id === l.skill)!.name}</div>
    <h4>${esc(l.title)}</h4>
    ${reason ? `<p class="muted"><i>${esc(reason)}</i></p>` : ''}
    ${l.body.map((p) => `<p>${esc(p)}</p>`).join('')}
    <p class="challenge"><b>Challenge:</b> ${esc(l.challenge)}</p>
  </div>`;
}

export function debrief(d: {
  s: Scenario;
  acct: Account;
  price: number;
  bias: string | null;
  scores: SkillScores;
  before: SkillScores;
  profile: Profile;
  rec: Recommendation | null;
  levelBefore: string;
  calls: NewsCall[];
  objective: { lesson: Lesson; status: ObjectiveStatus } | null;
  placement: boolean;
}) {
  const { s, acct } = d;
  const trades = acct.closed;
  const ret = (acct.equity(d.price) / acct.start - 1) * 100;
  const bh = (s.bars[s.bars.length - 1].c / s.bars[s.pre].o - 1) * 100;
  const wins = trades.filter((t) => (t.pnl ?? 0) > 0).length;
  const lvl = level(d.profile);
  const biasRight =
    d.bias === null ? null : d.bias === 'neutral' ? Math.abs(bh) < 5 : (d.bias === 'bull') === bh > 0;

  const byTag = new Map<string, { n: number; ok: number; pnl: number }>();
  for (const t of trades)
    for (const id of t.tags) {
      const r = byTag.get(id) ?? { n: 0, ok: 0, pnl: 0 };
      r.n++;
      if (t.verified[id]) r.ok++;
      r.pnl += t.pnl ?? 0;
      byTag.set(id, r);
    }

  return `
    <h2 id="debrief-title" style="margin:0">${d.placement ? 'Placement round complete' : 'Round complete'}</h2>
    ${d.placement ? '<p class="muted" style="margin:0.2rem 0 0">This round set your starting ratings. From here on, lessons and objectives adapt to how you trade.</p>' : ''}
    <div class="reveal">
      <div class="muted">${esc(s.alias.name)} (${esc(s.alias.ticker)}) was</div>
      <div class="was">${esc(s.symbol)}</div>
      <div class="muted">${esc(s.sector)} · ${esc(s.startDate)} to ${esc(s.endDate)} · ${MODES[s.mode].label} · prices scaled ×${s.scale.toFixed(2)}</div>
    </div>
    <div class="stat-row num">
      <div class="stat"><div class="lbl">Your return</div><div class="val ${tone(ret)}">${pct(ret, 2)}</div></div>
      <div class="stat"><div class="lbl">Buy &amp; hold</div><div class="val ${tone(bh)}">${pct(bh, 2)}</div></div>
      <div class="stat"><div class="lbl">Max drawdown</div><div class="val">${pct(-acct.maxDrawdown * 100, 2)}</div></div>
      <div class="stat"><div class="lbl">Trades</div><div class="val">${trades.length}</div></div>
      <div class="stat"><div class="lbl">Win rate</div><div class="val">${trades.length ? Math.round((wins / trades.length) * 100) + '%' : 'n/a'}</div></div>
      <div class="stat"><div class="lbl">Bias call</div><div class="val">${biasRight === null ? 'none' : biasRight ? '<span class="up">✓</span>' : '<span class="down">✗</span>'}</div></div>
    </div>
    ${
      byTag.size
        ? `<h3>Your reasons</h3>
      <table class="plain num"><thead><tr><th>Reason</th><th class="r">Used</th><th class="r">Confirmed</th><th class="r">P&amp;L</th></tr></thead><tbody>
      ${[...byTag]
        .map(
          ([id, r]) =>
            `<tr><td title="${esc(tagById(id).rule)}">${tagById(id).label}</td><td class="r">${r.n}</td><td class="r">${r.ok}/${r.n}</td><td class="r ${tone(r.pnl)}">${money(r.pnl)}</td></tr>`,
        )
        .join('')}
      </tbody></table>`
        : '<p class="muted">No trades this round, so your skills were not assessed. Sitting out is a valid choice, but you only learn from reps.</p>'
    }
    ${
      d.objective
        ? `<h3>Lesson objective</h3><p>${d.objective.status.done ? '<span class="up">✓ Passed</span>' : '<span class="down">✗ Not passed</span>'}: ${esc(d.objective.lesson.challenge)} <span class="muted">(${esc(d.objective.status.progress)})</span></p>`
        : ''
    }
    ${
      d.calls.length
        ? `<h3>News calls</h3><table class="plain"><tbody>${d.calls
            .map((c) => `<tr><td>${esc(c.headline)}</td><td class="r">${c.grade ? explainGrade(c, REACTION_BARS[s.mode]) : ''}</td></tr>`)
            .join('')}</tbody></table>`
        : ''
    }
    <h3>Skills <span class="muted" style="font-weight:400;letter-spacing:0">(bar = rating, gold tick = this round)</span></h3>
    ${skillRows(d.scores, d.profile.ratings, d.before)}
    <p>Level: <b>${lvl.name}</b> ${lvl.name !== d.levelBefore ? `<span class="up">(up from ${d.levelBefore})</span>` : ''} · composite ${lvl.score}</p>
    ${d.rec ? `<h3>Your next lesson</h3>${lessonCard(d.rec.lesson, d.rec.reason)}` : ''}
    <div class="modal-actions">
      <button class="btn ghost" data-act="review">Review chart</button>
      ${d.rec ? `<button class="btn" data-act="lesson" data-v="${d.rec.lesson.id}">Mark lesson read</button>` : ''}
      <button class="btn primary" data-act="new">New round</button>
    </div>`;
}

export function lessonsView(p: Profile, rec: Recommendation | null) {
  const lvl = level(p);
  const rounds = p.rounds.slice(-8).reverse();
  return `
    <section class="card full">
      <h3>Rank</h3>
      <p class="level-title">${lvl.name}</p>
      <p class="muted">${p.rounds.length ? `Composite ${lvl.score} after ${p.rounds.length} round${p.rounds.length === 1 ? '' : 's'}.` : 'Play a round to get your first assessment.'}
        ${lvl.next ? `Next rank: <b>${lvl.next.name}</b> at ${lvl.next.min}, after at least ${lvl.next.rounds} rounds with trades.` : 'Top rank reached.'}</p>
      <div class="meter" style="height:8px"><span style="width:${Math.round(Math.min(1, Math.max(0, lvl.progress)) * 100)}%"></span></div>
      <p class="hint">${LEVELS.map((l) => l.name).join(' → ')}</p>
    </section>
    <section class="card">
      <h3>Skills</h3>
      ${SKILLS.map((sk) => {
        const r = p.ratings[sk.id];
        const tr = skillTrend(p, sk.id);
        const arrow = tr === null ? '' : tr > 3 ? `<span class="up">▲ ${tr}</span>` : tr < -3 ? `<span class="down">▼ ${-tr}</span>` : '<span class="muted">steady</span>';
        return `<div class="skill-row"><span title="${esc(sk.blurb)}">${sk.name}</span>
          <div class="meter">${r !== null ? `<span style="width:${r}%"></span>` : ''}</div>
          <span class="num">${r ?? '<span class="muted">n/a</span>'} ${arrow}</span></div>`;
      }).join('')}
      <p class="hint">Ratings are a moving average, so one lucky or unlucky round can't swing them much. Arrows compare your last 3 rounds with the 3 before.</p>
    </section>
    <section class="card">
      <h3>Recommended now</h3>
      ${rec ? lessonCard(rec.lesson, rec.reason) + `<div class="modal-actions"><button class="btn" data-act="lesson" data-v="${rec.lesson.id}">Mark as read</button></div>` : '<p class="muted">Finish a round with at least one trade to get a lesson matched to your weakest skill.</p>'}
    </section>
    <section class="card full lesson-list">
      <h3>All lessons</h3>
      ${LESSONS.map(
        (l) => `<details data-lesson="${l.id}"><summary><span>${esc(l.title)}</span>
          <span class="muted">${SKILLS.find((s) => s.id === l.skill)!.name} · ${l.tier}${l.id in p.lessonsSeen ? ' · read' : ''}${rec?.lesson.id === l.id ? ' · <span class="rec">recommended</span>' : ''}</span></summary>
          ${l.body.map((b) => `<p>${esc(b)}</p>`).join('')}<p class="challenge"><b>Challenge:</b> ${esc(l.challenge)}</p></details>`,
      ).join('')}
    </section>
    <section class="card full">
      <h3>Recent rounds</h3>
      ${
        rounds.length
          ? `<table class="plain num"><thead><tr><th>When</th><th>Mode</th><th>Stock</th><th class="r">Return</th><th class="r">Buy &amp; hold</th><th class="r">Trades</th></tr></thead><tbody>
        ${rounds
          .map(
            (r) =>
              `<tr><td>${new Date(r.at).toLocaleString()}</td><td>${MODES[r.mode].short}</td><td>${esc(r.symbol)}</td><td class="r ${tone(r.ret)}">${pct(r.ret, 2)}</td><td class="r ${tone(r.buyHold)}">${pct(r.buyHold, 2)}</td><td class="r">${r.trades}</td></tr>`,
          )
          .join('')}</tbody></table>`
          : '<p class="muted">No rounds yet.</p>'
      }
      <p class="hint"><button class="btn small ghost" data-act="reset-progress">Reset progress</button></p>
    </section>`;
}

/** The War Room's half of Lessons & Progress. */
export function warLessonsView(p: WarProfile) {
  const rec = recommendWar(p);
  const rounds = p.rounds.slice(-6).reverse();
  const objective = (id: string) => p.objectives[id];
  return `
    <section class="card full war-progress">
      <h3>War Room</h3>
      <div class="war-progress-grid">
        <div>
          <h4>Skills</h4>
          ${WAR_SKILLS.map((k) => {
            const r = p.ratings[k.id];
            return `<div class="skill-row"><span title="${esc(k.blurb)}">${k.name}</span><div class="meter">${r !== null ? `<span style="width:${r}%"></span>` : ''}</div><span class="num">${r ?? '<span class="muted">n/a</span>'}</span></div>`;
          }).join('')}
          <p class="hint">Separate from your Simulator rank for now. Each crisis updates them as a moving average.</p>
        </div>
        <div>
          <h4>Recommended now</h4>
          ${
            rec
              ? `<div class="lesson-card"><div class="tier">${WAR_SKILLS.find((k) => k.id === rec.skill)!.name}</div><h4>${esc(rec.title)}</h4>${rec.body.map((b) => `<p>${esc(b)}</p>`).join('')}<p class="challenge"><b>Objective next crisis:</b> ${esc(rec.objective.text)}</p></div>`
              : '<p class="muted">Finish a War Room crisis with at least one trade to get a lesson matched to your weakest War Room skill.</p>'
          }
        </div>
      </div>
      <div class="lesson-list">
        ${WAR_LESSONS.map((l) => {
          const o = objective(l.id);
          return `<details><summary><span>${esc(l.title)}</span><span class="muted">${WAR_SKILLS.find((k) => k.id === l.skill)!.name}${o ? ` · objective ${o.passes}/${o.attempts}` : ''}${rec?.id === l.id ? ' · <span class="rec">recommended</span>' : ''}</span></summary>
            ${l.body.map((b) => `<p>${esc(b)}</p>`).join('')}<p class="challenge"><b>Objective:</b> ${esc(l.objective.text)}</p></details>`;
        }).join('')}
      </div>
      ${
        rounds.length
          ? `<h4>Recent crises</h4><table class="plain num"><thead><tr><th>When</th><th>Crisis</th><th class="r">You</th><th class="r">World Index</th><th>Your note</th></tr></thead><tbody>
            ${rounds.map((r) => `<tr><td>${new Date(r.at).toLocaleDateString()}</td><td>${esc(r.crisis)}</td><td class="r ${tone(r.ret)}">${pct(r.ret, 1)}</td><td class="r ${tone(r.world)}">${pct(r.world, 1)}</td><td class="note">${r.note ? esc(r.note) : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody></table>`
          : ''
      }
    </section>`;
}

export interface TodayData {
  asOf: string;
  spy: { last: number; d1: number; m1: number; vol20: number; vol1y: number };
  sectors: { name: string; etf: string; d1: number; m1: number }[];
  intraday: number[];
}

export function today(t: TodayData) {
  const sorted = [...t.sectors].sort((a, b) => b.m1 - a.m1);
  const lead = sorted[0];
  const lag = sorted[sorted.length - 1];
  const vs = t.spy.vol20 > t.spy.vol1y * 1.2 ? 'more volatile than' : t.spy.vol20 < t.spy.vol1y * 0.8 ? 'calmer than' : 'about as volatile as';
  const max = Math.max(...t.sectors.map((s) => Math.abs(s.m1)), 1);
  return `
    <div class="card">
      <h3>Market summary</h3>
      <p class="muted" style="margin-top:0">As of ${esc(t.asOf)} (your last data refresh)</p>
      <div class="spark-row"><span>S&amp;P 500 (SPY)</span>${spark(t.intraday, t.intraday.length, 0)}<span class="v num ${tone(t.spy.d1)}">${pct(t.spy.d1)}</span></div>
      <p>SPY closed at <b class="num">${t.spy.last.toFixed(2)}</b>, <span class="${tone(t.spy.d1)}">${pct(t.spy.d1)}</span> on the day and
        <span class="${tone(t.spy.m1)}">${pct(t.spy.m1)}</span> over the past month.</p>
      <p>Over the last 20 days the market has moved at an annualized volatility of <b class="num">${t.spy.vol20.toFixed(0)}%</b>, against
        <b class="num">${t.spy.vol1y.toFixed(0)}%</b> over the past year, so it is <b>${vs}</b> usual.</p>
      <p>Leading sector this month: <b>${lead.name}</b> <span class="up">${pct(lead.m1)}</span>. Lagging: <b>${lag.name}</b> <span class="${tone(lag.m1)}">${pct(lag.m1)}</span>.</p>
    </div>
    <div class="card">
      <h3>Sectors · 1 month</h3>
      ${sorted
        .map((s) => {
          const w = (Math.abs(s.m1) / max) * 50;
          const pos = s.m1 >= 0 ? `left:50%;width:${w}%;background:var(--up)` : `right:50%;width:${w}%;background:var(--down)`;
          return `<div class="sector-row"><span>${esc(s.name)} <span class="muted">${s.etf}</span></span>
            <div class="bar-track"><span style="${pos}"></span></div><span class="num ${tone(s.m1)}" style="text-align:right">${pct(s.m1)}</span></div>`;
        })
        .join('')}
      <p class="hint">Day change: ${t.sectors.map((s) => `${s.etf} <span class="${tone(s.d1)}">${pct(s.d1)}</span>`).join(' · ')}</p>
    </div>
    <div class="card">
      <h3>Why is it moving?</h3>
      <p class="muted" style="margin:0">Live headlines and event explanations are next on the roadmap. For now this panel shows the price action itself. Run <code>npm run fetch-data</code> to refresh it.</p>
    </div>`;
}
