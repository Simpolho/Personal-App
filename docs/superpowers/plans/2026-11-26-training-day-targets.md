# Training-Day and Rest-Day Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two sets of targets (Training day, Rest day) and a per-day switch on Home and the food log that picks which set the day's totals use.

**Architecture:**
- The targets record keeps its fields as the Training day set and gains an optional `rest` set.
- The day record (`days`, `id === date`) gains an optional `kind`. An absent kind means the weekly plan decides: a live routine on that weekday makes it a Training day.
- One data function, `getDayTargets(date)`, gives every screen the day's set, its kind and whether the switch shows.
- `getTargetsFor(date)` becomes day-aware, so the amount and recipe portion screens follow without code changes.
- Day records don't affect the backup reminder, because `firstEntryAt` counts only log entries. So a day saved only for its kind changes nothing there.

**Tech Stack:** React 19, TypeScript, Dexie 4 + dexie-react-hooks, Tailwind 4 theme tokens, Vitest + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-26-training-day-targets-design.md`

## Global Constraints

- No Dexie version change. `kind` and `rest` are plain, unindexed fields.
- **Exact copy:**
  - switch options `Training day` and `Rest day`
  - switch group label `Kind of day`
  - Settings column headings `Training day` and `Rest day`
  - Settings input labels `<NUTRIENT_LABELS[key]>, training day` and `<NUTRIENT_LABELS[key]>, rest day` (for example `Calories (kcal), rest day`)
  - Settings error `<input label>: enter a number` (for example `Calories (kcal), rest day: enter a number`)
- Unchanged copy:
  - the Settings note "Daily targets. Each one is optional; leave a box empty for no target."
  - the button "Save — applies from today"
  - the two saved messages
- Colours come from the theme tokens only (`scripts/theme.test.ts` guards this). Switch: selected `bg-accent text-on-accent`, other `text-muted`.
- The repo is public. Tests and docs use generic numbers (2400/2000, 2300). Never use the user's real plan numbers.
- Test dates (TZ Europe/Lisbon):
  - 2026-11-15 is a Sunday
  - 2026-11-16 is a Monday
  - 2026-11-17 is a Tuesday
  - 2026-11-23 is a Monday
  - JS weekday numbers: Sunday 0, Monday 1
- Test command for every task: `npm test`. The suite is 307 tests before Task 1.

## Review Focus

1. **The switch and the Day complete tick on the same day.** Each keeps the other's value. Switching a day with no record creates one that is not complete. (Task 1 test.)
2. **Settings on a rest day.** Settings pre-fills each column from the record's own sets, never the day-resolved set. So the Training day column never shows rest numbers. (Task 2 test.)
3. **Backups.** Old backups without `rest`/`kind` still import. A `kind` other than `training`/`rest`, or a non-number in `rest`, is refused. (Task 1 tests.)
4. **A deleted routine** on that weekday doesn't make a Training day. (Task 1 test.)
5. **The switch is hidden** when the rest set is empty, and when no targets are set at all. A rest set with an empty main set gives no targets on Training days. (Task 1 and Task 3 tests.)

---

### Task 1: Data — two target sets, the day's kind, backups

**Files:**
- Modify: `src/db/types.ts` (`Day`, `Targets`, new `DayKind`)
- Modify: `src/domain/targets.ts`
- Modify: `src/db/targets.ts`
- Modify: `src/db/log.ts` (add `setDayKind` next to `setDayComplete`)
- Modify: `src/db/backup.ts` (`SHAPES.days`, `SHAPES.targets`)
- Test: `src/domain/targets.test.ts`, `src/db/targets.test.ts`, `src/db/log.test.ts`, `src/db/backup.test.ts`

**Interfaces:**
- Consumes: `routinesForDate(routines, date)` from `src/domain/workouts.ts`; `listRoutines()` from `src/db/workouts.ts` (live routines only)
- Produces:
  - `src/db/types.ts`:
    - `export type DayKind = 'training' | 'rest'`
    - `Day.kind?: DayKind`
    - `Targets.rest?: Partial<Record<'kcal' | 'protein' | 'carbs' | 'fat', number>>`
  - `src/domain/targets.ts`:
    - `export interface TargetSets { main: TargetValues; rest: TargetValues }`
    - `targetSetsFor(date: string, list: Targets[]): TargetSets | null`: the record in force (same rule as today's `targetsFor`), both sets passed through `cleanTargets`. Null when no record is in force.
    - `pickTargets(sets: TargetSets | null, kind: DayKind): TargetValues | null`: an empty rest set means use main; otherwise rest on `'rest'`, main on `'training'`. Null when the chosen set is empty.
    - `hasRestSet(sets: TargetSets | null): boolean`
    - `targetsFor(date: string, list: Targets[], kind: DayKind = 'training'): TargetValues | null`, equal to `pickTargets(targetSetsFor(date, list), kind)`
    - `dayKindFor(saved: DayKind | undefined, routines: Routine[], date: string): DayKind`
  - `src/db/targets.ts`:
    - `setTargets(effectiveFrom: string, values: TargetValues, rest: TargetValues = {}): Promise<Targets>`: stores `rest` only when its cleaned form has a value. A same-day replace drops an old `rest` when the new one is empty.
    - `getTargetSetsFor(date: string): Promise<TargetSets | null>`
    - `export interface DayTargets { targets: TargetValues | null; kind: DayKind; split: boolean }`
    - `getDayTargets(date: string): Promise<DayTargets>`: `kind` comes from the live day record's `kind` and `listRoutines()`; `split = hasRestSet(sets)`
    - `getTargetsFor(date: string): Promise<TargetValues | null>`, now `(await getDayTargets(date)).targets`
  - `src/db/log.ts`: `setDayKind(date: string, kind: DayKind): Promise<void>`. It mirrors `setDayComplete`: it undeletes and keeps `complete`, and a new record gets `complete: false`.

- [ ] **Step 1: Write the failing domain tests** in `src/domain/targets.test.ts`. Extend the `rec` helper to accept a `rest` set.

```ts
test('the rest set applies on a rest day, the main set otherwise', () => {
  const list = [rec('2026-11-01', { kcal: 2400, carbs: 280 }, undefined, { kcal: 2000, carbs: 180 })];
  expect(targetsFor('2026-11-16', list, 'rest')).toEqual({ kcal: 2000, carbs: 180 });
  expect(targetsFor('2026-11-16', list, 'training')).toEqual({ kcal: 2400, carbs: 280 });
  expect(targetsFor('2026-11-16', list)).toEqual({ kcal: 2400, carbs: 280 });
});
test('with no rest values every day uses the main set', () => {
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 })], 'rest')).toEqual({ kcal: 2300 });
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 }, undefined, {})], 'rest')).toEqual({ kcal: 2300 });
});
test('a rest set alone gives no targets on training days', () => {
  const list = [rec('2026-11-01', {}, undefined, { kcal: 2000 })];
  expect(targetsFor('2026-11-16', list, 'training')).toBeNull();
  expect(targetsFor('2026-11-16', list, 'rest')).toEqual({ kcal: 2000 });
});
test('targetSetsFor gives both cleaned sets of the record in force', () => {
  const list = [rec('2026-11-01', { kcal: 2400 }, undefined, { kcal: -5, protein: 150 })];
  expect(targetSetsFor('2026-10-31', list)).toBeNull();
  expect(targetSetsFor('2026-11-16', list)).toEqual({ main: { kcal: 2400 }, rest: { protein: 150 } });
});
test('hasRestSet is true only when the rest set has a value', () => {
  expect(hasRestSet(null)).toBe(false);
  expect(hasRestSet({ main: { kcal: 2400 }, rest: {} })).toBe(false);
  expect(hasRestSet({ main: {}, rest: { kcal: 2000 } })).toBe(true);
});
test('dayKindFor: a saved choice wins, otherwise the weekly plan', () => {
  const monday = [{ weekdays: [1] }] as Routine[];
  expect(dayKindFor(undefined, monday, '2026-11-16')).toBe('training');
  expect(dayKindFor(undefined, monday, '2026-11-17')).toBe('rest');
  expect(dayKindFor('rest', monday, '2026-11-16')).toBe('rest');
  expect(dayKindFor('training', [], '2026-11-17')).toBe('training');
});
```

- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/domain/targets.test.ts`. Expected: FAIL; `targetSetsFor`, `hasRestSet` and `dayKindFor` are not exported, and `targetsFor` ignores the kind.

