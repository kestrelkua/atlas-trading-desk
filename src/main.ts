import './styles.css';
import { LineStyle } from 'lightweight-charts';
import { Account, type Trade } from './account';
import { ChartView, css, indexOf, timeOf, type Overlay } from './chart';
import { readContext, tagById } from './context';
import { MODES, buildScenario, loadManifest, loadSeries } from './data';
import { generateNews, makeBriefing, type Briefing, type NewsItem } from './events';
import { Indicators } from './indicators';
import { LESSONS } from './lessons';
import { level, loadProfile, markLessonSeen, recommend, recordRound, resetProfile } from './profile';
import { Replay } from './replay';
import { scoreRound } from './skills';
import type { Bar, Mode, Raw, Scenario } from './types';
import * as ui from './ui';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

type Phase = 'loading' | 'briefing' | 'playing' | 'paused' | 'done';
type Size = number | 'risk';

const START_EQUITY = 100_000;

const state = {
  mode: 'daily' as Mode,
  phase: 'loading' as Phase,
  s: null as Scenario | null,
  ind: null as Indicators | null,
  news: [] as NewsItem[],
  brief: null as Briefing | null,
  replay: null as Replay | null,
  acct: new Account(START_EQUITY),
  price: 0,
  cur: 0,
  levels: [] as number[],
  tool: null as 'level' | 'swing' | null,
  bias: null as string | null,
  tags: new Set<string>(),
  size: 0.25 as Size,
  stopAtr: 1.5 as number | null,
  targetAtr: 3 as number | null,
  speed: 2,
  profile: loadProfile(),
};

const chart = new ChartView($('#chart-main'), $('#chart-macd'));

// ---------- Round lifecycle ----------

async function newRound() {
  state.replay?.pause();
  $('#debrief').hidden = true;
  setPhase('loading');
  let s: Scenario;
  try {
    s = await buildScenario(state.mode);
  } catch (e) {
    $('#inst-name').textContent = 'Could not load market data';
    $('#inst-meta').textContent = (e as Error).message;
    return;
  }
  const ind = new Indicators(s.bars);
  Object.assign(state, {
    s,
    ind,
    news: generateNews(s, ind),
    brief: makeBriefing(s, ind),
    acct: new Account(START_EQUITY),
    levels: [],
    bias: null,
    tool: null,
    cur: s.pre - 1,
    price: s.bars[s.pre - 1].c,
  });
  state.tags.clear();
  chart.reset(s.bars, ind.points, s.pre, s.labels, s.ticks);
  state.replay = new Replay(s.bars, s.pre, handlers);
  state.replay.speed = state.speed;
  $('#wire').innerHTML = '<li class="muted">Headlines appear here as the round plays.</li>';
  setPhase('briefing');
  renderAll();
}

