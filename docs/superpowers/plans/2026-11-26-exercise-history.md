# Exercise History and kg / lb Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Exercises use only kg or lb, and the existing data is cleaned up once.
- kg / lb can be switched from the workout screen.
- Each exercise gets a history screen listing every session, with its best set and estimated max.

**Architecture:**
- **Clean-up:** a pure domain function `cleanUpUnits` decides which exercises, routines and workouts change. A Dexie version 4 upgrade runs it once, and `importAll` runs it after every import.
- **Units in the data:**
  - Exercises become `'kg' | 'lb'`.
  - Workout entries become `'kg' | 'lb' | 'plates'`. Plates stays only so old sets can be shown.
  - Bodyweight disappears.
- **History:** worked out on the fly from finished workouts through the existing `exerciseIds` index. A pure `src/domain/history.ts` does the arithmetic, and a new screen at `/exercises/:id/history` shows it.

**Tech Stack:** React 19, TypeScript, Dexie 4 + dexie-react-hooks, React Router 7 HashRouter, Tailwind 4 theme tokens, Vitest + Testing Library + fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-11-26-exercise-history-design.md`

## Global Constraints

- **Database:**
  - Dexie `version(4)`, with no store or index changes; it's only an `.upgrade()`.
  - No new dependencies.
- **Exact copy:**
  - unit choice group label `Unit`, with options `kg` and `lb`
  - history empty state `No sessions yet.`
  - history header line `<muscle> · <unit>`
  - best line `Best: <weight> × <reps>[ <unit if not the current one>] · est. max <n> <current unit> (<formatDayLabel(date)>)`
  - per-session best `Best <weight>×<reps>[ · est. max <n>]`
  - recap note for plates `isn't in the volume: logged in plates.`
  - editor button `Edit`
- **Estimated max (Epley):** `reps === 1 ? weight : weight × (1 + reps / 30)`. Rounded with `Math.round` only for display. lb→kg is ×0.45359237 (the existing `KG_PER_LB`).
- **Colours:** theme tokens only (`scripts/theme.test.ts`). The unit switch looks like `DayKindSwitch`: track `bg-page ring-1 ring-line`, selected `bg-accent text-on-accent`, other `text-muted`, buttons `min-h-11`.
- **Privacy:** the repo is public. Tests and docs use generic exercise names (Bench, Raise, Leg extension, Back extension). Nothing from `.superpowers/private/` is committed.
- **Test dates (TZ Europe/Lisbon):** 2026-11-16 is a Monday, 2026-11-17 a Tuesday, 2026-11-23 a Monday, 2026-11-26 a Thursday. `formatDayLabel('2026-11-17')` is `Tue 17 Nov`.
- **Test command for every task:** `npm test`. The suite is 329 tests before Task 1.

## Review Focus

1. **Saving an exercise in the editor keeps an existing `plateWeight`,** even though its boxes are gone. Old plate sets of that exercise then still count in recaps. (Task 2 test.)
2. **The upgrade on a real version 3 database.** (Task 1 test.)
   - Plates and bodyweight exercises become kg.
   - Bodyweight entries become kg, and an empty weight becomes 0.
   - Plate-count start weights are cleared.
   - Plates entries and every other record are left untouched. Only changed records get a new `updatedAt`.
3. **Backups after the clean-up.** Re-importing an old backup can't bring plates or bodyweight back to exercises. Importing an old backup into an empty app comes out cleaned. (Task 1 tests.)
4. **Tapping an exercise's name mid-workout waits for pending saves** before leaving. Coming back shows every change. (Task 4 test.)
5. **The unit switch on finished workouts.** On a finished workout it changes only that entry, not the exercise's unit. A finished plates entry has no switch at all. (Task 2 tests.)

---

### Task 1: kg / lb only in the data, and the one-time clean-up