- [ ] **Step 3: Implement the types and domain functions** listed in Interfaces. Run `npx vitest run src/domain/targets.test.ts`. Expected: PASS, including the four existing tests.

- [ ] **Step 4: Write the failing data tests.**

`src/db/targets.test.ts`:
- `setTargets keeps a rest set, and an empty one is not stored`:
  - `setTargets('2026-11-16', { kcal: 2400 }, { kcal: 2000 })`, then `getTargetSetsFor('2026-11-20')` gives `{ main: { kcal: 2400 }, rest: { kcal: 2000 } }`.
  - Then `setTargets('2026-11-16', { kcal: 2400 })`: `(await listTargets())[0].rest` is `undefined`, and the list still has length 1.
- `getDayTargets follows the weekly plan until the day is switched`:
  - Set up a routine with `weekdays: [1]` and `setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 })`.
  - `'2026-11-16'` gives `{ targets: { kcal: 2400 }, kind: 'training', split: true }`.
  - `'2026-11-17'` gives `{ targets: { kcal: 2000 }, kind: 'rest', split: true }`.
  - After `setDayKind('2026-11-16', 'rest')`, `'2026-11-16'` gives `kind: 'rest'` and `targets: { kcal: 2000 }`, and `getTargetsFor('2026-11-16')` gives `{ kcal: 2000 }`.
