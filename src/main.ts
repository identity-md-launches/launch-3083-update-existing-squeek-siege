// fonts ship with the site (OFL), so the hosted build has no external dependency.
// Vendored from @fontsource-variable/doto and @fontsource-variable/pixelify-sans (see src/fonts/).
import './fonts/fonts.css';
import './style.css';
import { loadRounds, loadStatus, txUrl, type Round } from './data';
import {
  COLS, ROWS, TOWERS, TOWER_ORDER, TREAT_COST, WAVES_PER_SIEGE, build, canBuild, giveTreat, hashStr, newGame, pickWindow,
  sell, sellValue, startWave, step, towerStats, upgrade, upgradeCost, type Game, type TowerKind,
} from './game';
import { H, W, render, sprite, type View } from './render';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const dpr = window.devicePixelRatio || 1;
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

const GENESIS_DAY = Date.UTC(2026, 10, 3); // SqueekCore genesis on Sepolia, 3 Nov 2026
const today = () => Math.floor((Date.now() - GENESIS_DAY) / 86_400_000) + 1;

let allRounds: Round[] = [];
let source = 'snapshot';
let game: Game;
let mode: 'daily' | 'free' = 'daily';
let speed = 1;
let paused = true;
const view: View = { hover: null, placing: null, selected: null };

// ---------- shop ----------
const shop = $('shop');
for (const [i, k] of TOWER_ORDER.entries()) {
  const d = TOWERS[k];
  const b = document.createElement('button');
  b.className = 'tw';
  b.dataset.kind = k;
  const c = document.createElement('canvas');
  c.width = c.height = 32 * dpr;
  const icon = sprite(k, null, 2.2);
  const s = Math.min(c.width / icon.width, c.height / icon.height);
  c.getContext('2d')!.drawImage(icon, (c.width - icon.width * s) / 2, (c.height - icon.height * s) / 2, icon.width * s, icon.height * s);
  b.append(c);
  b.insertAdjacentHTML('beforeend', `<div><div class="n">${d.name.toUpperCase()}<kbd>${i + 1}</kbd></div><div class="d">${d.blurb}</div></div><div class="c">${d.cost}</div>`);
  b.onclick = () => choose(view.placing === k ? null : k);
  shop.append(b);
}
function choose(k: TowerKind | null) {
  view.placing = k;
  if (k) view.selected = null;
  for (const el of shop.querySelectorAll<HTMLElement>('.tw')) el.classList.toggle('on', el.dataset.kind === k);
  syncSel();
}

// ---------- selection panel ----------
function syncSel() {
  const t = view.selected;
  $('selPanel').hidden = !t;
  if (!t) return;
  const s = towerStats(t);
  const d = TOWERS[t.kind];
  $('selName').textContent = `${d.name.toUpperCase()} · LV ${t.level}`;
  const line = t.kind === 'fog'
    ? `Slows ${Math.round(s.slow * 100)}% in ${s.range.toFixed(1)} cells. Uses ${s.power.toFixed(2)} power/s.`
    : t.kind === 'coil'
      ? `${s.dmg.toFixed(0)} dmg, chains ${s.chains}, ${s.rate.toFixed(2)}/s. ${s.power.toFixed(1)} power per zap.`
      : `${s.dmg.toFixed(0)} dmg${t.kind === 'cannon' ? ' splash' : ''}, ${s.rate.toFixed(2)}/s, range ${s.range.toFixed(1)}. ${s.power.toFixed(2)} power per shot.`;
  $('selInfo').textContent = `${line} Kills: ${t.kills}.`;
  const uc = upgradeCost(t);
  const ub = $<HTMLButtonElement>('upgrade');
  ub.textContent = uc === null ? 'MAX LEVEL' : `UPGRADE · ${uc}`;
  ub.disabled = uc === null || game.seeds < uc;
  $('sell').textContent = `SELL · ${sellValue(t)}`;
}
$('upgrade').onclick = () => { if (view.selected) upgrade(game, view.selected); syncSel(); };
$('sell').onclick = () => { if (view.selected) { sell(game, view.selected); view.selected = null; syncSel(); } };

