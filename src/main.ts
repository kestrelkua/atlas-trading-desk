import './styles.css';
import { LineStyle } from 'lightweight-charts';
import { Account, type Trade } from './account';
import { ChartView, css, indexOf, timeOf, type Overlay } from './chart';
import { liquidityZones, readContext, tagById } from './context';
import { MODES, buildScenario, loadManifest, loadSeries } from './data';
import { buildCalendar, generateNews, makeBriefing, type Briefing, type CalendarEvent, type NewsItem } from './events';
import { Indicators } from './indicators';
import { LESSONS, type RoundFacts } from './lessons';
import { REACTION_BARS, explainGrade, gradeCall, type Choice, type NewsCall } from './news';
import { level, loadProfile, markLessonSeen, recommend, recordObjective, recordRound, resetProfile, saveProfile } from './profile';
import { Replay } from './replay';
import { scoreRound } from './skills';
import { TUTORIAL_CHART, TUTORIAL_NEWS_BAR, Tutorial, tutorialResult } from './tutorial';
import { WarRoom } from './war';
import { loadWarProfile, resetWarProfile } from './warlearn';
import type { Bar, Mode, Raw, Scenario } from './types';
import * as ui from './ui';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

type Phase = 'loading' | 'briefing' | 'playing' | 'paused' | 'done';
type Size = number | 'risk';
type Tool = 'level' | 'trend' | 'swing';

const START_EQUITY = 100_000;
const DECISION_SECONDS = 10;

const state = {
  mode: 'daily' as Mode,
  phase: 'loading' as Phase,
  s: null as Scenario | null,
  ind: null as Indicators | null,
  news: [] as NewsItem[],
  calendar: [] as CalendarEvent[],
  brief: null as Briefing | null,
  replay: null as Replay | null,
  acct: new Account(START_EQUITY),
  price: 0,
  cur: 0,
  levels: [] as number[],
  tool: null as Tool | null,
  trendStart: null as { i: number; price: number } | null,
  swings: 0,
  swingBeforeFirstTrade: false,
  bias: null as string | null,
  tags: new Set<string>(),
  size: 0.25 as Size,
  stopAtr: 1.5 as number | null,
  targetAtr: 3 as number | null,
  speed: 2,
  showLiquidity: false,
  calls: [] as NewsCall[],
  pending: null as { item: NewsItem; resume: boolean; timer: number } | null,
  earningsSeen: 0,
  earningsFlat: 0,
  profile: loadProfile(),
};

const chart = new ChartView($('#chart-main'), $('#chart-macd'));
const war = new WarRoom();

const tutorial = new Tutorial({
  resume: () => {
    if (state.phase !== 'playing' && state.phase !== 'done' && !state.pending) {
      setPhase('playing');
      state.replay?.play();
    }
  },
  pause: () => {
    if (state.phase === 'playing') {
      state.replay?.pause();
      setPhase('paused');
    }
  },
  setTool: (t) => setTool(t, true),
  guideLine: (show) => {
    const s = state.s!;
    const hi = Math.max(...s.bars.slice(s.pre - 30, s.pre).map((b) => b.h));
    chart.setLine('guide', show ? hi : null, { color: css('--ink-3'), title: 'Draw here', style: LineStyle.LargeDashed });
  },
  openCalendar: (open) => toggleCalendar(open),
  setTicket: () => {
    Object.assign(state, { size: 0.25, stopAtr: 1.5, targetAtr: null });
    renderOrder();
  },
  hasOpenTrade: () => state.acct.open !== null,
  equity: () => state.acct.equity(state.price),
  skip: () => finishTutorial(),
  refresh: () => {
    renderOrder();
    setPhaseBanner();
  },
});

// ---------- Round lifecycle ----------