- `a deleted routine does not make a training day`: save a routine with `weekdays: [2]`, then `deleteRoutine` it. `getDayTargets('2026-11-17')` has `kind: 'rest'`.
- `with one set there is no switch and every day uses it`: `setTargets('2026-11-01', { kcal: 2300 })`. `getDayTargets('2026-11-17')` gives `{ targets: { kcal: 2300 }, kind: 'rest', split: false }`.

Set up routines with `saveRoutine({ name, weekdays, items: [] })` and `deleteRoutine(id)` from `src/db/workouts.ts`.

`src/db/log.test.ts`:
- `setDayKind and setDayComplete keep each other's value`:
  - After `setDayKind('2026-11-16', 'rest')`: `db.days.get('2026-11-16')` has `kind: 'rest'` and `complete: false`, and `(await getDay('2026-11-16')).complete` is `false`.
  - After `setDayComplete('2026-11-16', true)`: the record has `kind: 'rest'` and `complete: true`.
  - After `setDayKind('2026-11-16', 'training')`: the record has `kind: 'training'` and `complete: true`.

`src/db/backup.test.ts`:
- `a rest-day set and day choices go through a backup and back`:
  - Set up `setTargets(... , { kcal: 2400 }, { kcal: 2000 })` and `setDayKind('2026-11-16', 'rest')`.
  - Export, `resetDb()`, import.
  - `getTargetSetsFor` and `db.days.get('2026-11-16')` give the same values as before.
- `a damaged day choice or rest set is refused`: follow the existing "records with missing or wrong fields are refused" test. A day with `kind: 'gym'` is rejected, and a targets record with `rest: { kcal: 'x' }` is rejected. Each is rejected whole.

- [ ] **Step 5: Run them and watch them fail.** Run `npx vitest run src/db`. Expected: FAIL on the new tests (missing exports, `rest` not stored, shapes not checked). The existing tests pass.

