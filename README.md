# Squeek Siege

A tower defense game where the waves come from the real hamster running Squeekchain.

Rust mites want to jam Squeektoshi's wheel. You build towers beside the path with seeds; the towers burn **wheel power**, and the wheel turns at the pace the hamster really ran.

## How Squeekchain drives the game

| In the game | Comes from |
|---|---|
| Each wave | One real SqueekCore settlement on Sepolia with wheel work, read from `GET /v1/events` (`system.settlement_completed`). The wave card links its transaction. |
| Wave size | The round's accepted wheel passages (`workAdded`) |
| Which bugs come, and in what order | Bytes of that settlement's transaction hash |
| Wheel power during a wave | The round's real pace (`work / 600 s`, sped up 5×), ticking with the jitter of the measured passage gaps |
| Overdrive (1.5× power) | `GET /v1/status`: the WHEELY9000 reports `ACTIVE` and a non-zero RPM, i.e. Squeektoshi is running right now |
| Daily siege | The same 15 consecutive real rounds and map for everyone each UTC day |

The game is read-only: no wallet, no keys, no transactions. If the API can't be reached it falls back to a bundled snapshot of real settlements (`src/snapshot.ts`).

## Play

- `1`–`4` pick a tower, click to build, click a tower to upgrade/sell
- `Space` start the next wave early (pays a seed bonus)
- `T` give a treat: 6 s of zoomies, 2.5× wheel power
- `F` speed, `P` pause, right-click cancel

## Install, preview and rebuild

Requires Node 18+ and npm.

```bash
npm ci                 # install the exact locked dev dependencies (TypeScript, Vite)
npm run dev            # dev server at http://localhost:5181
npm run build          # tsc --noEmit (typecheck) + vite build -> dist/
npm run preview        # serve the built dist/ at http://localhost:5182
npx tsx scripts/sim.ts # headless balance check with a greedy bot
```

Vite + TypeScript, canvas 2D, no runtime dependencies. `vite.config.ts` sets `base: './'`, so every asset URL in `dist/` is relative. The export works from any gateway subpath or ENS name: open `dist/index.html` through any static server. `dist/` is committed and is what gets hosted, so run `npm run build` after any source change and commit the new `dist/`.

The only network calls at runtime go to `https://api.squeekchain.com` (`/v1/events`, `/v1/status`). The Doto and Pixelify Sans fonts are bundled from `src/fonts/` (SIL OFL 1.1, vendored from Fontsource), so nothing loads from Google Fonts or any other CDN. `public/og.png` is the share card, a capture of the real game mid-wave.

## This release

This release ports [0xGr1mm/squeek-siege@7b6ee60](https://github.com/0xGr1mm/squeek-siege/tree/7b6ee60dd6a8e6cb152b0205affa1530ed986d80):

- Colour LED dot sprites for the mite and beetle enemies (`art/dots/bug-mite.json`, `art/dots/bug-beetle.json`, `src/sprites.ts`).
- The fonts ship with the site. Upstream adds `@fontsource-variable/*` packages for this. This project's `package.json` and lockfile are kept as they are, so the same Fontsource files are vendored in `src/fonts/` instead. Family names and rendering are unchanged.
- Five content-check fixes:
  1. The results screen still shows when storage is disabled or full.
  2. The daily siege only uses rounds settled before today's UTC midnight, so it stays the same all day.
  3. Right-click cancels without building.
  4. The share link keeps the page path.
  5. HTTP errors from `/v1/status` show "wheel status unavailable".

Changes added in this repository on top of upstream, from the design review (full record delivered as `artifacts/validation.md` with this job):

- og:image share card.
- Overlay works as a modal dialog: focus moves in, the page behind is inert, and focus returns on close.
- Visible focus ring.
- Timeline chips are keyboard buttons.
- Live status and canvas have labels for assistive tech.
- `--dim` raised to `#86869a` to meet text contrast.
- Six-step type scale (9, 18 and 30 px folded into 10 and 22 px; 38 px mobile headline is now 44 px).
- Letter-spacing capped at 0.04em.
- Sans-serif font fallback.
- Reduced-motion support for the live pulse.
- The live-rounds cache write no longer drops live data when storage is full.

## Validation

Last run on this commit's source and `dist/`:

| Check | Command | Result |
| --- | --- | --- |
| Clean install | `npm ci` | OK |
| Typecheck | `npx tsc --noEmit` (also the first step of `npm run build`) | exit 0 |
| Production build | `npm run build` | exit 0. The JS is 36 kB (15.3 kB gzip), CSS 8.9 kB, plus 5 woff2 files (35.6 kB) and og.png |
| Interaction suite | Playwright on Chromium and WebKit against `dist/` served under `/siege/`, with the API routed to fixtures captured from the live API | 68/68 passed |
| Design probe | `node .imd/reads/skills/design-critic/scripts/taste.mjs` | 12/16 checks pass. The four remaining are deliberate; see `artifacts/validation.md` |

The interaction suite covered:

- Live rounds load.
- Bundled fonts load with no external requests.
- The intro dialog, the main action on the first screen at 320, 390 and 1440, and focus moving in and back out.
- No horizontal scroll.
- Hotkey tower pick, building on a free cell, right-click cancel spending nothing, the tower panel, timeline chip to wave card, and the settlement link.
- Space starting a wave.
- Live status in four states: resting, running (overdrive), HTTP 503 (unavailable), and events 500 (snapshot fallback).
- The daily siege staying identical at 03:00, 07:36 and 23:00 UTC.
- With storage disabled: the results screen, the share link keeping `/siege/`, and Play again.

Limitations:

- No screen reader or physical device was tested.
- Placing a tower on the board needs a pointer (mouse or touch). Menus and hotkeys work from the keyboard.
- The interaction scripts were local scaffolding and are not shipped.