async function newRound(opts: { tutorial?: boolean } = {}) {
  state.replay?.pause();
  clearDecision();
  $('#debrief').hidden = true;
  toggleCalendar(false);
  setPhase('loading');
  let s: Scenario;
  try {
    s = opts.tutorial ? await buildScenario('daily', TUTORIAL_CHART) : await buildScenario(state.mode);
  } catch (e) {
    $('#inst-name').textContent = 'Could not load market data';
    $('#inst-meta').textContent = (e as Error).message;
    return;
  }
  const ind = new Indicators(s.bars);
  // In the tutorial, the scripted part gets one hand-placed headline; the free part keeps its real events.
  const freeFrom = opts.tutorial ? s.pre + TUTORIAL_NEWS_BAR + 12 : 0;
  const calendar = buildCalendar(s, ind).filter((e) => e.idx >= freeFrom);
  let news = generateNews(s, ind, calendar);
  if (opts.tutorial) {
    news = news.filter((n) => n.idx >= freeFrom);
    news.unshift({ idx: s.pre + TUTORIAL_NEWS_BAR, headline: `${s.alias.name} wins a major new contract; analysts call it "a clean beat"`, tone: 'bull', kind: 'move' });
  }
  Object.assign(state, {
    s,
    ind,
    calendar,
    news,
    brief: makeBriefing(s, ind),
    acct: new Account(START_EQUITY),
    levels: [],
    bias: null,
    tool: null,
    trendStart: null,
    swings: 0,
    swingBeforeFirstTrade: false,
    calls: [],
    earningsSeen: 0,
    earningsFlat: 0,
    cur: s.pre - 1,
    price: s.bars[s.pre - 1].c,
  });
  state.tags.clear();
  setTool(null, true);
  chart.reset(s.bars, ind.points, s.pre, s.labels, s.ticks);
  state.replay = new Replay(s.bars, s.pre, handlers);
  setSpeed(opts.tutorial ? 2 : state.speed);
  $('#wire').innerHTML = '<li class="muted">Headlines appear here as the round plays.</li>';
  setPhase('briefing');
  renderAll();
  drawLiquidity();
  if (opts.tutorial) tutorial.start();
  setPhaseBanner();
}

const handlers = {
  onBarOpen(i: number) {
    state.cur = i;
    const s = state.s!;
    if (i === s.pre) renderOrder();
    for (const e of state.calendar) {
      if (e.announceIdx === i && e.idx > i + 1) toast(`Calendar: ${e.title} announced for ${s.labels[e.idx].split(' · ')[0]}.`);
      if (e.idx === i + 1) toast(`${e.title} next bar. Hold through it, reduce risk, or stay out?`);
      if (e.idx === i && e.kind === 'earnings') {
        state.earningsSeen++;
        if (!state.acct.open) state.earningsFlat++;
      }
    }
    for (const n of state.news) if (n.idx === i) revealNews(n);
  },
  onTick(i: number, bar: Bar) {
    state.cur = i;
    state.price = bar.c;
    chart.update(i, bar, state.ind!.at(i, bar.c));
    const hit = state.acct.mark(bar.c);
    if (hit) closePosition(hit);
    renderQuote();
    renderAccount();
    refreshOrderNumbers();
  },
  onBarClose(i: number) {
    const s = state.s!;
    for (const c of state.calls) if (!c.grade && c.resolveAt === i) resolveCall(c, s.bars[i].c);
    renderProgress();
    renderContext();
    renderCalendar();
    renderObjective();
    if (state.showLiquidity) drawLiquidity();
    tutorial.barClosed(i - s.pre);
  },
  onEnd() {
    if (state.acct.open) closePosition('end');
    for (const c of state.calls) if (!c.grade) resolveCall(c, state.price);
    finishRound();
  },
};

function roundFacts(): RoundFacts {
  return {
    trades: [...state.acct.closed, ...(state.acct.open ? [state.acct.open] : [])],
    calls: state.calls,
    swingBeforeFirstTrade: state.swingBeforeFirstTrade,
    earningsSeen: state.earningsSeen,
    earningsFlat: state.earningsFlat,
  };
}

function finishRound() {
  const s = state.s!;
  setPhase('done');
  renderQuote();
  if (tutorial.active) {
    const freeTrades = state.acct.closed.filter((t) => t.entryIdx >= s.pre + TUTORIAL_NEWS_BAR + 12).length;
    $('#debrief .modal-card').innerHTML = tutorialResult(s, state.acct.equity(state.price) - tutorial.freeStartEquity, freeTrades, ui.money);
    $('#debrief').hidden = false;
    tutorial.stop();
    return;
  }
  const trades = state.acct.closed;
  const scores = scoreRound(trades, state.calls, s.bars.length - s.pre, START_EQUITY);
  const before = { ...state.profile.ratings };
  const levelBefore = level(state.profile).name;
  const placement = state.profile.rounds.length === 0;
  const active = recommend(state.profile);
  const objective = active ? { lesson: active.lesson, status: active.lesson.objective(roundFacts()) } : null;
  if (objective && !placement) recordObjective(state.profile, objective.lesson.id, objective.status.done);
  recordRound(state.profile, {
    at: new Date().toISOString(),
    mode: s.mode,
    symbol: s.symbol,
    ret: (state.acct.equity(state.price) / START_EQUITY - 1) * 100,
    buyHold: (s.bars[s.bars.length - 1].c / s.bars[s.pre].o - 1) * 100,
    trades: trades.length,
    scores,
  });
  renderLevelBadge();
  $('#debrief .modal-card').innerHTML = ui.debrief({
    s,
    acct: state.acct,
    price: state.price,
    bias: state.bias,
    scores,
    before,
    profile: state.profile,
    rec: recommend(state.profile),
    levelBefore,
    calls: state.calls,
    objective: placement ? null : objective,
    placement,
  });
  $('#debrief').hidden = false;
}

