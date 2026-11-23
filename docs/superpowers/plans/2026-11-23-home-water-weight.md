# Home, Water and Weight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app opens on a Home screen showing today's calories, macros, water and weight, with one tap to log each. There is a Weight screen with a 7-day average, weekly change, a 30-day chart and a history.

**Architecture:** Two new Dexie tables (`weights`, keyed by date; `water`, one record per tap) via schema version 2. The averages are pure functions in `src/domain/weight.ts`. Home and Weight are new routes built from the existing pieces (`TotalsCard`, `Screen`, `ConfirmDialog`, styles). The food log keeps its routes and gains a link back to Home.

**Tech Stack:** React 19 + TypeScript + Vite 8, Dexie 4 with dexie-react-hooks, React Router 7 (HashRouter), Vitest + jsdom + fake-indexeddb, Testing Library. No new dependencies; the chart is hand-drawn SVG.

**Spec:** `docs/superpowers/specs/2026-11-23-home-water-weight-design.md`. The overall app design is `docs/superpowers/specs/2026-11-16-fitness-app-design.md`.

## Global Constraints

- **Formats:** weights, averages and weekly change are kept and shown with 2 decimals (`78.45`). A decimal comma is accepted. Weights between 20 and 300 kg are accepted.
- **One weight per day:** `WeightEntry.id === date`, and logging again for a date replaces it.
- **Water:** one `WaterEntry` per tap; Undo removes the last tap of today only. Settings defaults are a 2000 ml target and 250 ml and 500 ml buttons.
- **Counted water:** drinks from the food log never count as water.
- **No Workouts button** in this step.
- **Copy:** `Not weighed today`, `No weight yet`, `Log weight`, `Food log`, `+ Log food`, `Water`, `Undo`, and the backup line `Last backup over 14 days ago — Export now`.
- **Backups:** the file stays `version: 1` with new `weights` and `water` lists. Older files without them still import.
- **Done:** on a meal dated today it goes to Home (`/`); on an earlier day's meal it goes to `/day/<that date>`.
- **Reopening on a new day:** a screen that belonged to the old today goes to Home.
- **Commits** end with the attribution lines given in the session.

## Review Focus

1. **Exporting a backup after changing water settings:** the water settings survive. Today `setLastExportAt` rewrites the whole settings record. Test: Task 2.
2. **A weight re-logged for a date whose entry was deleted:** it comes back as a live entry with the new value, not hidden. Test: Task 1.
3. **Gaps in weighing:** with no weigh-in in the last 7 days, the average shows as missing (not 0 or NaN). Weekly change is shown only when both weeks have data. Test: Task 1.
4. **Undo with no water today, or water only from yesterday:** nothing changes, and Undo is disabled. Test: Tasks 2 and 3.
5. **Opening Home just after midnight:** water and the nudge are for the new date. Yesterday's water doesn't carry over, and the weight card says "Not weighed today". Test: Task 3.

---

### Task 1: Weight storage and the averages

**Files:**
- Create: `src/domain/weight.ts`, `src/domain/weight.test.ts`, `src/db/weight.ts`, `src/db/weight.test.ts`
- Modify: `src/db/types.ts` (add `WeightEntry`), `src/db/db.ts` (`this.version(2).stores({ weights: 'id, date', water: 'id, date' })`, and declare `weights` and `water` tables)

**Interfaces:**
- **Produces, in `src/db/types.ts`:**
  - `WeightEntry extends BaseRecord { date: string; kg: number }` (`id === date`)
  - `WaterEntry extends BaseRecord { date: string; ml: number }` (used by Task 2; declared here with the table)
- **Produces, in `src/domain/weight.ts`:**
  - `parseWeight(input: string): number | null`
  - `formatKg(kg: number): string`
  - `formatChange(kg: number): string`, which gives `+0.40` or `−0.40` (true minus sign)
  - `average7(weights: { date: string; kg: number }[], endDate: string): number | null`
  - `weeklyChange(weights, endDate): number | null`
  - `averageSeries(weights, endDate, days = 30): { date: string; avg: number | null }[]`
- **Produces, in `src/db/weight.ts`:**
  - `logWeight(date: string, kg: number): Promise<WeightEntry>`
  - `deleteWeight(date: string): Promise<void>`
  - `listWeights(): Promise<WeightEntry[]>` (live entries, oldest first)

