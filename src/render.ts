// Squeek Siege — LED dot-matrix renderer (canvas 2D).
import { COLS, ROWS, ENEMIES, TOWERS, towerStats, canBuild, type Game, type TowerKind, type Tower } from './game';
import { SPRITES } from './sprites';

export const CELL = 40;
export const W = COLS * CELL;
export const H = ROWS * CELL;

const BITMAPS: Record<string, string[]> = {
  hamster: ['.##...##.', '.#######.', '##.###.##', '#########', '###...###', '.#######.', '..#...#..'],
  spitter: ['..###..', '.#####.', '##...##', '##.#.##', '##...##', '.#####.', '..#.#..'],
  cannon: ['.......', '.#####.', '#######', '###.###', '#######', '.#####.', '.##.##.'],
  coil: ['#..#..#', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '#..#..#'],
  fog: ['.......', '..##...', '.####.#', '######.', '.#####.', '..###..', '.......'],
  mite: ['.#.#.', '#####', '#.#.#', '#####', '#...#'],
  zip: ['..#..', '.###.', '#####', '.#.#.', '#...#'],
  beetle: ['.###.', '#####', '##.##', '#####', '#.#.#'],
  jammer: ['#.###.#', '.#####.', '##.#.##', '#######', '#.###.#', '.#.#.#.', '#.....#'],
  crate: ['#####', '#.#.#', '##.##', '#.#.#', '#####'],
};

const spriteCache = new Map<string, HTMLCanvasElement>();

/** Rows of a sprite: the generated colour art when we have it, else the hand-made fallback. */
function rowsOf(name: string): { rows: string[]; palette: Record<string, string> | null } {
  const s = SPRITES[name];
  if (s) return { rows: s.rows, palette: s.palette };
  return { rows: BITMAPS[name], palette: null };
}

/**
 * LED dot sprite rendered to an offscreen canvas.
 * color = null draws the art in its own palette; a colour string draws every lit dot in that colour
 * (hit flashes, invalid placement, single-colour fallbacks).
 */
export function sprite(name: string, color: string | null, gap: number, dot = gap * 0.42): HTMLCanvasElement {
  const { rows, palette } = rowsOf(name);
  const fill = color ?? (palette ? null : '#ffffff');
  const k = `${name}|${fill}|${gap}|${dot}`;
  let c = spriteCache.get(k);
  if (c) return c;
  const w = rows[0].length, h = rows.length;
  c = document.createElement('canvas');
  const s = window.devicePixelRatio || 1;
  c.width = Math.ceil(w * gap * s);
  c.height = Math.ceil(h * gap * s);
  const x = c.getContext('2d')!;
  x.scale(s, s);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      x.fillStyle = fill ?? palette![ch] ?? '#ffffff';
      x.beginPath();
      x.arc(i * gap + gap / 2, j * gap + gap / 2, dot, 0, Math.PI * 2);
      x.fill();
    }
  spriteCache.set(k, c);
  return c;
}

/** Draw a sprite so its longer side is `box` pixels, centred on (cx, cy). */
function drawSprite(ctx: CanvasRenderingContext2D, name: string, color: string | null, box: number, cx: number, cy: number, alpha = 1) {
  const { rows } = rowsOf(name);
  const gap = box / Math.max(rows[0].length, rows.length);
  const c = sprite(name, color, gap);
  const w = rows[0].length * gap, h = rows.length * gap;
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, cx - w / 2, cy - h / 2, w, h);
  ctx.globalAlpha = 1;
}