function setPhase(p: Phase) {
  state.phase = p;
  setPhaseBanner();
  $('#play').textContent = { loading: 'Start', briefing: 'Start', playing: 'Pause', paused: 'Resume', done: 'New round' }[p];
  ($('#play') as HTMLButtonElement).disabled = p === 'loading';
  ($('#step') as HTMLButtonElement).disabled = p === 'loading' || p === 'done';
  renderBriefing();
  renderOrder();
}

function togglePlay() {
  const r = state.replay;
  if (!r || state.pending) return;
  if (state.phase === 'done') return void (tutorial.active || newRound());
  if (!tutorial.allows('play')) return;
  if (state.phase === 'briefing' || state.phase === 'paused') {
    setPhase('playing');
    r.play();
    tutorial.emit('start');
  } else if (state.phase === 'playing') {
    r.pause();
    setPhase('paused');
  }
}

function step() {
  const r = state.replay;
  if (!r || state.pending || state.phase === 'done' || state.phase === 'loading' || !tutorial.allows('play')) return;
  if (state.phase !== 'paused') {
    r.pause();
    setPhase('paused');
  }
  r.stepBar();
}

// ---------- Trading ----------

const canTrade = () =>
  (state.phase === 'playing' || state.phase === 'paused') && state.cur >= (state.s?.pre ?? Infinity) && tutorial.allows('trade');
const atrNow = () => state.ind!.atr[Math.max(0, state.cur - 1)];

function stopFor(dir: 1 | -1, atrMult: number | null) {
  return atrMult === null ? undefined : state.price - dir * atrMult * atrNow();
}

function sizeFor(dir: 1 | -1): number {
  const eq = state.acct.equity(state.price);
  const max = Math.floor(eq / state.price);
  if (state.size === 'risk') {
    const stop = stopFor(dir, state.stopAtr);
    if (stop === undefined) return 0;
    return Math.min(max, Math.floor((eq * 0.01) / Math.abs(state.price - stop)));
  }
  return Math.floor((eq * state.size) / state.price);
}

function enter(dir: 1 | -1, viaNews = false) {
  if ((!canTrade() && !viaNews) || state.acct.open) return;
  if (viaNews) state.tags.add('news');
  if (!state.tags.size) {
    const chips = $('#chips');
    chips?.classList.remove('shake');
    void chips?.offsetWidth;
    chips?.classList.add('shake');
    toast('Pick at least one reason first. Good reasons make good results.');
    return;
  }
  const qty = sizeFor(dir);
  if (qty < 1) {
    toast(state.size === 'risk' ? '1% risk sizing needs a stop.' : 'Position size is too small.');
    return;
  }
  const s = state.s!;
  const i = state.cur;
  const ctx = readContext(state.ind!, s.bars, i, state.price, state.levels, state.news.map((n) => n.idx).filter((x) => x <= i));
  const tags = [...state.tags];
  const stop = stopFor(dir, state.stopAtr);
  const target = state.targetAtr === null ? undefined : state.price + dir * state.targetAtr * atrNow();
  if (!state.acct.closed.length) state.swingBeforeFirstTrade = state.swings > 0;
  const t = state.acct.enter(
    {
      dir,
      qty,
      entryIdx: i,
      stop,
      target,
      stopAtEntry: stop !== undefined,
      tags,
      verified: Object.fromEntries(tags.map((id) => [id, tagById(id).check(ctx, dir)])),
      ctx,
      atr: atrNow(),
      afterNews: ctx.newsRecent,
    },
    state.price,
  );
  chart.addMarker('trades', {
    time: timeOf(i),
    position: dir === 1 ? 'belowBar' : 'aboveBar',
    shape: dir === 1 ? 'arrowUp' : 'arrowDown',
    color: css(dir === 1 ? '--up' : '--down'),
    text: `${dir === 1 ? 'L' : 'S'}${t.id}`,
  });
  const missed = tags.filter((id) => !t.verified[id]).map((id) => tagById(id).label);
  if (missed.length && !tutorial.active) toast(`Not confirmed on the chart: ${missed.join(', ')}. Hover a reason to see its rule.`);
  state.tags.clear();
  afterTradeChange();
  tutorial.emit('trade-open');
}