- [ ] **Step 1: Write the failing tests.**
  - **`src/domain/weight.test.ts`:**
    - `parseWeight('78,45')` → `78.45`; `parseWeight('78.456')` → `null` (more than 2 decimals); `parseWeight('19.9')`, `parseWeight('300.01')` and `parseWeight('')` → `null`.
    - `formatKg(78.4)` → `'78.40'`; `formatChange(-0.4)` → `'−0.40'`; `formatChange(0.25)` → `'+0.25'`; `formatChange(0)` → `'0.00'`.
    - With weights on 2026-11-17 (80) and 2026-11-23 (78), and 2026-11-10 (82) and 2026-11-12 (81):
      - `average7(w, '2026-11-23')` → `79`
      - `average7(w, '2026-11-16')` → `81.5`
      - `weeklyChange(w, '2026-11-23')` → `-2.5`
      - `average7([], '2026-11-23')` → `null`
      - `weeklyChange` with only this week's weights → `null`
      - an entry dated 2026-11-16 does not count in the week ending 2026-11-23
    - `averageSeries(w, '2026-11-23', 30)` has 30 items, the last with date `'2026-11-23'` and avg 79; days before any weigh-in have `avg: null`.
  - **`src/db/weight.test.ts`:**
    - `logWeight('2026-11-23', 78.45)` and then `logWeight('2026-11-23', 78.1)` leave one entry, with kg 78.1 and the original `createdAt`.
    - `deleteWeight('2026-11-23')` → `listWeights()` is `[]`. Then `logWeight('2026-11-23', 77.9)` → `listWeights()` has it (live again).
    - `listWeights()` comes back sorted by date.
