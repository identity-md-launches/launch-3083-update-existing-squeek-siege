# Squeek Siege design system

How the site looks and behaves, taken from the current source (`index.html`, `src/style.css`, `src/main.ts`, `src/render.ts`, `src/sprites.ts`, `src/fonts/`). Use it to add a screen or panel that fits the game.

## Overview

Squeek Siege is a one-page browser tower defense for Squeekchain players. It looks like an **LED dot-matrix display in a dark room**. The page is near-black with a faint 8 px dot grid. Display type is set in Doto, a typeface made of dots. Sprites are drawn as rows of lit and unlit dots. Colour comes from the game itself: seed yellow for currency, power blue for wheel power, red for danger.

The layout is dense, like a game HUD. A stat strip sits above the board, the canvas is the main surface, and the timeline of real rounds runs under it. A narrow side column holds the shop, the wave controls, the selected-tower panel and the wave card. The whole interface is built from one surface (a dark panel with a 1 px line) at a few sizes. There are no shadows except the glows that show something is live or active.

## Colors

All tokens are defined on `:root` in `src/style.css:1-12`, as hex.

| Token | Value | Job |
| --- | --- | --- |
| `--bg` | `#08080b` | Page background. Also the gaps between power-bar segments |
| `--panel` | `#101016` | Every surface: `.panel`, `.stat`, `.chip`, `.live`, `.card` |
| `--line` | `#22222c` | 1 px borders on every surface, `kbd` and `.tag` |
| `--dim` | `#86869a` | Secondary text: stat labels, hints, blurbs, wave-card keys, footer, kbd. Raised from `#7c7c8c` in this release to meet 4.5:1 on button surfaces |
| `--text` | `#e8e8f0` | Primary text |
| `--seed` | `#f5c451` | Seeds (currency), tower costs, selected/current state (`.tw.on`, `.chip.now`), the treat button, the final score, and the focus ring (`:focus-visible`) |
| `--power` | `#7fd4ff` | Wheel power value and bar, links, and the live "wheel running" status (`.live.on`) |
| `--red` | `#ff4b5c` | Low power bar (`.bar i.low`), zoomies rounds in the timeline, boss marker (☠), the zoomies tag |

Fixed values outside the tokens:

- Buttons: `#17171f`, hover `#1c1c26` with border `#3a3a48`.
- Canvas well: `#0c0c10`.
- Primary button `.big`: `#f0f0f4` with `#0b0b0e` text.
- Selected shop row: `#1f1b10`.
- Dialog scrim: `rgba(5,5,8,0.82)` with a 3 px blur.
- Tag borders: zoomies `#4a1d24`, jog `#4a3c18`. Live border `#284456`.

The board and sprites have their own palettes: `src/render.ts` holds board colours and enemy colours come from `ENEMIES[*].color` in `src/game.ts`. LED sprites (`src/sprites.ts`) carry per-sprite palettes generated from `art/dots/*.json`.

Contrast measured by the taste probe at 390, 1440 and 320 wide: every measured text pair passes 4.5:1 (3:1 for large text). Text drawn over the canvas and gradients was not measured; see `artifacts/validation.md`.

## Typography

The fonts ship with the site. `src/fonts/fonts.css` declares the faces and `src/fonts/files/*.woff2` holds the files. They are vendored from `@fontsource-variable/doto@5.3.0` (full axes) and `@fontsource-variable/pixelify-sans@5.3.0`, both under SIL OFL 1.1 (`src/fonts/LICENSE-*.txt`). No request goes to Google Fonts.

| Family token | Stack | Use |
| --- | --- | --- |
| `--display` | `'Doto Variable', 'Pixelify Sans Variable', system-ui, sans-serif` | Headline, panel headings, stat numbers, wave number, dialog titles, final score. Always weight 900 with `font-variation-settings: 'ROND' 100` (round dots), `src/style.css:15` |
| `--mono` | `'Pixelify Sans Variable', system-ui, sans-serif` | Body text, buttons, labels, canvas text (`src/render.ts` uses `"Pixelify Sans Variable"`). Despite the token name, Pixelify Sans is a proportional pixel face, so the fallback is sans-serif, not monospace |