function closePosition(reason: Trade['exitReason']) {
  if (reason === 'manual' && !tutorial.allows('close') && !tutorial.allows('trade')) return;
  const t = state.acct.exit(state.price, state.cur, reason);
  if (!t) return;
  chart.addMarker('trades', {
    time: timeOf(state.cur),
    position: t.dir === 1 ? 'aboveBar' : 'belowBar',
    shape: 'circle',
    color: css(t.pnl! >= 0 ? '--up' : '--down'),
    text: `×${t.id}`,
  });
  if (reason === 'stop' || reason === 'target') toast(`${reason === 'stop' ? 'Stopped out' : 'Target hit'}: ${ui.money(t.pnl!)}`);
  afterTradeChange();
  tutorial.emit('trade-close');
}

function adjustStop(kind: 'be' | 'trail' | 'tighten' | 'loosen' | 'addstop') {
  const t = state.acct.open;
  if (!t || !tutorial.allows('manage')) return;
  const atr = atrNow();
  let next = t.stop;
  if (kind === 'be') next = t.entryPrice;
  if (kind === 'addstop') next = state.price - t.dir * 1.5 * atr;
  if (kind === 'trail') {
    const trail = state.price - t.dir * atr;
    if (t.stop === undefined || t.dir * (trail - t.stop) > 0) next = trail;
    else return toast('Trailing stop is already tighter than 1 ATR.');
  }
  if (kind === 'tighten' || kind === 'loosen') {
    if (t.stop === undefined) return toast('No stop set yet.');
    next = t.stop + (kind === 'tighten' ? 1 : -1) * t.dir * 0.25 * atr;
  }
  if (next !== undefined && t.dir * (state.price - next) <= 0) return toast('That stop would trigger immediately.');
  t.stop = next;
  if (kind === 'trail') t.trailed = true;
  afterTradeChange();
  tutorial.emit(`stop:${kind}`);
}

function afterTradeChange() {
  drawPositionLines();
  renderAccount();
  renderOrder();
  renderJournal();
  renderObjective();
}

function drawPositionLines() {
  const t = state.acct.open;
  chart.setLine('entry', t ? t.entryPrice : null, { color: css('--accent'), title: 'Entry' });
  chart.setLine('stop', t?.stop ?? null, { color: css('--down'), title: 'Stop', style: LineStyle.Dashed });
  chart.setLine('target', t?.target ?? null, { color: css('--up'), title: 'Target', style: LineStyle.Dashed });
}

// ---------- News decisions ----------

function revealNews(n: NewsItem) {
  const wire = $('#wire');
  wire.querySelector('.muted')?.remove();
  wire.insertAdjacentHTML('beforeend', ui.wireItem(n, state.s!.labels[n.idx]));
  chart.addMarker('news', { time: timeOf(n.idx), position: 'aboveBar', shape: 'square', color: css('--gold'), text: 'N' });
  if (state.phase === 'playing' || state.phase === 'paused') showDecision(n);
}

function showDecision(n: NewsItem) {
  const wasPlaying = state.phase === 'playing';
  if (wasPlaying) {
    state.replay!.pause();
    setPhase('paused');
  }
  const timed = !tutorial.active || tutorial.free;
  const el = $('#decision');
  el.className = `decision ${n.kind === 'wild' ? '' : n.tone}`;
  el.innerHTML = ui.decision(n, state.acct.open, timed);
  el.hidden = false;
  state.pending = { item: n, resume: wasPlaying, timer: 0 };
  setPhaseBanner();
  ($('#play') as HTMLButtonElement).disabled = true;
  ($('#step') as HTMLButtonElement).disabled = true;
  if (timed) {
    const bar = el.querySelector<HTMLElement>('.timer span')!;
    bar.style.transition = `width ${DECISION_SECONDS}s linear`;
    requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.width = '0%')));
    state.pending.timer = window.setTimeout(() => decide(state.acct.open ? 'hold' : 'out', true), DECISION_SECONDS * 1000);
  }
  tutorial.emit('news-shown');
}