const handlers = {
  onBarOpen(i: number) {
    state.cur = i;
    if (i === state.s!.pre) renderOrder();
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
  onBarClose() {
    renderProgress();
    renderContext();
  },
  onEnd() {
    if (state.acct.open) closePosition('end');
    finishRound();
  },
};

function finishRound() {
  const s = state.s!;
  setPhase('done');
  const trades = state.acct.closed;
  const scores = scoreRound(trades, s.bars.length - s.pre, START_EQUITY);
  const before = { ...state.profile.ratings };
  const levelBefore = level(state.profile).name;
  recordRound(state.profile, {
    at: new Date().toISOString(),
    mode: s.mode,
    symbol: s.symbol,
    ret: (state.acct.equity(state.price) / START_EQUITY - 1) * 100,
    buyHold: (s.bars[s.bars.length - 1].c / s.bars[s.pre].o - 1) * 100,
    trades: trades.length,
    scores,
  });
  const rec = recommend(state.profile);
  renderQuote();
  renderLevelBadge();
  $('#debrief .modal-card').innerHTML = ui.debrief({
    s,
    acct: state.acct,
    price: state.price,
    bias: state.bias,
    scores,
    before,
    profile: state.profile,
    rec,
    levelBefore,
  });
  $('#debrief').hidden = false;
}

function setPhase(p: Phase) {
  state.phase = p;
  const banner = {
    loading: 'Charting new waters…',
    briefing: 'Warm-up · study the chart, draw levels, pick a bias, then press Start',
    playing: '',
    paused: 'Paused · you can still trade and adjust your stops',
    done: 'Round complete · the reveal is in',
  }[p];
  $('#phase-banner').textContent = banner;
  $('#play').textContent = { loading: 'Start', briefing: 'Start', playing: 'Pause', paused: 'Resume', done: 'New round' }[p];
  ($('#play') as HTMLButtonElement).disabled = p === 'loading';
  ($('#step') as HTMLButtonElement).disabled = p === 'loading' || p === 'done';
  renderBriefing();
  renderOrder();
}

function togglePlay() {
  const r = state.replay;
  if (!r) return;
  if (state.phase === 'briefing' || state.phase === 'paused') {
    setPhase('playing');
    r.play();
  } else if (state.phase === 'playing') {
    r.pause();
    setPhase('paused');
  } else if (state.phase === 'done') {
    newRound();
  }
}

function step() {
  const r = state.replay;
  if (!r || state.phase === 'done' || state.phase === 'loading') return;
  if (state.phase !== 'paused') {
    r.pause();
    setPhase('paused');
  }
  r.stepBar();
}

// ---------- Trading ----------

const canTrade = () => (state.phase === 'playing' || state.phase === 'paused') && state.cur >= (state.s?.pre ?? Infinity);
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

function enter(dir: 1 | -1) {
  if (!canTrade() || state.acct.open) return;
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
  if (missed.length) toast(`Not confirmed on the chart: ${missed.join(', ')}. Hover a reason to see its rule.`);
  state.tags.clear();
  afterTradeChange();
}

function closePosition(reason: Trade['exitReason']) {
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
}

function adjustStop(kind: 'be' | 'trail' | 'tighten' | 'loosen' | 'addstop') {
  const t = state.acct.open;
  if (!t) return;
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
  afterTradeChange();
}

function afterTradeChange() {
  drawPositionLines();
  renderAccount();
  renderOrder();
  renderJournal();
}

function drawPositionLines() {
  const t = state.acct.open;
  chart.setLine('entry', t ? t.entryPrice : null, { color: css('--accent'), title: 'Entry' });
  chart.setLine('stop', t?.stop ?? null, { color: css('--down'), title: 'Stop', style: LineStyle.Dashed });
  chart.setLine('target', t?.target ?? null, { color: css('--up'), title: 'Target', style: LineStyle.Dashed });
}

// ---------- Drawing tools ----------

function setTool(tool: typeof state.tool) {
  state.tool = state.tool === tool ? null : tool;
  document.querySelectorAll<HTMLButtonElement>('#tool-seg button').forEach((b) => b.classList.toggle('active', b.dataset.tool === state.tool));
  $('.chart-wrap').classList.toggle('tool-active', state.tool !== null);
}

chart.main.subscribeClick((param) => {
  if (!state.tool || !param.point || !state.s) return;
  if (state.tool === 'level') {
    const p = chart.candles.coordinateToPrice(param.point.y);
    if (p === null) return;
    state.levels.push(p);
    chart.setLine(`lvl-${state.levels.length}`, p, { color: css('--gold'), title: 'Level', style: LineStyle.Dotted });
    renderBriefing();
  } else if (param.time !== undefined) {
    const i = indexOf(param.time);
    if (i > state.cur) return;
    const b = state.s.bars[i];
    const mid = chart.candles.priceToCoordinate((b.h + b.l) / 2) ?? 0;
    const high = param.point.y < mid;
    chart.addMarker('swings', {
      time: param.time,
      position: high ? 'aboveBar' : 'belowBar',
      shape: 'circle',
      color: css('--ink-2'),
      text: high ? 'H' : 'L',
    });
  }
});

function clearMarks() {
  for (const k of chart.lineKeys('lvl-')) chart.setLine(k, null, { color: '', title: '' });
  state.levels = [];
  chart.clearMarkers('swings');
  renderBriefing();
}

// ---------- News ----------

function revealNews(n: NewsItem) {
  const wire = $('#wire');
  wire.querySelector('.muted')?.remove();
  wire.insertAdjacentHTML('beforeend', ui.wireItem(n, state.s!.labels[n.idx]));
  chart.addMarker('news', { time: timeOf(n.idx), position: 'aboveBar', shape: 'square', color: css('--gold'), text: 'N' });
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

function renderLevelBadge() {
  const l = level(state.profile);
  $('#level-badge').innerHTML = state.profile.rounds.length ? `Rank <b>${l.name}</b> · ${l.score}` : 'Rank <b>Unranked</b>';
}

function renderLessons() {
  $('#view-lessons').innerHTML = ui.lessonsView(state.profile, recommend(state.profile));
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
  const b = $('#phase-banner');
  b.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => setPhaseBannerOnly(), 3200);
}
function setPhaseBannerOnly() {
  const p = state.phase;
  $('#phase-banner').textContent =
    p === 'briefing' ? 'Warm-up · study the chart, draw levels, pick a bias, then press Start' : p === 'paused' ? 'Paused · you can still trade and adjust your stops' : p === 'done' ? 'Round complete · the reveal is in' : '';
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
  drawPositionLines();
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
  const el = target.closest<HTMLElement>('[data-act]');
  if (target.closest('.tabs button')) {
    const view = target.closest<HTMLElement>('.tabs button')!.dataset.view!;
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.view === view));
    $('#view-sim').hidden = view !== 'sim';
    $('#view-lessons').hidden = view !== 'lessons';
    if (view === 'lessons') {
      if (state.phase === 'playing') togglePlay();
      renderLessons();
    }
    return;
  }
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
    state.mode = modeBtn.dataset.mode as Mode;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === modeBtn));
    newRound();
    return;
  }
  const speedBtn = target.closest<HTMLElement>('[data-speed]');
  if (speedBtn) return setSpeed(Number(speedBtn.dataset.speed));
  const toolBtn = target.closest<HTMLElement>('[data-tool]');
  if (toolBtn) return setTool(toolBtn.dataset.tool as 'level' | 'swing');
  if (!el) return;

  const v = el.dataset.v;
  const num = (x: string | undefined) => (x === 'null' ? null : Number(x));
  switch (el.dataset.act) {
    case 'bias':
      state.bias = v!;
      renderBriefing();
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
    case 'review':
      $('#debrief').hidden = true;
      break;
    case 'new':
      newRound();
      break;
    case 'lesson': {
      const l = LESSONS.find((x) => x.id === v);
      if (l) markLessonSeen(state.profile, l);
      el.textContent = 'Marked as read ✓';
      (el as HTMLButtonElement).disabled = true;
      break;
    }
    case 'reset-progress':
      if (confirm('Reset all rounds, ratings and lesson history?')) {
        resetProfile();
        state.profile = loadProfile();
        renderLessons();
        renderLevelBadge();
      }
      break;
  }
});

$('#play').addEventListener('click', togglePlay);
$('#step').addEventListener('click', step);
$('#new-round').addEventListener('click', newRound);
$('#clear-marks').addEventListener('click', clearMarks);
$('#theme-toggle').addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
document.querySelectorAll<HTMLInputElement>('[data-overlay]').forEach((cb) =>
  cb.addEventListener('change', () => chart.setOverlay(cb.dataset.overlay as Overlay, cb.checked)),
);

function setSpeed(x: number) {
  state.speed = x;
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
  else if (k === 'h') setTool('swing');
  else if (k === 'escape') {
    if (!$('#debrief').hidden) $('#debrief').hidden = true;
    else if (state.tool) setTool(state.tool);
  } else if ('12345'.includes(k)) setSpeed([0.5, 1, 2, 4, 8][Number(k) - 1]);
});

newRound();