**Files:**
- Modify:
  - `src/db/types.ts`: `ExerciseUnit`, `EntryUnit` and `WeightUnit` (remove), plus `Exercise.unit` and `WorkoutEntry.unit`
  - `src/domain/workouts.ts`: `WEIGHT_UNITS`, `setKg`, `recapOf`, `Recap`, new `cleanUpUnits`
  - `src/db/db.ts`: version 4 upgrade
  - `src/db/backup.ts`: shapes accept the old units; the clean-up runs after import
  - `src/db/workouts.ts`: unit types, new `setExerciseUnit`
  - `src/ui/screens/RecapScreen.tsx`: no `bodyKgOn`, plates copy
  - any other file the type change touches
- Test:
  - `src/domain/workouts.test.ts`
  - `src/db/upgrade.test.ts` (new)
  - `src/db/backup.test.ts`
  - `src/db/workouts.test.ts`
  - `src/ui/screens/recap.test.tsx`

**Interfaces:**
- Produces:
  - `src/db/types.ts`:
    - `export type ExerciseUnit = 'kg' | 'lb'`
    - `export type EntryUnit = ExerciseUnit | 'plates'`
    - `Exercise.unit: ExerciseUnit`
    - `WorkoutEntry.unit: EntryUnit`
    - `WeightUnit` is removed. Replace its uses with whichever of the two fits.
  - `src/domain/workouts.ts`:
    - `WEIGHT_UNITS: readonly ExerciseUnit[] = ['kg', 'lb']`
    - `setKg(weight: number | undefined, unit: EntryUnit, exercise: Pick<Exercise, 'plateWeight'>): number | null`: the `bodyKg` parameter and the bodyweight case are gone
    - `recapOf(workout, exercises): Recap`: no `bodyKg`
    - `Recap.leftOut: { name: string; reason: 'plates' }[]`
    - `cleanUpUnits(data: { exercises: Exercise[]; routines: Routine[]; workouts: Workout[] }, now: string): { exercises: Exercise[]; routines: Routine[]; workouts: Workout[] }`:
      - Returns only the records it changed, each with `updatedAt: now`.
      - Exercises whose `unit` is `'plates'` or `'bodyweight'` become `'kg'`.
      - Routine items whose exercise was `'plates'` lose `startWeight`.
      - Workout entries with `unit: 'bodyweight'` become `'kg'`, and each set with `weight === undefined` gets `weight: 0`.
      - Plates entries and everything else are untouched.
      - It reads `unit` loosely, as a string, because old records hold values the new types don't allow.
  - `src/db/workouts.ts`: `setExerciseUnit(id: string, unit: ExerciseUnit): Promise<void>`, the same pattern as `setExerciseNote` (no write when unchanged)
  - `src/db/backup.ts`:
    - The shapes accept `'kg' | 'lb' | 'plates' | 'bodyweight'` for exercise and entry units.
    - `importAll` runs `cleanUpUnits` over the live tables inside its transaction, after writing, and puts the changed records.
  - `src/db/db.ts`: `this.version(4).stores({}).upgrade((tx) => …)` applies `cleanUpUnits` through `tx.table(...)`, with `now = new Date().toISOString()`.

- [ ] **Step 1: Write the failing domain tests** in `src/domain/workouts.test.ts`.
  - **`cleanUpUnits switches plates and bodyweight exercises to kg and clears plate start weights`:**
    - Input: exercises Leg extension (plates), Back extension (bodyweight) and Bench (kg). One routine has items for all three with `startWeight` 14, 0 and 60.
    - The result has those two exercises with `unit: 'kg'` and `updatedAt: now`.
    - The routine has `startWeight` undefined for Leg extension, 0 for Back extension and 60 for Bench.
    - Bench is not in the result.
  - **`cleanUpUnits turns bodyweight entries into kg, empty weight into 0, and leaves plates entries alone`:**
    - Input: a workout with entries bodyweight (sets with weight `undefined` and `10`) and plates (weight `14`).
    - Output: the bodyweight entry becomes `unit: 'kg'` with weights `0` and `10`. The plates entry is unchanged.
    - A workout with only kg entries is not returned.
  - **`cleanUpUnits on clean data changes nothing`:** the result's three arrays are empty.
  - **Existing tests:** update the `setKg` and `recapOf` tests to the new signatures. Delete the bodyweight cases. The plates cases keep their expectations.

  Run `npx vitest run src/domain/workouts.test.ts`. Expected: FAIL (`cleanUpUnits` is not exported, and the signatures have changed).