function decide(choice: Choice, timedOut = false) {
  const p = state.pending;
  if (!p || (!timedOut && !tutorial.allows('decide'))) return;
  const s = state.s!;
  const open = state.acct.open;
  clearDecision();
  state.calls.push({
    idx: p.item.idx,
    kind: p.item.kind,
    headline: p.item.headline,
    choice,
    timedOut,
    price: state.price,
    atr: atrNow(),
    posDir: open ? open.dir : 0,
    resolveAt: Math.min(s.bars.length - 1, p.item.idx + REACTION_BARS[s.mode]),
  });
  if (choice === 'long') enter(1, true);
  if (choice === 'short') enter(-1, true);
  if (choice === 'close') closePosition('manual');
  setWireCall(p.item.idx, `Your call: ${({ long: 'went long', short: 'went short', out: 'stayed out', hold: 'held', close: 'closed' })[choice]}${timedOut ? ' (time ran out)' : ''}…`);
  renderObjective();
  tutorial.emit('news-decided');
  if (p.resume && state.phase === 'paused' && !(tutorial.active && !tutorial.free)) {
    setPhase('playing');
    state.replay!.play();
  } else setPhase(state.phase);
}

function clearDecision() {
  if (state.pending) clearTimeout(state.pending.timer);
  state.pending = null;
  $('#decision').hidden = true;
}

function resolveCall(c: NewsCall, price: number) {
  gradeCall(c, price);
  setWireCall(c.idx, explainGrade(c, c.resolveAt - c.idx));
  renderObjective();
}

function setWireCall(idx: number, text: string) {
  const li = document.querySelector(`#wire li[data-idx="${idx}"]`);
  if (!li) return;
  let span = li.querySelector('.call');
  if (!span) li.insertAdjacentHTML('beforeend', '<span class="call"></span>');
  span = li.querySelector('.call')!;
  span.textContent = text;
}

// ---------- Drawing tools ----------

function setTool(tool: Tool | null, force = false) {
  if (!force && !tutorial.allows('tool')) return;
  state.tool = !force && state.tool === tool ? null : tool;
  state.trendStart = null;
  document.querySelectorAll<HTMLButtonElement>('#tool-seg button').forEach((b) => b.classList.toggle('active', b.dataset.tool === state.tool));
  $('.chart-wrap').classList.toggle('tool-active', state.tool !== null);
  if (state.tool === 'trend') toast('Trend line: click the first point.');
}

chart.main.subscribeClick((param) => {
  if (!state.tool || !param.point || !state.s) return;
  const price = chart.candles.coordinateToPrice(param.point.y);
  if (state.tool === 'level') {
    if (price === null) return;
    state.levels.push(price);
    chart.setLine(`lvl-${state.levels.length}`, price, { color: css('--gold'), title: 'Level', style: LineStyle.Dotted });
    renderBriefing();
    tutorial.emit('level');
    return;
  }
  if (param.time === undefined) return;
  const i = indexOf(param.time);
  if (i > state.cur) return;
  if (state.tool === 'trend') {
    if (price === null) return;
    if (!state.trendStart) {
      state.trendStart = { i, price };
      toast('Now click the second point.');
    } else {
      chart.addTrendLine(state.trendStart, { i, price });
      state.trendStart = null;
      setPhaseBanner();
    }
    return;
  }
  const b = state.s.bars[i];
  const mid = chart.candles.priceToCoordinate((b.h + b.l) / 2) ?? 0;
  const high = param.point.y < mid;
  state.swings++;
  chart.addMarker('swings', {
    time: param.time,
    position: high ? 'aboveBar' : 'belowBar',
    shape: 'circle',
    color: css('--ink-2'),
    text: high ? 'H' : 'L',
  });
});

function clearMarks() {
  for (const k of chart.lineKeys('lvl-')) chart.setLine(k, null, { color: '', title: '' });
  state.levels = [];
  state.swings = 0;
  chart.clearMarkers('swings');
  chart.clearTrendLines();
  renderBriefing();
}

function drawLiquidity() {
  for (const k of chart.lineKeys('liq-')) chart.setLine(k, null, { color: '', title: '' });
  if (!state.showLiquidity || !state.s) return;
  const zones = liquidityZones(state.s.bars, state.cur + 1, atrNow());
  zones.forEach((z, k) =>
    chart.setLine(`liq-${k}`, z.price, {
      color: css(z.kind === 'volume' ? '--plum' : '--ink-3'),
      title: z.kind === 'volume' ? 'High volume' : 'Stops',
      style: LineStyle.SparseDotted,
    }),
  );
}

// ---------- Calendar ----------

function toggleCalendar(open?: boolean) {
  const panel = $('#cal-panel');
  const show = open ?? panel.hidden;
  panel.hidden = !show;
  $('#cal-btn').setAttribute('aria-expanded', String(show));
  if (show) renderCalendar();
}

function renderCalendar() {
  const s = state.s;
  if (!s) return;
  $('#cal-btn').textContent = `Calendar · ${ui.announcedAhead(state.calendar, state.cur)} ahead`;
  $('#pins').innerHTML = ui.pins(state.calendar, s, state.cur);
  if (!$('#cal-panel').hidden) $('#cal-panel').innerHTML = ui.calendar(state.calendar, s, state.cur);
}