- [ ] **Step 6: Implement** `setTargets`, `getTargetSetsFor`, `getDayTargets`, the day-aware `getTargetsFor`, `setDayKind`, and the two `SHAPES` checks:
  - `days`: `kind` is undefined, `'training'` or `'rest'`
  - `targets`: `rest` is undefined, or an object whose `kcal`/`protein`/`carbs`/`fat` are undefined or numbers

  Run `npx vitest run src/db`. Expected: PASS.

- [ ] **Step 7: Run the suite and commit.** Run `npm test`. Expected: all pass (307 plus this task's new tests).

```bash
git add src/db src/domain
git commit -m "feat: rest-day targets and a training or rest choice per day (data)"
```

---

### Task 2: Settings — Training day and Rest day columns

**Files:**
- Modify: `src/ui/screens/SettingsScreen.tsx` (`TargetsForm`, `SettingsScreen`)
- Test: `src/ui/screens/settings.test.tsx`

**Interfaces:**
- Consumes: `getTargetSetsFor(date)`, `setTargets(effectiveFrom, values, rest)`, `setDayKind` (tests only), `TargetSets`
- Produces: none used by later tasks

- [ ] **Step 1: Update the three existing target tests and add three new ones** in `settings.test.tsx`.

Existing tests:
- They now type into `Calories (kcal), training day` and `Protein (g), training day`.
- Their assertions are unchanged, except the error, which becomes `Calories (kcal), training day: enter a number`.

New tests:
- `both columns save, and the rest set applies from today`:
  - Type `2400` and `280` into the training day calories and carbs boxes, and `2000` and `180` into the rest day boxes, then click Save.
  - `getTargetSetsFor('2026-11-16')` gives `{ main: { kcal: 2400, carbs: 280 }, rest: { kcal: 2000, carbs: 180 } }`.
  - `getTargetSetsFor('2026-11-15')` is `null`.
- `on a rest day each column still shows its own numbers`:
  - Set up `setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 })` and `setDayKind('2026-11-16', 'rest')`.
  - `Calories (kcal), training day` shows `2400`, and `Calories (kcal), rest day` shows `2000`.
- `a rest-day box that is not a number is refused`:
  - Type `lots` into `Calories (kcal), rest day` and save.
  - `Calories (kcal), rest day: enter a number` shows, and `getTargetSetsFor('2026-11-16')` is `null`.

- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/ui/screens/settings.test.tsx`. Expected: FAIL; the labelled inputs don't exist yet.

- [ ] **Step 3: Implement the two-column form.**
  - `SettingsScreen` loads `getTargetSetsFor(today)`, and `TargetsForm` takes `current: TargetSets | null`.
  - Lay the form out as a 3-column grid (`grid-cols-[auto_1fr_1fr]`): a heading row (empty cell, `Training day`, `Rest day`, in `text-sm text-muted`), then one row per `TARGET_KEYS` key. Each row is the `NUTRIENT_LABELS` text, then two `input`-styled boxes with the Global Constraints labels as `aria-label`.
  - Save checks the training day column first, then the rest day column, and stops at the first bad box with its error.
  - Save calls `setTargets(today, main, rest)`. Show "Targets turned off from today." only when both sets are empty.

  Run `npx vitest run src/ui/screens/settings.test.tsx`. Expected: PASS.

- [ ] **Step 4: Run the suite and commit.** Run `npm test`. Expected: all pass.

```bash
git add src/ui/screens/SettingsScreen.tsx src/ui/screens/settings.test.tsx
git commit -m "feat: Settings has Training day and Rest day target columns"
```

---

### Task 3: The switch on Home and the food log

**Files:**
- Create: `src/ui/components/DayKindSwitch.tsx`
- Modify: `src/ui/components/TotalsCard.tsx`, `src/ui/screens/HomeScreen.tsx`, `src/ui/screens/TodayScreen.tsx`
- Test: `src/ui/screens/home.test.tsx`, `src/ui/screens/today.test.tsx`, `src/ui/screens/addfood.test.tsx`

**Interfaces:**
- Consumes: `getDayTargets(date): Promise<DayTargets>`, `setDayKind(date, kind)`, `DayKind`
- Produces:
  - `DayKindSwitch({ kind, onChange }: { kind: DayKind; onChange: (kind: DayKind) => void })`
  - `TotalsCard` gains optional `kind?: DayKind` and `onKindChange?: (kind: DayKind) => void`. The switch renders first inside the card only when both are given.

- [ ] **Step 1: Write the failing screen tests.**

`home.test.tsx`:
- `on a planned training day Home starts on Training day, and Rest day switches the targets`:
  - Set up a routine with `weekdays: [1]`, `setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 })`, and a 1000 kcal quick add on 2026-11-23.
  - `getByRole('radio', { name: 'Training day' })` has `aria-checked="true"`, and `1000 / 2400 kcal` shows.
  - Click `Rest day`: `1000 / 2000 kcal` shows, and `(await getDayTargets('2026-11-23')).kind` is `'rest'`.
- `without rest-day targets there is no switch`:
  - Set up `setTargets('2026-11-01', { kcal: 2300 })`.
  - Wait for the Totals region's `aria-busy="false"`. `queryByRole('radiogroup', { name: 'Kind of day' })` is `null`.
  - The same holds with no targets at all.

`today.test.tsx`:
- `a past day can be switched from the food log`:
  - Set up `setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 })`, with no routines.
  - Render `#/day/2026-11-15`. `Rest day` is checked and `0 / 2000 kcal` shows.
  - Click `Training day`: `0 / 2400 kcal` shows. `getDayTargets('2026-11-15')` has `kind: 'training'`, and `getDayTargets('2026-11-16')` still has `kind: 'rest'`.