let bgCache: { key: string; canvas: HTMLCanvasElement } | null = null;
function background(g: Game): HTMLCanvasElement {
  const key = g.seedLabel + g.path.length;
  if (bgCache && bgCache.key === key) return bgCache.canvas;
  const c = document.createElement('canvas');
  const s = window.devicePixelRatio || 1;
  c.width = W * s;
  c.height = H * s;
  const x = c.getContext('2d')!;
  x.scale(s, s);
  x.fillStyle = '#0c0c10';
  x.fillRect(0, 0, W, H);
  const n = 4, gap = CELL / n;
  for (let cy = 0; cy < ROWS; cy++)
    for (let cx = 0; cx < COLS; cx++) {
      const onPath = g.pathCells.has(`${cx},${cy}`);
      x.fillStyle = onPath ? '#5a4526' : '#1b1b23';
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          x.beginPath();
          x.arc(cx * CELL + i * gap + gap / 2, cy * CELL + j * gap + gap / 2, onPath ? 2.6 : 1.4, 0, Math.PI * 2);
          x.fill();
        }
    }
  // path centre line, faint
  x.strokeStyle = 'rgba(245,196,81,0.22)';
  x.lineWidth = 2;
  x.setLineDash([2, 8]);
  x.beginPath();
  g.path.forEach((p, i) => (i ? x.lineTo(p.x * CELL, p.y * CELL) : x.moveTo(p.x * CELL, p.y * CELL)));
  x.stroke();
  x.setLineDash([]);
  // entry gate on the left edge
  const ey = g.path[0].y * CELL;
  x.fillStyle = '#ff4b5c';
  for (let i = 0; i < 3; i++) {
    x.globalAlpha = 0.35 + i * 0.25;
    x.beginPath();
    x.moveTo(4 + i * 7, ey - 6);
    x.lineTo(10 + i * 7, ey);
    x.lineTo(4 + i * 7, ey + 6);
    x.closePath();
    x.fill();
  }
  x.globalAlpha = 1;
  for (const k of g.blocked) {
    const [bx, by] = k.split(',').map(Number);
    if (bx >= g.wheel.cx && bx <= g.wheel.cx + 1 && by >= g.wheel.cy && by <= g.wheel.cy + 1) continue;
    const bm = BITMAPS.crate, gp = 6;
    x.drawImage(sprite('crate', '#5b4a2c', gp), bx * CELL + (CELL - bm[0].length * gp) / 2, by * CELL + (CELL - bm.length * gp) / 2, bm[0].length * gp, bm.length * gp);
  }
  bgCache = { key, canvas: c };
  return c;
}

export interface View {
  hover: { x: number; y: number } | null;
  placing: TowerKind | null;
  selected: Tower | null;
}

const toPx = (v: number) => v * CELL;

function rangeCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color.replace('1)', '0.06)');
  ctx.setLineDash([3, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(toPx(x), toPx(y), toPx(r), 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function render(ctx: CanvasRenderingContext2D, g: Game, v: View) {
  ctx.drawImage(background(g), 0, 0, W, H);
  const t = g.time;

  // ---- wheel (WHEELY9000) ----
  const wx = toPx(g.wheel.cx + 1), wy = toPx(g.wheel.cy + 1);
  const hot = g.treat > 0 || g.overdrive;
  const R = CELL * 0.92;
  ctx.save();
  if (hot) {
    const grd = ctx.createRadialGradient(wx, wy, 10, wx, wy, R * 1.6);
    grd.addColorStop(0, g.treat > 0 ? 'rgba(245,196,81,0.25)' : 'rgba(127,212,255,0.25)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(wx - R * 2, wy - R * 2, R * 4, R * 4);
  }
  const lifeFrac = g.lives / g.maxLives;
  const rimColor = lifeFrac > 0.5 ? '#cfd6e6' : lifeFrac > 0.25 ? '#f5c451' : '#ff4b5c';
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = g.wheelAngle + (i / N) * Math.PI * 2;
    ctx.fillStyle = rimColor;
    ctx.globalAlpha = i % 7 === 0 ? 1 : 0.55;
    ctx.beginPath();
    ctx.arc(wx + Math.cos(a) * R, wy + Math.sin(a) * R, i % 7 === 0 ? 3.2 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  for (let s = 0; s < 4; s++) {
    const a = g.wheelAngle + (s / 4) * Math.PI * 2;
    for (let k = 1; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(wx + Math.cos(a) * R * (k / 5), wy + Math.sin(a) * R * (k / 5), 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  const bob = Math.sin(t * (6 + g.wheelSpin * 3)) * Math.min(3, g.wheelSpin * 2);
  drawSprite(ctx, 'hamster', null, 60, wx, wy + 4 + bob);
  ctx.restore();

  // ---- towers ----
  for (const tw of g.towers) {
    const cx = toPx(tw.cx + 0.5), cy = toPx(tw.cy + 0.5);
    ctx.fillStyle = '#15151c';
    ctx.fillRect(cx - CELL / 2 + 3, cy - CELL / 2 + 3, CELL - 6, CELL - 6);
    ctx.strokeStyle = v.selected === tw ? '#ffffff' : 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - CELL / 2 + 3.5, cy - CELL / 2 + 3.5, CELL - 7, CELL - 7);
    const fogOn = tw.kind === 'fog' && g.power > 0.5;
    if (tw.kind === 'fog' && fogOn) {
      const s = towerStats(tw);
      ctx.fillStyle = 'rgba(183,156,255,0.05)';
      ctx.beginPath();
      ctx.arc(cx, cy, toPx(s.range), 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = t * 0.6 + i;
        ctx.fillStyle = 'rgba(183,156,255,0.35)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * toPx(s.range) * 0.7, cy + Math.sin(a * 1.3) * toPx(s.range) * 0.5, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const kick = tw.kick * 2.5;
    drawSprite(ctx, tw.kind, null, 32, cx - Math.cos(tw.aim) * kick, cy - Math.sin(tw.aim) * kick, g.power < 0.5 && tw.kind !== 'fog' ? 0.55 : 1);
    for (let l = 0; l < tw.level; l++) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - CELL / 2 + 8 + l * 6, cy + CELL / 2 - 8, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- enemies ----
  for (const e of g.enemies) {
    const def = ENEMIES[e.kind];
    const ex = toPx(e.x), ey = toPx(e.y) + Math.sin(t * 14 + e.wobble) * 1.2;
    const color = e.hitFlash > 0 ? '#ffffff' : SPRITES[e.kind] ? null : def.color;
    drawSprite(ctx, e.kind, color, e.kind === 'jammer' ? 46 : 21 * def.size, ex, ey);
    if (e.slow > 0) {
      ctx.fillStyle = 'rgba(183,156,255,0.8)';
      ctx.font = '10px "Pixelify Sans Variable", monospace';
      ctx.fillText('z', ex + 8, ey - 9 - Math.sin(t * 4) * 2);
    }
    if (e.hp < e.maxHp) {
      const wbar = e.kind === 'jammer' ? 40 : 20;
      const n = e.kind === 'jammer' ? 10 : 5;
      const filled = Math.ceil((e.hp / e.maxHp) * n);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < filled ? (e.hp / e.maxHp > 0.4 ? '#9bd65a' : '#ff4b5c') : '#2a2a33';
        ctx.fillRect(ex - wbar / 2 + i * (wbar / n), ey - (e.kind === 'jammer' ? 28 : 16), wbar / n - 1, 2.5);
      }
    }
  }

  // ---- shots ----
  for (const s of g.shots) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(toPx(s.x), toPx(s.y), s.splash ? 4 : 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- fx ----
  for (const f of g.fx) {
    const k = 1 - f.t / f.ttl;
    if (f.kind === 'zap') {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const x1 = toPx(f.x), y1 = toPx(f.y), x2 = toPx(f.x2!), y2 = toPx(f.y2!);
      ctx.moveTo(x1, y1);
      for (let i = 1; i < 5; i++) {
        const q = i / 5;
        ctx.lineTo(x1 + (x2 - x1) * q + (Math.random() - 0.5) * 8, y1 + (y2 - y1) * q + (Math.random() - 0.5) * 8);
      }
      ctx.lineTo(x2, y2);
      ctx.stroke();
    } else if (f.kind === 'ring') {
      ctx.strokeStyle = f.color;
      ctx.globalAlpha = k;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toPx(f.x), toPx(f.y), toPx(f.r! * (1 - k * 0.6)), 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'dot') {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(toPx(f.x), toPx(f.y), 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (f.kind === 'text') {
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = '600 13px "Pixelify Sans Variable", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(f.text!, toPx(f.x), toPx(f.y));
      ctx.textAlign = 'left';
    }
    ctx.globalAlpha = 1;
  }

  // ---- placement preview / selection ----
  if (v.placing && v.hover) {
    const ok = canBuild(g, v.hover.x, v.hover.y) && g.seeds >= TOWERS[v.placing].cost;
    const cx = v.hover.x + 0.5, cy = v.hover.y + 0.5;
    rangeCircle(ctx, cx, cy, towerStats({ kind: v.placing, level: 1 }).range, ok ? 'rgba(255,255,255,1)' : 'rgba(255,75,92,1)');
    drawSprite(ctx, v.placing, ok ? null : '#ff4b5c', 32, toPx(cx), toPx(cy), 0.6);
  } else if (v.selected) {
    rangeCircle(ctx, v.selected.cx + 0.5, v.selected.cy + 0.5, towerStats(v.selected).range, 'rgba(255,255,255,1)');
  }
}