// ---------- Rendering ----------

function renderAll() {
  renderQuote();
  renderProgress();
  renderBriefing();
  renderContext();
  renderAccount();
  renderOrder();
  renderJournal();
  renderCalendar();
  renderObjective();
  renderLevelBadge();
}

function renderQuote() {
  const s = state.s;
  if (!s) return;
  const done = state.phase === 'done';
  $('#inst-name').innerHTML = `${s.alias.name}<span class="tk">${s.alias.ticker}</span>`;
  $('#inst-meta').textContent = `${s.sector} · ${MODES[s.mode].label}${done ? ` · revealed: ${s.symbol}, ${s.startDate} to ${s.endDate}` : ' · identity hidden until the end'}`;
  const base = s.bars[s.pre - 1].c;
  const chg = (state.price / base - 1) * 100;
  $('#price').textContent = state.price.toFixed(2);
  $('#change').innerHTML = `<span class="${ui.tone(chg)}">${ui.pct(chg, 2)}</span> <span class="muted">since start</span>`;
}

function renderProgress() {
  const s = state.s;
  if (!s) return;
  const total = s.bars.length - s.pre;
  const played = Math.max(0, Math.min(total, state.cur - s.pre + 1));
  $('#progress-bar').style.width = `${(played / total) * 100}%`;
  $('#clock').textContent = `${s.labels[state.cur]} · bar ${played} of ${total}`;
}

function renderBriefing() {
  if (!state.s || !state.brief) return;
  $('#briefing').innerHTML = ui.briefing(state.s, state.brief, { phase: state.phase, bias: state.bias, levels: state.levels.length });
}

function renderContext() {
  if (state.s) $('#context').innerHTML = ui.context(state.s, state.cur);
}

function renderAccount() {
  $('#account').innerHTML = ui.account(state.acct, state.price, state.s);
}

function renderOrder() {
  $('#order').innerHTML = ui.order({
    open: state.acct.open,
    canTrade: canTrade(),
    size: state.size,
    stopAtr: state.stopAtr,
    targetAtr: state.targetAtr,
    tags: state.tags,
  });
  refreshOrderNumbers();
}

function refreshOrderNumbers() {
  if (!state.s || state.acct.open) return;
  const sizeEl = document.getElementById('size-info');
  if (!sizeEl) return;
  const qty = sizeFor(1);
  sizeEl.textContent = qty ? `${qty.toLocaleString()} sh · ${ui.money(qty * state.price)}` : state.size === 'risk' ? 'needs a stop' : '';
  const atr = atrNow();
  const s = state.stopAtr;
  const t = state.targetAtr;
  $('#stop-px').textContent = s ? `±${(s * atr).toFixed(2)} · L ${(state.price - s * atr).toFixed(2)} / S ${(state.price + s * atr).toFixed(2)}` : 'none';
  $('#target-px').textContent = t ? `±${(t * atr).toFixed(2)}${s ? ` · ${(t / s).toFixed(1)}R` : ''}` : 'none';
}

function renderJournal() {
  const trades = [...state.acct.closed, ...(state.acct.open ? [state.acct.open] : [])];
  $('#journal').innerHTML = ui.journal(trades, state.s?.labels ?? []);
}

function renderObjective() {
  const el = $('#objective');
  const rec = tutorial.active ? null : recommend(state.profile);
  el.hidden = !rec;
  if (rec) el.innerHTML = ui.objective(rec.lesson, rec.lesson.objective(roundFacts()), state.phase === 'done');
}

function renderLevelBadge() {
  const l = level(state.profile);
  $('#level-badge').innerHTML = state.profile.rounds.length ? `Rank <b>${l.name}</b> · ${l.score}` : 'Rank <b>Unranked</b>';
}

function renderLessons() {
  $('#view-lessons').innerHTML = ui.lessonsView(state.profile, recommend(state.profile)) + ui.warLessonsView(loadWarProfile());
}

