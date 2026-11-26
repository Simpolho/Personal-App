# Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app always dark, with a gray base and a blue accent, without changing layout or behaviour.

**Architecture:** The palette is defined once, as named theme colours in `src/index.css` (Tailwind 4 `@theme`), and every screen uses those names. Two guard tests keep it that way:
- one checks that the token pairs meet the contrast targets
- one checks that no source file still uses the old light palette classes

The iPhone parts (theme colour, status bar, manifest, `color-scheme`) and the icon file change alongside.

**Tech Stack:** Tailwind 4 (`@theme` CSS variables become utilities such as `bg-card` and `text-muted`), React, Vite PWA, Vitest (node environment for the file-reading guards).

**Spec:** `docs/superpowers/specs/2026-11-26-dark-theme-design.md`

## Global Constraints

- **Palette (exact):**

  | Role | Colour |
  |---|---|
  | Page | `#18181b` |
  | Card | `#27272a` |
  | Raised | `#3f3f46` |
  | Line | `#3f3f46` |
  | Line, strong | `#52525b` |
  | Text | `#f4f4f5` |
  | Muted | `#a1a1aa` |
  | Faint | `#71717a` |
  | Accent | `#3b82f6` |
  | Accent, soft (text, lines, links) | `#60a5fa` |
  | Text on accent | `#09090b` |
  | Warning text | `#fbbf24` |
  | Danger text | `#f87171` |
  | Success text | `#4ade80` |

  Warning and danger backgrounds are tints of those hues.
- **Finish / Done buttons** are light: text-colour background with page-colour text.
- **Meaning stays:**
  - amber for warning and over-target
  - red for delete, errors and ▼
  - green only for ▲ and "saved"
  - blue for actions, progress, ✓, the selected RPE, focus, checkboxes, links and the chart average line
- **Contrast** against the card: text ≥ 7:1, muted ≥ 4.5:1, on-accent against the accent ≥ 4.5:1. Warning, danger and success text ≥ 4.5:1.
- **iPhone parts:**
  - `<meta name="theme-color" content="#18181b">`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black">`
  - the manifest's `theme_color` and `background_color` are `#18181b`
  - `color-scheme: dark` on `html`
- **The camera screen** keeps its black and white (allow-listed in the guard).
- **Unchanged:** layout, spacing, copy and behaviour.
- **Commits** end with the session's attribution lines.

## Review Focus

1. **iOS form controls:** date inputs, selects and checkboxes are readable on dark (`color-scheme` and `accent-*`), with no white boxes. Checked by WebKit screenshots in Task 3.
2. **Over-target and warning states:** totals bars over target, the backup reminder, "Not weighed today", "Not saved" and the left-out lines are still visibly different from normal. Checked by the Task 3 screenshots.
3. **Disabled and pressed states:** disabled buttons, the pressed ✓ and RPE, and `active:` row feedback are still visible on dark. Checked by the Task 3 screenshots.
4. **Dialogs and the bottom bars:** these overlay content, and must have opaque dark backgrounds rather than the old `bg-white/95`. Checked by the Task 3 screenshots.
5. **A colour class the guard doesn't know**, for example one built in a template string. Checked by the guard's pattern and the screenshots.

---

### Task 1: Theme tokens, iPhone parts and icon

**Files:**
- Modify:
  - `src/index.css`: an `@theme` block with `--color-page`, `--color-card`, `--color-raised`, `--color-line`, `--color-line-strong`, `--color-fg`, `--color-muted`, `--color-faint`, `--color-accent`, `--color-accent-soft`, `--color-on-accent`, `--color-warn`, `--color-danger`, `--color-good`; `html` uses page and fg, plus `color-scheme: dark`
  - `index.html`
  - `vite.config.ts` (manifest colours)
  - `public/icon.svg`, `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`: a `#18181b` background with `#3b82f6` bars, regenerated from the SVG
- Create: `scripts/theme.test.ts` (`@vitest-environment node`)

**Interfaces:** Produces the utilities `bg-page`, `bg-card`, `bg-raised`, `border-line`, `ring-line`, `ring-line-strong`, `divide-line`, `text-fg`, `text-muted`, `text-faint`, `bg-accent`, `text-accent-soft`, `ring-accent`, `accent-accent`, `text-on-accent`, `text-warn`, `bg-warn/15`, `text-danger`, `bg-danger/15`, `text-good`, `stroke-accent-soft`, `fill-faint`.