- [ ] **Step 2: Run** `npm test -- weight` → Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.**
  - `parseWeight` uses `parseAmount` (Step 1's helper), then checks the 20–300 range and at most 2 decimals.
  - The averages are a plain mean of the entries whose date falls in `[addDays(end, -6), end]`.
  - `logWeight` is an upsert by `id = date` that keeps `createdAt` and drops `deletedAt`.
- [ ] **Step 4: Run** `npm test -- weight` → Expected: PASS. Then run `npm test` → Expected: everything passes (the schema upgrade breaks nothing).
- [ ] **Step 5: Commit** `feat: weight storage, 7-day average and weekly change`.

---

### Task 2: Water storage, water settings, backups

**Files:**
- Create: `src/db/water.ts`, `src/db/water.test.ts`
- Modify:
  - `src/db/types.ts`: `Settings` gets `waterTargetMl?: number; waterSmallMl?: number; waterLargeMl?: number`
  - `src/db/backup.ts`: `RECORD_TABLES` adds `'weights'` and `'water'`. `SHAPES` adds `weights` (string `date`, number `kg`) and `water` (string `date`, number `ml`). `settings` also allows the three numbers. `setLastExportAt` keeps the record's other fields.
  - `src/db/backup.test.ts`

**Interfaces:**
- **Consumes:** `WaterEntry` and the `water` table (Task 1).
- **Produces, in `src/db/water.ts`:**
  - `type WaterSettings = { targetMl: number; smallMl: number; largeMl: number }`
  - `WATER_DEFAULTS: WaterSettings = { targetMl: 2000, smallMl: 250, largeMl: 500 }`
  - `addWater(date: string, ml: number): Promise<WaterEntry>`
  - `undoWater(date: string): Promise<boolean>`
  - `waterTotal(date: string): Promise<number>`
  - `getWaterSettings(): Promise<WaterSettings>`
  - `setWaterSettings(s: WaterSettings): Promise<void>`

- [ ] **Step 1: Write the failing tests.**
  - **`src/db/water.test.ts`:**
    - `addWater` 250, 500 and 250 on `'2026-11-23'` gives a `waterTotal` of 1000. `undoWater('2026-11-23')` → `true`, and the total is 750 (the last 250 is removed, while the clock is frozen; this relies on the existing strictly increasing `nowIso`).
    - `undoWater` on a date with no water → `false`. Water on `'2026-11-22'` is not touched by `undoWater('2026-11-23')`.
    - `getWaterSettings()` → `WATER_DEFAULTS` at first. After `setWaterSettings({ targetMl: 2500, smallMl: 330, largeMl: 750 })` it returns those values.
  - **`src/db/backup.test.ts`:**
    - After `setWaterSettings({ targetMl: 2500, smallMl: 330, largeMl: 750 })` and `exportAll()`, `getWaterSettings()` still returns 2500, 330 and 750.
    - Export → reset → import keeps a weight (`logWeight`) and a water tap. The export has `records.weights` and `records.water`.
    - A version-1 file without `weights` and `water` imports fine.
    - A `water` record with `ml: 'lots'` → `ImportError`.
- [ ] **Step 2: Run** `npm test -- water backup` → Expected: FAIL.
- [ ] **Step 3: Implement.** `undoWater` soft-deletes the live entry of that date with the greatest `createdAt`. The settings fall back to the defaults field by field. `setLastExportAt` and `setWaterSettings` both spread the existing settings record before changing their own fields.
- [ ] **Step 4: Run** `npm test` → Expected: everything passes.
- [ ] **Step 5: Commit** `feat: water storage and settings; backups include weights and water`.

---

### Task 3: Home screen, and the food log becomes secondary

**Files:**
- Create: `src/ui/screens/HomeScreen.tsx`, `src/ui/screens/home.test.tsx`, `src/ui/format.ts` addition `formatLitres(ml: number): string` (`1250` → `'1.25'`, `2000` → `'2'`, `500` → `'0.5'`)
- Modify:
  - `src/App.tsx`: route `/` → `HomeScreen` (replacing `ToToday` there; the `*` fallback goes to `/`). In `NewDayWatcher`, an old-today screen navigates to `/`.
  - `src/ui/screens/TodayScreen.tsx`: a `Home` link in the header (aria-label `Home`, to `/`). The backup banner and the Settings button are removed (Recipes stays).
  - `src/ui/screens/MealScreen.tsx`: Done → `/` when `meal.date === localDate(new Date())`, else `/day/<date>`.
  - Tests that assumed the old start: `today.test.tsx` (root route, new-day reopening, backup banner), `meal.test.tsx` (Done, new-day reopening), `settings.test.tsx` (the "Today links to Settings and Recipes" test becomes "Home links to Settings; the food log links to Recipes").

**Interfaces:**
- **Consumes:**
  - `listWeights`, `average7`, `weeklyChange`, `formatKg`, `formatChange` (Task 1)
  - `addWater`, `undoWater`, `waterTotal`, `getWaterSettings` (Task 2)
  - `getDay`, `getTargetsFor`, `firstEntryAt`, `backupDue`, `TotalsCard` (existing)

- [ ] **Step 1: Write the failing tests** in `src/ui/screens/home.test.tsx`. The clock is set to 2026-11-23T10:00Z.
  - **Opening `#/`:** shows heading `Mon 23 Nov`, the `Totals` region, `Water` with `0 / 2 L`, the text `No weight yet`, links `Food log` and `+ Log food`, and link `Settings` (the gear). There is no `Workouts` text.
  - **Water buttons:** tapping `+250 ml` twice and then `+500 ml` shows `1 / 2 L`. `Undo` → `0.5 / 2 L`. With 0 ml today, `Undo` is disabled.
  - **Yesterday's water:** water logged on 2026-11-22 doesn't show; it's `0 / 2 L` and Undo is disabled.
  - **Weight card:** weights 80 on 2026-11-17, 78 on 2026-11-22, 82 on 2026-11-12 and 81 on 2026-11-10 show `78.00 kg`, `7-day avg 79.00 kg`, `−2.50 kg/wk` and `Not weighed today`. After `logWeight('2026-11-23', 77.5)`, `Not weighed today` is gone.
  - **Food:** a quick add of 700 kcal today shows `700 kcal` in Totals.
  - **Links:** `Food log` opens `Mon 23 Nov` with the `Day complete` checkbox. `+ Log food` opens `Add to…`. The weight card links to `#/weight`.
  - **Backup reminder:** an entry dated 2026-10-01 with no export shows `Last backup over 14 days ago — Export now` on Home. The food log no longer shows it.
  - **Food log's Home link:** opens Home.
  - **Done:** on a meal dated 2026-11-23 it opens Home. On a meal dated 2026-11-20 it opens `Fri 20 Nov`.
  - **Reopening the next morning:** rendered at 22:00 on 2026-11-23 with water 500, then the clock set to 2026-11-24T08:00Z and `visibilitychange` dispatched → heading `Tue 24 Nov`, `0 / 2 L`, `Not weighed today` or `No weight yet`.
- [ ] **Step 2: Run** `npm test -- home` → Expected: FAIL.
- [ ] **Step 3: Implement `HomeScreen`.**
  - **Date:** today, from `localDate(new Date())` at render time.
  - **Water buttons:** labels `+${smallMl} ml` and `+${largeMl} ml`, with a progress bar (`role="progressbar"`, aria-label `Water`).
  - **Weight card:** a `Link` to `/weight` with aria-label `Weight`. The latest value is the newest entry dated on or before today. The nudge shows when no entry is dated today and at least one weight exists. With none, it shows `No weight yet` and a `Log weight` link to `/weight`.
  - **Update the old-start tests** listed under Files to the new behaviour.
- [ ] **Step 4: Run** `npm test` → Expected: everything passes.
- [ ] **Step 5: Commit** `feat: Home screen with calories, water and weight; food log becomes secondary`.

---

### Task 4: Weight screen

**Files:**
- Create: `src/ui/screens/WeightScreen.tsx`, `src/ui/components/WeightChart.tsx`, `src/ui/screens/weight.test.tsx`
- Modify: `src/App.tsx` (route `/weight`)

**Interfaces:**
- **Consumes:** `parseWeight`, `formatKg`, `averageSeries` (Task 1); `logWeight`, `deleteWeight`, `listWeights` (Task 1); `ConfirmDialog`, `Screen`, `Field` (existing).
- **Produces:** `WeightChart({ weights, endDate }: { weights: WeightEntry[]; endDate: string })`. This is an SVG (`role="img"`, aria-label `Last 30 days`) with one `<circle data-testid="weigh-in">` per weigh-in in the last 30 days and one `<polyline data-testid="average-line">` when any average exists. The vertical axis is fitted to the min and max of the shown values ±0.5 kg.

- [ ] **Step 1: Write the failing tests** in `src/ui/screens/weight.test.tsx`. The clock is 2026-11-23T10:00Z.
  - **Empty start:** with no weights, `Weight (kg)` is empty, `Date` is `2026-11-23`, and the text `No weighings yet` shows.
  - **Pre-filled:** after `logWeight('2026-11-20', 78.45)`, `Weight (kg)` reads `78.45`.
  - **Comma and save:** typing `78,1` and tapping `Save weight` saves 78.1 for 2026-11-23, and history shows `Mon 23 Nov · 78.10 kg`.
  - **Rejected values:** `7810` and `78.123` show `Enter a weight between 20 and 300 kg, with up to 2 decimals`, and nothing is saved.
  - **Past date:** changing `Date` to `2026-11-21` and saving logs that date. Saving again on the same date replaces it (one entry).
  - **Edit:** tapping `Edit` on a history row puts its date and weight in the form.
  - **Delete:** `Delete` asks `Delete the weight for Sat 21 Nov?`, and confirming removes it.
  - **Chart:** weights on 2026-11-23, 2026-11-20 and 2026-10-01 → 2 `weigh-in` circles (the October one is outside 30 days) and 1 `average-line`. With no weights, no chart.
  - **Back:** returns to Home.
- [ ] **Step 2: Run** `npm test -- weight.test` → Expected: FAIL.
- [ ] **Step 3: Implement** the form, chart and list. The form remounts when `Edit` loads an entry. The history list is newest first.
- [ ] **Step 4: Run** `npm test && npx tsc -b` → Expected: both pass.
- [ ] **Step 5: Commit** `feat: Weight screen with chart and history`.

---

### Task 5: Water settings in Settings

**Files:**
- Modify: `src/ui/screens/SettingsScreen.tsx` (a `Water` section), `src/ui/screens/settings.test.tsx`

**Interfaces:**
- **Consumes:** `getWaterSettings`, `setWaterSettings`, `WATER_DEFAULTS` (Task 2).

- [ ] **Step 1: Write the failing tests** in `settings.test.tsx`.
  - **Defaults:** Settings shows `Daily water target (ml)` `2000`, `Small water button (ml)` `250` and `Large water button (ml)` `500`.
  - **Saving:** changing them to `2500`, `330` and `750` and tapping `Save water settings` stores them, and Home then shows `+330 ml`, `+750 ml` and `0 / 2.5 L`.
  - **Bad values:** `0` or `abc` in a field shows `<label>: enter a number` and nothing changes.
- [ ] **Step 2: Run** `npm test -- settings` → Expected: FAIL.
- [ ] **Step 3: Implement** the section, using the same patterns as `TargetsForm` (`parseAmount`, `Field`, status and alert notes).
- [ ] **Step 4: Run** `npm test && npx tsc -b && npm run build` → Expected: everything passes, and the build succeeds.
- [ ] **Step 5: Commit** `feat: water target and button sizes in Settings`.

---

### After the tasks

Run the final whole-branch review, merge into `main`, push, wait for GitHub Pages, then check the live app at phone size:
- it opens on Home
- water buttons and Undo work
- logging a weight shows on Home and the chart
- Food log and + Log food work
- Done returns Home