- [ ] **Step 2: Implement the types and domain changes** from Interfaces. Run `npx vitest run src/domain/workouts.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the failing data tests.**

  `src/db/upgrade.test.ts`, **`opening a version 3 database cleans up plates and bodyweight once`**:
  - Close and delete the app's db.
  - Create `new Dexie('fitness-app')` with `version(1)`–`version(3)` stores copied from `db.ts`. Add:
    - an exercise in plates, one in bodyweight and one in kg
    - a routine with start weights
    - a finished workout with a bodyweight entry (one set with no weight) and a plates entry
    - one unrelated record, such as a weight entry
  - Close it, then open the app `db`.
  - Expected: the same results as the domain tests. Changed records have a newer `updatedAt`. The kg exercise and the unrelated record are deep-equal to what was added.
  - Finish with `resetDb()`.

  `src/db/backup.test.ts`:
  - **`an old backup with plates and bodyweight imports cleaned`:**
    - A hand-built file (same pattern as the existing shape tests) with a plates exercise, a bodyweight exercise and a bodyweight workout entry.
    - `importAll` resolves.
    - Afterwards the exercises are kg, and the entry is kg with its empty weight now 0.
  - **`re-importing an old backup does not bring plates back`:**
    - Export a backup holding a plates exercise, created with a raw `db.exercises.put` and an old `updatedAt`.
    - Run the clean-up by importing the backup once, then import it again.
    - The exercise is still kg.

  `src/db/workouts.test.ts`, **`setExerciseUnit changes the unit and nothing else`**:
  - Bench kg with a note becomes lb, and the note is unchanged.
  - Calling it again with lb doesn't change `updatedAt`.

  `src/ui/screens/recap.test.tsx`:
  - Delete the bodyweight test.
  - The plates test now expects `Leg extension isn't in the volume: logged in plates.`. The exercise is created with `unit: 'kg'` and a plates entry is written into the workout directly.
  - Once a `plateWeight` is put on the exercise record, it counts.

  Run `npx vitest run src/db src/ui/screens/recap.test.tsx`. Expected: FAIL on the new tests (no upgrade, no clean-up on import, no `setExerciseUnit`, old copy).

- [ ] **Step 4: Implement** the upgrade, the import clean-up, the backup shapes, `setExerciseUnit` and the recap copy. Remove the `bodyKgOn` calls from `RecapScreen` (leave `bodyKgOn` itself in `src/db/weight.ts`). Run `npx tsc -b` and `npx vitest run src/db src/domain src/ui/screens/recap.test.tsx`. Expected: no type errors; PASS.

- [ ] **Step 5: Run the suite and commit.** Run `npm test`. Expected: all pass. Fix any other test that still builds a plates or bodyweight exercise through `saveExercise`: make it kg, unless the test is about legacy plates entries.

```bash
git add -A src
git commit -m "feat: kg and lb only — old plates and bodyweight data cleaned up once"
```

---

### Task 2: kg / lb in the editor, the picker and the workout screen

**Files:**
- Create: `src/ui/components/UnitSwitch.tsx`
- Modify: `src/ui/screens/ExerciseEditorScreen.tsx`, `src/ui/screens/ExercisePickerScreen.tsx` (no code change expected, because `WEIGHT_UNITS` now holds two units; check it), `src/ui/screens/WorkoutScreen.tsx`
- Test: `src/ui/screens/routines.test.tsx`, `src/ui/screens/workout.test.tsx`

**Interfaces:**
- Consumes: `WEIGHT_UNITS`, `ExerciseUnit`, `EntryUnit`, `setExerciseUnit`
- Produces: `UnitSwitch({ unit, onChange }: { unit: EntryUnit; onChange: (unit: ExerciseUnit) => void })`. It's a `radiogroup` labelled `Unit` with radios `kg` and `lb`. A `plates` unit shows neither as checked.