// ---------- controls ----------
$('next').onclick = () => { startWave(game); paused = false; syncPause(); };
$('treat').onclick = () => giveTreat(game);
$('speed').onclick = () => { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; $('speed').textContent = `${speed}×`; };
$('pause').onclick = () => { paused = !paused; syncPause(); };
function syncPause() { $('pause').textContent = paused ? '▶' : '❚❚'; }

function cellAt(ev: MouseEvent | PointerEvent) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * COLS);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * ROWS);
  return x >= 0 && y >= 0 && x < COLS && y < ROWS ? { x, y } : null;
}
canvas.addEventListener('pointermove', (e) => { view.hover = cellAt(e); });
canvas.addEventListener('pointerleave', () => { view.hover = null; });
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const c = cellAt(e);
  if (!c) return;
  view.hover = c;
  const hit = game.towers.find((t) => t.cx === c.x && t.cy === c.y);
  if (hit) { view.selected = hit; choose(null); view.selected = hit; syncSel(); return; }
  if (view.placing) {
    if (build(game, view.placing, c.x, c.y)) {
      if (paused && game.phase === 'build') { paused = false; syncPause(); }
      if (!e.shiftKey && game.seeds < TOWERS[view.placing].cost) choose(null);
    }
    return;
  }
  view.selected = null;
  syncSel();
});
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); choose(null); view.selected = null; syncSel(); });

window.addEventListener('keydown', (e) => {
  if ($('overlay').classList.contains('show')) return;
  const t = e.target as HTMLElement | null;
  if (t && t !== document.body && (t.isContentEditable || t.closest('button, a[href], input, select, textarea, summary, [role="button"]'))) {
    if (e.code === 'Space') return; // let the focused control activate natively
  }
  const n = Number(e.key);
  if (n >= 1 && n <= 4) choose(TOWER_ORDER[n - 1]);
  else if (e.code === 'Space') { e.preventDefault(); $('next').click(); }
  else if (e.key === 't' || e.key === 'T') giveTreat(game);
  else if (e.key === 'f' || e.key === 'F') $('speed').click();
  else if (e.key === 'p' || e.key === 'P') $('pause').click();
  else if (e.key === 'u' || e.key === 'U') $('upgrade').click();
  else if (e.key === 'Escape') { choose(null); view.selected = null; syncSel(); }
});

// ---------- timeline + wave card ----------
let cardWave = -1;
function buildTimeline() {
  const tl = $('timeline');
  tl.innerHTML = '';
  tl.style.gridTemplateColumns = `repeat(${game.waves.length}, 1fr)`;
  const maxW = Math.max(...game.waves.map((w) => w.round.work));
  game.waves.forEach((w, i) => {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = `chip ${w.tag}${w.boss ? ' boss' : ''}`;
    c.innerHTML = `<div class="w"><i style="height:${Math.max(8, (w.round.work / maxW) * 100)}%"></i></div><span>#${w.round.round}</span>`;
    c.title = `Wave ${i + 1}: round #${w.round.round}, ${w.round.work} wheel passages`;
    c.setAttribute('aria-label', c.title);
    c.onclick = () => showCard(i, true);
    tl.append(c);
  });
}
function syncTimeline() {
  [...$('timeline').children].forEach((c, i) => {
    c.classList.toggle('done', i < game.waveIndex);
    c.classList.toggle('now', i === game.waveIndex);
  });
}
let pinned = false;
function showCard(i: number, pin = false) {
  if (pin) pinned = true;
  if (cardWave === i) return;
  cardWave = i;
  const w = game.waves[Math.min(i, game.waves.length - 1)];
  if (!w) return;
  const r = w.round;
  const kinds = w.spawns.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] || 0) + 1), a), {});
  const when = new Date(r.at);
  $('waveCard').innerHTML = `
    <div class="k">WAVE ${i + 1} OF ${game.waves.length}${i === game.waveIndex ? ' · NEXT UP' : ''}</div>
    <div class="big-n">ROUND #${r.round}<span class="tag ${w.tag}">${w.tag.toUpperCase()}</span></div>
    <dl>
      <dt>wheel passages</dt><dd>${r.work}</dd>
      <dt>settled</dt><dd>${when.toUTCString().slice(5, 22)} UTC</dd>
      <dt>Squeek block</dt><dd>${r.block || '—'}</dd>
      <dt>incoming</dt><dd>${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(' · ')}</dd>
      <dt>settlement</dt><dd><a href="${txUrl(r.tx)}" target="_blank" rel="noopener">${r.tx.slice(0, 10)}… ↗</a></dd>
    </dl>
    <p class="hint">The round's work sizes the wave and powers the wheel while it runs; its settlement hash picks the bugs.</p>`;
}