Weights in use: 400 (body), 600 (tower names, costs, `b`/`strong`, primary button), 900 (Doto display).

Type scale (CSS px):

| Size | Roles |
| --- | --- |
| 10 | Stat labels, `kbd`, timeline chips, tags, wave-card key line |
| 11 | Hints, blurbs (`.tw .d`), wave-card details, footer, source line |
| 13 | Buttons and the share link |
| 14 | Body (`html, body`) |
| 22 | Panel headings (`.panel h2`), stat numbers (`.stat b`, `#power`), wave-card round number |
| 44 | Dialog titles (`.card h2`), headline under 900 px wide |
| 52 | Headline on desktop (`.brand h1`) |
| 72 | Final score on the results dialog (`.score-big`) |

The first screen uses at most seven of these sizes at any width; the probe's bar is six repeated sizes plus one-offs.

Letter-spacing is never wider than 0.04em. The headline and panel headings use 0.04em, buttons 0.04em, and `kbd` 0. Line-height is 0.9 on the headline, 1 to 1.1 on display numbers, 1.5 on hints and 1.7 on the intro list.

Upper case is part of the LED brand: the headline, panel headings, HUD labels, button labels and tower names are written in capitals in the markup and source strings. Sentences (hints, intro list, footer) use normal case.

## Layout

- Content width is capped at 1240 px. `.top`, `.layout` and `.foot` each use `max-width: 1240px; margin: 0 auto; padding: 0 20px`.
- Desktop: `.layout` is a grid of `minmax(0, 1fr) 290px` with a 14 px gap. The board column is the HUD strip, then the canvas, then the timeline. The `.side` column stacks panels 10 px apart.
- The spacing steps are 4, 6, 8, 10, 12, 14 and 20 px: 4 for chip gaps, 6 for HUD/shop/button-row gaps, 8 to 12 for panel padding, and 20 for page gutters.
- The canvas keeps a 22 × 13 cell board (`COLS`, `ROWS` in `src/game.ts`) at 40 px per cell (`CELL` in `src/render.ts`). It scales to the column width with `width: 100%; height: auto`, and the backing store follows `devicePixelRatio`.
- The timeline is a grid with one column per wave. It is set at runtime (`tl.style.gridTemplateColumns`, `src/main.ts`) so 14- or 15-wave sieges always fill the row.
- The HUD wraps: `.hud` is `flex-wrap: wrap`, `.stat.power` grows (`flex: 1; min-width: 180px`), and the speed and pause controls push to the right (`margin-left: auto`).
- **Under 900 px** (`src/style.css` media query): one column, so the side panels follow the board. The header stacks with the live status under the headline; the status gets `max-width: 100%` and `white-space: normal`, so the longer running/overdrive message wraps inside the gutters instead of widening the page (its dot is `flex: none` and keeps its size), the headline drops to 44 px, and the round numbers in the timeline chips are hidden (bars only).
- Checked at 320, 390 and 1440 px wide with no horizontal scroll. At 390, the board's top edge sits at about 238 px after Play, and the Seed Spitter row is still on the first screen.

## Elevation & depth

The interface is flat: tone and 1 px borders, no drop shadows. Depth is used in three places only:

- `.live.on .dot` glows (`box-shadow: 0 0 10px var(--power)`) and pulses while Squeektoshi is really running. The pulse stops under `prefers-reduced-motion`.
- `.treat.on` has an inset seed glow while zoomies run.
- `.overlay` is the one stacking layer (`z-index: 10`): a fixed, blurred scrim with a centred `.card`. It is a modal dialog (`role="dialog" aria-modal="true"`). While it is open the header, board and footer are `inert`.

## Shapes