let todayLoaded = false;
async function renderToday() {
  if (todayLoaded) return;
  const el = $('#desk-today');
  el.innerHTML = '<div class="card muted">Loading the latest snapshot…</div>';
  try {
    const m = await loadManifest();
    const spy = await loadSeries('daily', m.market);
    const intra = await loadSeries('intraday', m.market);
    const closes = (r: Raw[]) => r.map((x) => x[4]);
    const chg = (xs: number[], n: number) => (xs[xs.length - 1] / xs[xs.length - 1 - n] - 1) * 100;
    const vol = (xs: number[]) => {
      const r = xs.slice(1).map((c, i) => Math.log(c / xs[i]));
      const mu = r.reduce((a, b) => a + b, 0) / r.length;
      return Math.sqrt((r.reduce((a, b) => a + (b - mu) ** 2, 0) / (r.length - 1)) * 252) * 100;
    };
    const sc = closes(spy);
    const lastDay = Math.floor(intra[intra.length - 1][0] / 86400);
    const sectors = await Promise.all(
      Object.entries(m.sectors).map(async ([name, { etf }]) => {
        const c = closes(await loadSeries('daily', etf));
        return { name, etf, d1: chg(c, 1), m1: chg(c, 21) };
      }),
    );
    el.innerHTML = ui.today({
      asOf: new Date(spy[spy.length - 1][0] * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' }),
      spy: { last: sc[sc.length - 1], d1: chg(sc, 1), m1: chg(sc, 21), vol20: vol(sc.slice(-21)), vol1y: vol(sc.slice(-253)) },
      sectors,
      intraday: intra.filter((x) => Math.floor(x[0] / 86400) === lastDay).map((x) => x[4]),
    });
    todayLoaded = true;
  } catch (e) {
    el.innerHTML = `<div class="card">Could not load the snapshot: ${(e as Error).message}</div>`;
  }
}

let toastTimer = 0;
function toast(msg: string) {
  $('#phase-banner').textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(setPhaseBanner, 3200);
}

function setPhaseBanner() {
  const p = state.phase;
  // The tutorial's coach card does the talking during the scripted part.
  $('#phase-banner').hidden = tutorial.active && !tutorial.free;
  $('#phase-banner').textContent = state.pending
    ? 'Breaking news · make your call'
    : {
        loading: 'Charting new waters…',
        briefing: 'Warm-up · study the chart, draw levels, pick a bias, then press Start',
        playing: '',
        paused: 'Paused · you can still trade and adjust your stops',
        done: 'Round complete · the reveal is in',
      }[p];
}

// ---------- Tutorial ----------

function startTutorial() {
  document.querySelector<HTMLElement>('.tabs [data-view="sim"]')?.click();
  newRound({ tutorial: true });
}

function finishTutorial() {
  tutorial.stop();
  state.profile.tutorialDone = true;
  saveProfile(state.profile);
  newRound();
}

// ---------- Theme ----------

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(t: string) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem('atlas.theme', t);
  } catch {
    /* ignore */
  }
  chart.applyTheme();
  war.applyTheme();
  drawPositionLines();
  drawLiquidity();
  state.levels.forEach((p, i) => chart.setLine(`lvl-${i + 1}`, p, { color: css('--gold'), title: 'Level', style: LineStyle.Dotted }));
}
try {
  const saved = localStorage.getItem('atlas.theme');
  if (saved) {
    document.documentElement.dataset.theme = saved;
    chart.applyTheme();
  }
} catch {
  /* ignore */
}

