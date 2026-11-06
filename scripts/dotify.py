"""Turn a generated pixel-art PNG into an LED dot sprite.

Finds the art's own pixel grid, samples one colour per grid cell, snaps colours to a
small palette and writes a JSON sprite (palette + rows) plus a dot preview PNG.

usage: python3 scripts/dotify.py in.png out.json [--max 24] [--colors 6]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def bbox(img: np.ndarray):
    on = img.astype(int).sum(axis=2) > 60
    ys, xs = np.nonzero(on)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def fit_cell(img: np.ndarray, x0: int, y0: int, x1: int, y1: int) -> float:
    """Cell size whose blocks are most uniform. The bounding box edges sit on art-pixel edges."""
    g = img.astype(int)
    errs = []
    for s in np.arange(18, 64, 0.25):
        nx, ny = round((x1 - x0) / s), round((y1 - y0) / s)
        if nx < 6 or ny < 6:
            continue
        sx, sy = (x1 - x0) / nx, (y1 - y0) / ny
        if abs(sx - sy) / s > 0.06:
            continue
        err = 0
        for fx, fy in ((0.22, 0.22), (0.78, 0.22), (0.22, 0.78), (0.78, 0.78)):
            cx = (x0 + (np.arange(nx) + 0.5) * sx).astype(int)
            cy = (y0 + (np.arange(ny) + 0.5) * sy).astype(int)
            px = (x0 + (np.arange(nx) + fx) * sx).astype(int)
            py = (y0 + (np.arange(ny) + fy) * sy).astype(int)
            err += np.abs(g[np.ix_(cy, cx)] - g[np.ix_(py, px)]).sum()
        errs.append((err / (nx * ny), s))
    floor = min(e for e, _ in errs)
    # the largest cell that is nearly as uniform as the best one is the art's real pixel
    return max(s for e, s in errs if e <= floor * 1.6 + 2)


def kmeans(cols: np.ndarray, k: int, iters=20) -> np.ndarray:
    """k-means seeded by farthest points, so small but distinct colours (eyes, a red band) survive."""
    q = (cols // 12).astype(int)
    keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    cent = [cols[keys == np.bincount(keys - keys.min()).argmax() + keys.min()].mean(0)]
    while len(cent) < min(k, len(cols)):
        d = np.min([((cols - c) ** 2).sum(1) for c in cent], axis=0)
        cent.append(cols[d.argmax()].astype(float))
    cent = np.array(cent)
    for _ in range(iters):
        lab = ((cols[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(len(cent)):
            if (lab == j).any():
                cent[j] = cols[lab == j].mean(0)
    return cent


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    maxc = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 26
    k = int(sys.argv[sys.argv.index('--colors') + 1]) if '--colors' in sys.argv else 7
    img = np.array(Image.open(src).convert('RGB'))
    x0, y0, x1, y1 = bbox(img)
    s = fit_cell(img, x0, y0, x1, y1)
    nx, ny = round((x1 - x0) / s), round((y1 - y0) / s)
    if max(nx, ny) > maxc:  # resample coarser if the art is too fine
        f = maxc / max(nx, ny)
        nx, ny = max(1, round(nx * f)), max(1, round(ny * f))
    sx, sy = (x1 - x0) / nx, (y1 - y0) / ny
    grid = np.zeros((ny, nx, 3), dtype=float)
    dark = np.zeros((ny, nx), dtype=bool)
    for j in range(ny):
        for i in range(nx):
            patch = img[int(y0 + (j + 0.3) * sy):int(y0 + (j + 0.7) * sy), int(x0 + (i + 0.3) * sx):int(x0 + (i + 0.7) * sx)].reshape(-1, 3)
            q = (patch // 16).astype(int)
            keys = q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2]
            mode = np.bincount(keys).argmax()
            grid[j, i] = patch[keys == mode].mean(0)
            # background candidates: near black, or near white (some generators paint a white floor)
            dark[j, i] = grid[j, i].sum() < 70 or grid[j, i].min() > 235
    # background = dark cells connected to the outside; dark cells inside (eyes, outlines) stay
    on = np.ones((ny, nx), bool)
    stack = [(j, i) for j in range(ny) for i in range(nx) if (j in (0, ny - 1) or i in (0, nx - 1)) and dark[j, i]]
    while stack:
        j, i = stack.pop()
        if not on[j, i] or not dark[j, i]:
            continue
        on[j, i] = False
        for dj, di in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if 0 <= j + dj < ny and 0 <= i + di < nx:
                stack.append((j + dj, i + di))
    # trim empty border rows/columns left after removing the background
    ys, xs = np.nonzero(on)
    grid, on, dark = grid[ys.min():ys.max() + 1, xs.min():xs.max() + 1], on[ys.min():ys.max() + 1, xs.min():xs.max() + 1], dark[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ny, nx = on.shape
    cols = grid[on]
    pal = kmeans(cols, k)
    lab = ((grid[..., None, :] - pal[None, None]) ** 2).sum(-1).argmin(-1)
    # --target N: shrink to at most N dots per side. Each block keeps its most *salient* colour
    # (count in block / sqrt of how common the colour is overall), so eyes, sparks and highlights survive.
    if '--target' in sys.argv:
        tgt = int(sys.argv[sys.argv.index('--target') + 1])
        f = -(-max(on.shape) // tgt)
        if f > 1:
            freq = np.bincount(lab[on], minlength=len(pal)) + 1
            H2, W2 = -(-on.shape[0] // f), -(-on.shape[1] // f)
            lab2 = np.zeros((H2, W2), int)
            on2 = np.zeros((H2, W2), bool)
            for j in range(H2):
                for i in range(W2):
                    bo = on[j * f:(j + 1) * f, i * f:(i + 1) * f]
                    bl = lab[j * f:(j + 1) * f, i * f:(i + 1) * f][bo]
                    if bo.sum() * 2 < bo.size:
                        continue
                    cnt = np.bincount(bl, minlength=len(pal))
                    lab2[j, i] = int(np.argmax(cnt / np.sqrt(freq)))
                    on2[j, i] = True
            lab, on = lab2, on2
            nx, ny = W2, H2
    alphabet = 'abcdefghijklmnop'
    rows = [''.join(alphabet[lab[j, i]] if on[j, i] else '.' for i in range(on.shape[1])) for j in range(on.shape[0])]
    palette = {alphabet[i]: '#%02x%02x%02x' % tuple(int(v) for v in pal[i]) for i in range(len(pal))}
    out.write_text(json.dumps({'source': src.name, 'cell': round(s, 2), 'w': on.shape[1], 'h': on.shape[0], 'palette': palette, 'rows': rows}, indent=1))
    # dot preview
    g = 18
    pv = Image.new('RGB', (on.shape[1] * g + 40, on.shape[0] * g + 40), (12, 12, 16))
    d = ImageDraw.Draw(pv)
    for j, r in enumerate(rows):
        for i, ch in enumerate(r):
            x, y = 20 + i * g + g / 2, 20 + j * g + g / 2
            if ch == '.':
                d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(27, 27, 35))
            else:
                rad = g * 0.42
                d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=palette[ch])
    pv.save(out.with_suffix('.preview.png'))
    print(f'{src.name}: cell {s:.2f}px -> {nx}x{ny} dots, {len(palette)} colours')


if __name__ == '__main__':
    main()