Radii are 3 px (`kbd`, `.tag`), 4 px (buttons, chips), 6 px (`.stat`, `.live`), 8 px (`.panel`, `.canvas-wrap`) and 10 px (`.card`). Every surface has a 1 px `--line` border, and selection changes the border colour to `--seed`. Pills and circles are used only for the live dot. The power bar is segmented with a CSS mask so it reads as LEDs (`.bar i`).

## Components

| Component | Source | Use and states |
| --- | --- | --- |
| Button | `button` in `src/style.css` | Default dark surface. States: hover (lighter border and background), `:disabled` (40% opacity, not-allowed cursor), `:focus-visible` (2 px `--seed` outline, 2 px offset) |
| Primary button `.big` | `src/style.css`, `#next`, `#playDaily` | The one main action per surface: Start wave, Play daily siege. Light fill and full width |
| Treat button `.treat` | `#treat` | Seed-coloured text. `.on` while zoomies run, disabled when short of seeds |
| Shop row `.tw` | built in `src/main.ts` (shop section) | 40 px sprite, name with `kbd` hotkey, blurb, and cost. `.on` when picked, disabled when unaffordable. Keys 1 to 4 pick a tower too |
| Stat `.stat` | `index.html` HUD | 10 px label over a 22 px Doto value. `.stat.power` adds the segmented `.bar` |
| Panel `.panel` | `index.html` side column | Doto `h2` plus content. Used for the shop, controls, selected tower (`#selPanel`, hidden when nothing is selected) and the wave card |
| Timeline chip `.chip` | `buildTimeline()` in `src/main.ts` | A `<button>` per wave with an aria-label from its title. Bar height shows the round's work. Classes: `.zoomies` (red bar), `.boss` (☠), `.done` (40% opacity), `.now` (seed border). Clicking pins that wave's card |
| Wave card `.wavecard` | `showCard()` in `src/main.ts` | Wave and round, `.tag` (zoomies, jog, nap-ish), a `dl` of round facts, and the settlement link to Sepolia Etherscan |
| Live status `.live` | `index.html`, `pollLive()` | `role="status"`. Shows "checking the wheel…", "Squeektoshi is resting · block N", "SQUEEKTOSHI IS RUNNING · N RPM · OVERDRIVE 1.5×" (`.on`), or "wheel status unavailable" on an HTTP or network error. Polled every 15 s |
| Dialog `.overlay > .card` | `showOverlay()` and `hideOverlay()` in `src/main.ts` | The loading, intro and results dialogs. Focus moves to the first control on open and goes back to Start wave on close, without scrolling. The results dialog still shows when storage is unavailable |
| LED sprite | `src/sprites.ts`, `sprite()` and `drawSprite()` in `src/render.ts` | Rows of palette letters, where `.` is an unlit dot. Sprites cover the hamster, the four towers and the mite, zip, beetle and jammer enemies. Regenerate them with `scripts/dotify.py` from `art/` |

## Do's and don'ts

- **Do** build any new surface from `.panel` (or `.card` inside the overlay) with `--panel`, `--line` and an 8 px radius. Don't put a panel inside a panel.
- **Do** keep one `.big` primary action per surface and use plain `button` for the rest.
- **Do** use `--seed` for currency and selection, `--power` for power, links and the live state, and `--red` for danger and zoomies. Don't add a fourth accent colour.
- **Do** use the type scale above (10, 11, 13, 14, 22, 44, plus 52 and 72 as one-offs), Doto 900 for numbers and headings, and Pixelify for everything else. Don't add a new size or a third family.
- **Don't** widen letter-spacing past 0.04em, and don't load fonts from a CDN. Add new font files under `src/fonts/` with their licence.
- **Don't** add any network dependency other than `https://api.squeekchain.com`.
- **To add a panel:** add a `<div class="panel">` with an `<h2>` to `.side` in `index.html`, use `.hint` for explanatory text and `.row` for paired buttons, and wire the behaviour in `src/main.ts`. It collapses into the single mobile column without extra CSS.