// ---------- Events ----------

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  if (!target.closest('.cal-wrap') && !$('#cal-panel').hidden && !tutorial.active) toggleCalendar(false);
  const el = target.closest<HTMLElement>('[data-act]');
  if (target.closest('.tabs button')) {
    const view = target.closest<HTMLElement>('.tabs button')!.dataset.view!;
    if (view !== 'sim' && tutorial.active && !tutorial.free) return;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.view === view));
    $('#view-sim').hidden = view !== 'sim';
    $('#view-war').hidden = view !== 'war';
    $('#view-lessons').hidden = view !== 'lessons';
    if (view !== 'sim' && state.phase === 'playing') togglePlay();
    if (view !== 'war') war.pause();
    if (view === 'lessons') renderLessons();
    if (view === 'war') war.ensureStarted();
    return;
  }
  if (target.closest('[data-war-new]')) return war.newFromDebrief();
  const deskBtn = target.closest<HTMLElement>('[data-desk]');
  if (deskBtn) {
    const d = deskBtn.dataset.desk!;
    document.querySelectorAll('[data-desk]').forEach((b) => b.classList.toggle('active', b === deskBtn));
    $('#desk-scenario').hidden = d !== 'scenario';
    $('#desk-today').hidden = d !== 'today';
    if (d === 'today') renderToday();
    return;
  }
  const modeBtn = target.closest<HTMLElement>('[data-mode]');
  if (modeBtn) {
    if (!tutorial.allows('mode')) return;
    state.mode = modeBtn.dataset.mode as Mode;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === modeBtn));
    newRound();
    return;
  }
  const speedBtn = target.closest<HTMLElement>('[data-speed]');
  if (speedBtn) return setSpeed(Number(speedBtn.dataset.speed));
  const toolBtn = target.closest<HTMLElement>('[data-tool]');
  if (toolBtn) return setTool(toolBtn.dataset.tool as Tool);
  if (!el) return;

  const v = el.dataset.v;
  const num = (x: string | undefined) => (x === 'null' ? null : Number(x));
  switch (el.dataset.act) {
    case 'bias':
      if (!tutorial.allows('bias') && tutorial.active && !tutorial.free) return;
      state.bias = v!;
      renderBriefing();
      tutorial.emit('bias');
      break;
    case 'start':
      togglePlay();
      break;
    case 'size':
      state.size = v === 'risk' ? 'risk' : Number(v);
      if (state.size === 'risk' && state.stopAtr === null) state.stopAtr = 1.5;
      renderOrder();
      break;
    case 'stop':
      state.stopAtr = num(v);
      renderOrder();
      break;
    case 'target':
      state.targetAtr = num(v);
      renderOrder();
      break;
    case 'tag':
      state.tags.has(v!) ? state.tags.delete(v!) : state.tags.add(v!);
      el.classList.toggle('on', state.tags.has(v!));
      if (state.tags.has(v!)) tutorial.emit(`tag:${v}`);
      break;
    case 'buy':
      enter(1);
      break;
    case 'short':
      enter(-1);
      break;
    case 'close':
      closePosition('manual');
      break;
    case 'be':
    case 'trail':
    case 'tighten':
    case 'loosen':
    case 'addstop':
      adjustStop(el.dataset.act);
      break;
    case 'decide':
      decide(v as Choice);
      break;
    case 'review':
      war.saveNote();
      $('#debrief').hidden = true;
      break;
    case 'new':
      newRound();
      break;
    case 'tutorial-finish':
      finishTutorial();
      break;
    case 'lesson': {
      const l = LESSONS.find((x) => x.id === v);
      if (l) markLessonSeen(state.profile, l);
      el.textContent = 'Marked as read ✓';
      (el as HTMLButtonElement).disabled = true;
      break;
    }
    case 'reset-progress':
      if (confirm('Reset all rounds, ratings and lesson history, including the War Room?')) {
        resetProfile(true);
        resetWarProfile();
        state.profile = loadProfile();
        renderLessons();
        renderLevelBadge();
        renderObjective();
      }
      break;
  }
});

$('#play').addEventListener('click', togglePlay);
$('#step').addEventListener('click', step);
$('#new-round').addEventListener('click', () => tutorial.allows('new') && newRound());
$('#clear-marks').addEventListener('click', clearMarks);
$('#cal-btn').addEventListener('click', () => toggleCalendar());
$('#help-btn').addEventListener('click', () => {
  if (tutorial.active) return;
  if (state.phase === 'playing' || state.phase === 'paused') {
    if (!confirm('Replay the tutorial? This ends the current round.')) return;
  }
  startTutorial();
});
$('#theme-toggle').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
document.querySelectorAll<HTMLInputElement>('[data-overlay]').forEach((cb) =>
  cb.addEventListener('change', () => {
    if (cb.dataset.overlay === 'liquidity') {
      state.showLiquidity = cb.checked;
      drawLiquidity();
    } else chart.setOverlay(cb.dataset.overlay as Overlay, cb.checked);
  }),
);

function setSpeed(x: number) {
  if (state.replay && !tutorial.allows('speed') && tutorial.active) return;
  if (!tutorial.active) state.speed = x;
  if (state.replay) state.replay.speed = x;
  document.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === x));
}

document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).matches('input, textarea, select') || e.metaKey || e.ctrlKey) return;
  if ($('#view-sim').hidden) return;
  const k = e.key.toLowerCase();
  if (k === ' ') {
    e.preventDefault();
    togglePlay();
  } else if (k === 'arrowright') step();
  else if (k === 'b') enter(1);
  else if (k === 's') enter(-1);
  else if (k === 'x') closePosition('manual');
  else if (k === 'l') setTool('level');
  else if (k === 't') setTool('trend');
  else if (k === 'h') setTool('swing');
  else if (k === 'escape') {
    if (!$('#debrief').hidden && !tutorial.active) {
      war.saveNote();
      $('#debrief').hidden = true;
    }
    else if (state.tool) setTool(state.tool);
  } else if ('12345'.includes(k)) setSpeed([0.5, 1, 2, 4, 8][Number(k) - 1]);
});

if (state.profile.tutorialDone) newRound();
else startTutorial();

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { atlas: { state, chart } });