// ---------- HUD ----------
let hudT = 0;
function hud() {
  $('seeds').textContent = String(Math.floor(game.seeds));
  $('power').textContent = String(Math.floor(game.power));
  const pb = $('powerBar');
  pb.style.width = `${(game.power / game.maxPower) * 100}%`;
  pb.classList.toggle('low', game.power < 10);
  $('lives').textContent = String(game.lives);
  $('wave').textContent = `${Math.min(game.waveIndex + 1, game.waves.length)}/${game.waves.length}`;
  $('score').textContent = String(game.score);
  const nb = $<HTMLButtonElement>('next');
  nb.disabled = game.phase !== 'build';
  nb.innerHTML = game.phase === 'build'
    ? `START WAVE ${game.waveIndex + 1} · ${Math.ceil(game.buildTimer)}s <kbd>SPACE</kbd>`
    : game.phase === 'wave' ? `WAVE ${game.waveIndex + 1} INCOMING…` : 'SIEGE OVER';
  const tb = $<HTMLButtonElement>('treat');
  tb.disabled = game.seeds < TREAT_COST || game.treat > 0;
  tb.classList.toggle('on', game.treat > 0);
  tb.innerHTML = game.treat > 0 ? `ZOOMIES · ${game.treat.toFixed(1)}s` : `GIVE A TREAT · ${TREAT_COST} seeds <kbd>T</kbd>`;
  for (const el of shop.querySelectorAll<HTMLButtonElement>('.tw')) el.disabled = game.seeds < TOWERS[el.dataset.kind as TowerKind].cost;
  syncTimeline();
  if (!pinned) showCard(game.waveIndex);
  if (view.selected) syncSel();
}

// ---------- live wheel ----------
async function pollLive() {
  const s = await loadStatus();
  const el = $('live');
  el.classList.toggle('on', s.active);
  $('liveText').textContent = !s.ok
    ? 'wheel status unavailable'
    : s.active
      ? `SQUEEKTOSHI IS RUNNING · ${s.rpm.toFixed(0)} RPM · OVERDRIVE 1.5×`
      : `Squeektoshi is resting · block ${s.blockHeight}`;
  if (game) { game.overdrive = s.active; game.liveRpm = s.rpm; }
}