- [ ] **Step 1: Write the failing UI tests.**

  `src/ui/screens/routines.test.tsx`:
  - Replace the plates editor test with **`the editor offers only kg and lb, and saving keeps an existing plate weight`**:
    - Put an exercise record with `unit: 'kg'` and `plateWeight: { value: 5, unit: 'kg' }`.
    - Open its editor. The unit select's options are exactly `['kg', 'lb']`, and there is no `1 plate =` box.
    - Change the note and save. The record still has `plateWeight: { value: 5, unit: 'kg' }`.

  `src/ui/screens/workout.test.tsx`:
  - **`kg / lb can be switched mid-workout, and the exercise remembers it`:**
    - `start()`, then open `Options for Bench` and click radio `lb` in the `Unit` group.
    - Bench's set rows show `lb`, and the stored entry has `unit: 'lb'`.
    - `(await db.exercises.get(bench.id))!.unit` is `'lb'`.
    - The weights are unchanged.
  - **`on a finished workout the switch corrects only that workout`:**
    - Finish a workout via `history()` and open `#/workout/<id>`.
    - Switch Bench to `lb`. The stored entry is lb, and the exercise is still kg.
  - **`a finished plates entry has no unit switch`:**
    - Write a finished workout whose Bench entry has `unit: 'plates'`.
    - Open its options. `queryByRole('radiogroup', { name: 'Unit' })` is null.

  Run `npx vitest run src/ui/screens/routines.test.tsx src/ui/screens/workout.test.tsx`. Expected: FAIL.

- [ ] **Step 2: Implement.**
  - **Editor:**
    - The unit select maps `WEIGHT_UNITS`. The plate fields and their state are removed.
    - `save()` passes `existing?.plateWeight` through unchanged, so it's never dropped.
    - The doc comment drops "plate weight".
  - **`UnitSwitch`:** styled like `DayKindSwitch` (see Global Constraints).
  - **`EntryCard`:**
    - The open menu shows `UnitSwitch` above the four buttons, except for a finished workout's plates entry.
    - Choosing a unit updates the entry's `unit` through `onChange`, keeping the sets.
    - `WorkoutScreen` passes `inProgress`. When true, it also calls `setExerciseUnit(entry.exerciseId, unit)`.
  - **`SetRow`'s `UNIT_LABEL`:** `{ kg: 'kg', lb: 'lb', plates: 'pl' }`. The bodyweight `+` goes.

  Run the two test files. Expected: PASS.

- [ ] **Step 3: Run the suite and commit.** Run `npm test`. Expected: all pass, including `scripts/theme.test.ts`.

```bash
git add -A src
git commit -m "feat: kg / lb only in the editor, and switchable during a workout"
```

---

### Task 3: History arithmetic and data

**Files:**
- Create: `src/domain/history.ts`, `src/domain/history.test.ts`
- Modify: `src/db/workouts.ts` (add `getExerciseHistory`), `src/db/workouts.test.ts`

**Interfaces:**
- Consumes: `isWorkingSet`, `KG_PER_LB` (export it from `src/domain/workouts.ts`), `EntryUnit`, `ExerciseUnit`
- Produces, in `src/domain/history.ts`:
  - `estimatedMax(weight: number, reps: number): number`
  - `bestSet(sets: WorkoutSet[]): WorkoutSet | null`: among working sets, the highest `estimatedMax(weight ?? 0, reps)`; a tie goes to more reps, then the earlier set; null when there are no working sets.
  - `export interface HistorySession { workoutId: string; date: string; name: string; unit: EntryUnit; warmups: WorkoutSet[]; sets: WorkoutSet[]; best: WorkoutSet | null; bestMax: number | null }`:
    - `sets` are the working sets.
    - `bestMax` is `estimatedMax` of `best`, but only when `unit` is kg or lb and `best.weight > 0`. Otherwise null. It isn't rounded.
  - `exerciseHistory(exerciseId: string, workouts: Workout[]): HistorySession[]`:
    - Finished, live workouts only, newest first by `startedAt`.
    - One session per entry of that exercise. An exercise logged twice in one workout gives two sessions; the spec is silent on that and it's rare.
    - An entry with no working sets and no warm-ups is skipped.
  - `bestEver(sessions: HistorySession[], unit: ExerciseUnit): { session: HistorySession; max: number } | null`:
    - The session whose `bestMax` is highest once converted to kg.
    - `max` is in `unit` and isn't rounded.
    - Null when no session has a `bestMax`.
  - `formatHistorySet(s: WorkoutSet): string`: `80×6`, or `80×6 @8` with an RPE. An empty weight shows as `–`, like `formatLast`.