`addfood.test.tsx`:
- `"Left after this" uses the day's targets`:
  - Set up `setTargets('2026-11-01', { kcal: 2400 }, { kcal: 2000 })`, with no routines, so 2026-11-16 is a Rest day.
  - The oats amount screen shows `Left after this: 1621 kcal`.
  - After `setDayKind('2026-11-16', 'training')`, it shows `Left after this: 2021 kcal`.
  - The recipe portion screen reads the same `getTargetsFor(meal.date)`, so this test and Task 1's `getDayTargets`/`getTargetsFor` tests cover it.

- [ ] **Step 2: Run them and watch them fail.** Run `npx vitest run src/ui/screens/home.test.tsx src/ui/screens/today.test.tsx src/ui/screens/addfood.test.tsx`. Expected:
  - The home and today tests FAIL: there's no switch, and the totals use the training set.
  - The addfood test may already pass, because `getTargetsFor` became day-aware in Task 1. That is expected. Record it in the ledger as covered by Task 1.

- [ ] **Step 3: Implement the switch and wire it in.**
  - **`DayKindSwitch`:**
    - a `role="radiogroup"` with `aria-label="Kind of day"`
    - two `button`s with `role="radio"` and `aria-checked`, labelled `Training day` and `Rest day`
    - track `grid grid-cols-2 gap-1 rounded-xl bg-page p-1 ring-1 ring-line`
    - buttons `min-h-11 rounded-lg text-sm font-medium`
    - selected `bg-accent text-on-accent`, other `text-muted`
  - **`TotalsCard`:** renders the switch at the top of the card when `kind` and `onKindChange` are both given.
  - **Home and the food log day:**
    - Load `getDayTargets(today)` (or `date`) in place of `getTargetsFor`.
    - Pass `targets`.
    - Pass `kind` and `onKindChange={(k) => void setDayKind(date, k)}` only when `split` is true.
    - `loading` stays true until the day targets are read.

  Run the three test files again. Expected: PASS.

- [ ] **Step 4: Run the suite and commit.** Run `npm test`. Expected: all pass, including `scripts/theme.test.ts`.

```bash
git add src/ui
git commit -m "feat: Training day / Rest day switch on Home and the food log"
```