- [ ] **Step 1: Write the failing test** `scripts/theme.test.ts`. It reads `src/index.css`, parses each `--color-*: #rrggbb`, and asserts:
  - every value in the Global Constraints table
  - the WCAG contrast ratios: fg/card ≥ 7, muted/card ≥ 4.5, on-accent/accent ≥ 4.5, warn/card ≥ 4.5, danger/card ≥ 4.5, good/card ≥ 4.5
  - `index.html` contains `content="#18181b"` for theme-color and `apple-mobile-web-app-status-bar-style" content="black"`
  - `vite.config.ts` contains `background_color: '#18181b'` and `theme_color: '#18181b'`
  - `public/icon.svg` contains `#18181b` and `#3b82f6`
- [ ] **Step 2: Run** `npx vitest run scripts/theme.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement.** Regenerate the PNGs from the SVG with whatever rasteriser the workspace has (for example `rsvg-convert` or Playwright), at 192, 512 and 180 px.
- [ ] **Step 4: Run** `npx vitest run scripts/theme.test.ts` → Expected: PASS. Then `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: dark theme colours, iPhone status bar and icon`.

---

### Task 2: Every screen on the theme colours

**Files:**
- Modify: `src/ui/styles.ts` and every `src/**/*.tsx` that uses the light palette (about 28 files)
- Modify: `scripts/theme.test.ts` (add the guard)

**Interfaces:** Consumes the Task 1 utilities.

- [ ] **Step 1: Write the failing guard** in `scripts/theme.test.ts`: `test('no screen uses the light palette')`.
  - It globs `src/**/*.{ts,tsx}`, skipping `*.test.*`.
  - It fails on any match of `/\b(bg|text|ring|border|divide|fill|stroke|accent|placeholder)-(white|black|zinc|emerald|green|amber|red|sky|gray|slate|neutral)(-\d+)?\b/`, plus `bg-white/` with an opacity.
  - It allows `src/ui/screens/ScanScreen.tsx` (the camera view stays black and white).
  - It reports `file:line` for each hit.
- [ ] **Step 2: Run** `npx vitest run scripts/theme.test.ts` → Expected: FAIL, listing the files.
- [ ] **Step 3: Convert each file.**
  - **Shared styles:**
    - `card` → `bg-card ring-1 ring-line` (no shadow)
    - `btnPrimary` → `bg-accent text-on-accent`
    - `btnSecondary` → `bg-raised text-fg`
    - `btnDone` → `bg-fg text-page`
    - `btnDanger` → `bg-raised text-danger`
    - `input` → `bg-raised text-fg ring-line placeholder:text-faint focus:ring-accent`
    - `row` → `active:bg-raised`
    - `sectionTitle` → `text-muted`
    - `errorText` → `text-danger`
  - **Screens:**
    - grays map to fg, muted or faint
    - emerald for actions and progress maps to accent (or accent-soft for text and lines)
    - emerald for "saved" or ▲ maps to good
    - amber maps to warn (with a `bg-warn/15` and `ring-warn/30` tint)
    - red maps to danger (with `bg-danger/15` and `ring-danger/30`)
    - bar tracks map to `bg-raised`
    - the bottom bars and header map to `bg-page/95` with a `border-line` hairline
- [ ] **Step 4: Run** `npm test && npx tsc -b && npm run build` → Expected: all pass, including the guard, and the build succeeds.
- [ ] **Step 5: Commit** `feat: every screen on the dark theme`.

---

### Task 3: Look at it on iPhone-size WebKit

**Files:** none in the repository. A Playwright script under `/tmp`.

- [ ] **Step 1: Take screenshots** with WebKit at the iPhone 13 size, with the plan import file and a little data. The screens:
  - Home, with a workout in progress, an over-target total and "Not weighed today"
  - the food log, a meal, a food's amount screen and Settings
  - the Weight screen with its chart
  - Workouts, a workout with ticked sets and RPE, the recap, and a dialog
- [ ] **Step 2: Check each screenshot** against the Review Focus list. Fix anything unreadable or missing, then run Task 2's Step 4 again.
- [ ] **Step 3: Commit any fixes** with `fix: dark theme details from the iPhone-size check`, or nothing if none were needed.