- Produces, in `src/db/workouts.ts`: `getExerciseHistory(exerciseId: string): Promise<HistorySession[]>`, which reads `db.workouts.where('exerciseIds').equals(exerciseId).distinct()` and passes the results through `exerciseHistory`.

- [ ] **Step 1: Write the failing tests.**

  `src/domain/history.test.ts`:
  - `estimatedMax(80, 6)` is `96`, and `estimatedMax(100, 1)` is `100`.
  - `bestSet`:
    - `[80×6, 80×6, 77.5×7]` gives the first 80×6.
    - `[0×12, 0×15, 0×10]` gives 0×15.
    - Plate numbers `[14×10, 13×12]` give 14×10.
    - Warm-ups and sets not done are ignored.
    - An empty list gives null.
  - `exerciseHistory`:
    - Two finished workouts and one in progress give two sessions, newest first.
    - Warm-ups are split from working sets.
    - A plates session has `bestMax: null`. An all-0 kg session has `bestMax: null`, and its best is the most reps.
    - A deleted workout is skipped.
  - `bestEver`:
    - kg 80×6 against lb 176×6 (211.2 lb, about 95.8 kg) with unit kg gives the kg session, max 96.
    - Adding lb 200×6 (240 lb, about 108.9 kg) makes that the best, with `max ≈ 108.86`.
    - Plates-only sessions give null.
  - `formatHistorySet`: `{ weight: 80, reps: 6, rpe: 8 }` gives `80×6 @8`.

  `src/db/workouts.test.ts`, **`getExerciseHistory lists finished workouts with that exercise`**: use the real `startWorkout`/`saveWorkout`/`finishWorkout`. An exercise in one finished workout and in one in progress gives a single session.

  Run `npx vitest run src/domain/history.test.ts src/db/workouts.test.ts`. Expected: FAIL (the module doesn't exist).

- [ ] **Step 2: Implement** `src/domain/history.ts` and `getExerciseHistory`. Run the same command. Expected: PASS.

- [ ] **Step 3: Run the suite and commit.** Run `npm test`. Expected: all pass.

```bash
git add -A src
git commit -m "feat: exercise history — sessions, best set and estimated max"
```

---

### Task 4: The history screen and the ways in

**Files:**
- Create: `src/ui/screens/ExerciseHistoryScreen.tsx`, `src/ui/screens/exerciseHistory.test.tsx`
- Modify: `src/App.tsx` (route), `src/ui/screens/RoutinesScreen.tsx`, `src/ui/screens/WorkoutScreen.tsx` (name opens history), `src/ui/screens/ExerciseEditorScreen.tsx` (back and after-save destination)
- Test: `src/ui/screens/exerciseHistory.test.tsx`, plus updates in `routines.test.tsx` and `workout.test.tsx`

**Interfaces:**
- Consumes: `getExerciseHistory`, `bestEver`, `formatHistorySet`, `HistorySession`, `formatDayLabel`, `formatWhole` (or `Math.round` for the est. max)
- Produces:
  - **Route `/exercises/:id/history`,** with an optional `?from=<path>`. `from` is used only when it starts with `/workout/`; otherwise Back goes to `/workouts/routines`.
  - **The Edit link** goes to `/exercises/:id` and carries the same `from`.
  - **Back and Save in the editor,** for an existing exercise, go to `/exercises/:id/history` with that `from` (Delete still goes to `/workouts/routines`). New exercises keep going to `/workouts/routines`.

- [ ] **Step 1: Write the failing screen tests** in `src/ui/screens/exerciseHistory.test.tsx`. Setup: Bench (kg, Chest) and two finished workouts:
  - Tue 17 Nov, Upper A: warm-up 40×10, then working sets 80×6 @8, 80×6 and 77.5×7.
  - Thu 26 Nov, Upper B: 77.5×7.
  - Plus a third, plates entry on Mon 23 Nov.

  Tests:
  - **`history lists sessions newest first with sets, best set and estimated max`:**
    - `Chest · kg` and `Best: 80 × 6 · est. max 96 kg (Tue 17 Nov)` show.
    - The blocks are links in order: `Thu 26 Nov · Upper B`, `Mon 23 Nov · …`, `Tue 17 Nov · Upper A`.
    - The 17 Nov block shows `W 40×10`, `80×6 @8 · 80×6 · 77.5×7` and `Best 80×6 · est. max 96`.
    - The plates block's sets line ends `· plates`, and its best line has no `est. max`.
    - Clicking the 17 Nov block goes to `#/workout/<id>`.
  - **`an exercise never done says so and offers Edit`:**
    - `No sessions yet.` shows.
    - The `Edit` link's href is `#/exercises/<id>`.
  - **`Routines & exercises opens the history, and Edit opens the editor`:**
    - From `#/workouts/routines`, clicking link `Bench` lands on the history heading `Bench`.
    - Clicking `Edit`, then Save, comes back to the history.

  In `src/ui/screens/workout.test.tsx`:
  - **`tapping an exercise's name opens its history and Back returns to the workout with nothing lost`:**
    - `start()`, then type reps `9` in Bench's first set.
    - Immediately click button `Bench history`. The history heading shows.
    - Click `Back`. The workout shows again, the first set's reps are `9`, and the stored entry has them.
  - Update any test that relied on Bench's `h2` being plain text.

  Run `npx vitest run src/ui/screens/exerciseHistory.test.tsx src/ui/screens/workout.test.tsx src/ui/screens/routines.test.tsx`. Expected: FAIL.

- [ ] **Step 2: Implement.**
  - **`ExerciseHistoryScreen`:** `Screen` with the exercise's name as the title and Back to `from` (validated) or `/workouts/routines`. The layout follows the spec sketch:
    - **Top card:** `<muscle> · <unit>` with an `Edit` link (`btnSecondary`), and the Best line when `bestEver` isn't null.
    - **One card link per session** (`card`, `row`-like, `›`):
      - title `<formatDayLabel(date)> · <name>`
      - a `W <set> · …` line when there are warm-ups
      - the sets joined with ` · `, plus ` · <unit>` when the session's unit differs from the exercise's
      - the best line
    - **Loading and missing exercise:** while loading, `Screen` with an empty title. A missing or deleted exercise shows "This exercise is no longer available." with Back.
  - **`App.tsx`:** add the route before `/exercises/:id`.
  - **`RoutinesScreen`:** exercise rows link to `/exercises/<id>/history`. Update the doc comment.
  - **`WorkoutScreen`:**
    - The `h2` holds a `button` with the visible name and `aria-label="<name> history"`, styled as the heading text with no button chrome and at least `min-h-11` to tap.
    - It calls the existing `go()` with `/exercises/<exerciseId>/history?from=/workout/<workoutId>`, so pending saves finish first.
  - **`ExerciseEditorScreen`:** the Back and after-save destinations per Interfaces. `from` is read with `useSearchParams`.

  Run the three test files. Expected: PASS.

- [ ] **Step 3: Run the suite and commit.** Run `npm test`. Expected: all pass, including `scripts/theme.test.ts`.

```bash
git add -A src
git commit -m "feat: history screen for each exercise, opened from the workout and the exercise list"
```