// ---------- overlay ----------
const overlay = $('overlay');
// the overlay is a modal dialog: the page behind it is inert until it closes, focus moves in and comes back
const behind = [document.querySelector('.top'), document.querySelector('.layout'), document.querySelector('.foot')] as HTMLElement[];
function showOverlay() {
  overlay.classList.add('show');
  for (const el of behind) el.inert = true;
  overlay.querySelector<HTMLElement>('button, a[href]')?.focus({ preventScroll: true });
}
function hideOverlay() {
  overlay.classList.remove('show');
  for (const el of behind) el.inert = false;
  $('next').focus({ preventScroll: true });
}
function bestKey() { return `squeek-siege:best:${game.seedLabel}`; }
function intro() {
  const n = today();
  overlay.innerHTML = `<div class="card">
    <h2 id="dlgTitle">SQUEEK SIEGE</h2>
    <p class="sub">Daily siege #${n} · ${game.waves.length} waves from rounds #${game.waves[0].round.round}–#${game.waves[game.waves.length - 1].round.round}</p>
    <ol>
      <li>Rust mites want to jam <b>Squeektoshi's wheel</b>. Build towers beside the path with <b>seeds</b>.</li>
      <li>Towers burn <b>wheel power</b>. The wheel turns at the pace the hamster really ran in each round, so busy rounds bring more bugs <i>and</i> more power.</li>
      <li>Short on power? Give him a <b>treat</b>. If he's running for real right now, every tower gets <b>overdrive</b>.</li>
    </ol>
    <div class="btns">
      <button class="big" id="playDaily">PLAY DAILY SIEGE</button>
      <button id="playFree">RANDOM ROUNDS</button>
    </div>
    <div class="src">${allRounds.length} real rounds loaded (${source}). Keys: 1–4 towers · space wave · T treat · F speed · U upgrade · right-click cancel</div>
  </div>`;
  showOverlay();
  $('playDaily').onclick = () => start('daily');
  $('playFree').onclick = () => start('free');
}
function outro() {
  const won = game.phase === 'won';
  let best = game.score;
  try {
    best = Math.max(game.score, Number(localStorage.getItem(bestKey()) || 0));
    localStorage.setItem(bestKey(), String(best));
  } catch { /* storage disabled or full: still show the results */ }
  const label = mode === 'daily' ? `Daily siege #${today()}` : 'Random siege';
  const text = won
    ? `I held Squeektoshi's wheel through all ${game.waves.length} waves of ${label} in Squeek Siege. Score ${game.score}, wheel ${game.lives}/${game.maxLives}.`
    : `The bugs jammed Squeektoshi's wheel on wave ${game.waveIndex + 1}/${game.waves.length} of ${label} in Squeek Siege. Score ${game.score}.`;
  const share = `https://x.com/intent/post?text=${encodeURIComponent(text + ' Every wave is a real round the hamster ran on @squeekchain.')}&url=${encodeURIComponent(location.origin + location.pathname)}`;
  overlay.innerHTML = `<div class="card">
    <h2 id="dlgTitle">${won ? 'WHEEL HELD' : 'WHEEL JAMMED'}</h2>
    <p class="sub">${label} · wave ${Math.min(game.waveIndex + 1, game.waves.length)}/${game.waves.length} · ${game.kills} bugs squashed · ${Math.round(game.stats.powerMade)} wheel power made</p>
    <div class="score-big">${game.score}</div>
    <p class="sub">best on this siege: ${best}</p>
    <div class="btns">
      <a href="${share}" target="_blank" rel="noopener">SHARE ON X</a>
      <button id="again">PLAY AGAIN</button>
      <button id="other">${mode === 'daily' ? 'RANDOM ROUNDS' : 'DAILY SIEGE'}</button>
    </div>
  </div>`;
  showOverlay();
  $('again').onclick = () => start(mode);
  $('other').onclick = () => start(mode === 'daily' ? 'free' : 'daily');
}

function setup(m: 'daily' | 'free') {
  mode = m;
  const label = m === 'daily' ? `daily-${today()}` : `free-${Math.floor(Math.random() * 1e9)}`;
  // a daily siege only sees rounds settled before today's UTC midnight, so everyone plays the same one all day
  const dayStart = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const settled = allRounds.filter((r) => Date.parse(r.at) < dayStart);
  const pool = m === 'daily' && settled.length >= 10 ? settled : allRounds;
  const rounds = pickWindow(pool, hashStr(label), Math.min(WAVES_PER_SIEGE, pool.length));
  game = newGame(rounds, label);
  view.selected = null;
  choose(null);
  cardWave = -1;
  pinned = false;
  buildTimeline();
  hud();
}
function start(m: 'daily' | 'free') {
  setup(m);
  hideOverlay();
  paused = false;
  syncPause();
  pollLive();
}

// ---------- loop ----------
let last = performance.now();
let acc = 0;
let ended = false;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game) {
    if (!paused && !overlay.classList.contains('show')) {
      acc += dt * speed;
      while (acc >= 1 / 60) { step(game, 1 / 60); acc -= 1 / 60; }
    }
    render(ctx, game, view);
    hudT -= dt;
    if (hudT <= 0) { hud(); hudT = 0.1; }
    if ((game.phase === 'won' || game.phase === 'lost') && !ended) { ended = true; setTimeout(outro, 900); }
    if (game.phase !== 'won' && game.phase !== 'lost') ended = false;
  }
  requestAnimationFrame(frame);
}

// dev-only hook for automated checks; stripped from production builds
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__siege = { get game() { return game; }, build, canBuild };

(async () => {
  overlay.innerHTML = `<div class="card"><h2 id="dlgTitle">SQUEEK SIEGE</h2><p class="sub" role="status">Reading Squeektoshi's rounds from Squeekchain…</p></div>`;
  showOverlay();
  const r = await loadRounds();
  allRounds = r.rounds;
  source = r.source;
  setup('daily');
  intro();
  pollLive();
  setInterval(pollLive, 15_000);
  requestAnimationFrame(frame);
})();

