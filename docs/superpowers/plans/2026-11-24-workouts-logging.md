# Workouts Part 1 (Logging) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Log gym workouts in the app instead of iPhone Notes. Routines pre-fill each set with last time's numbers, so a set done as planned is one tap. Each exercise keeps a note, and finishing shows a recap of sets and volume per muscle group, compared with the last time of the same routine.

**Architecture:**
- **Storage:** three new Dexie tables via schema version 3:
  - `exercises`
  - `routines`
  - `workouts`, one record per workout holding its entries and sets, with a multi-entry index on `exerciseIds`
- **Pure code** in `src/domain/workouts.ts`: volume, recap, pre-filling and formatting.
- **Storage code** in `src/db/workouts.ts`.
- **Screens:** new routes, built from the existing `Screen`, `Field`, `ConfirmDialog` and styles. Home gets a Workouts button.
- **The user's plan** becomes an import file built outside the repository.

**Tech Stack:** React 19 + TypeScript + Vite 8, Dexie 4 with dexie-react-hooks, React Router 7 (HashRouter), Vitest + jsdom + fake-indexeddb, Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-24-workouts-logging-design.md`. The overall app design is `docs/superpowers/specs/2026-11-16-fitness-app-design.md`.

## Global Constraints

- **Muscle groups** (exact, in this order): `Chest, Back, Shoulders, Biceps, Triceps, Forearms, Quads, Hamstrings, Glutes, Calves, Abs`.
- **Units:** `kg | lb | plates | bodyweight`. `lb → kg` uses × 0.45359237. A plate weight is `{ value, unit: 'kg' | 'lb' }`.
- **RPE buttons:** `6 7 8 9 10`. RPE is optional.
- **Volume** = kg × reps, × 2 for "each side". It counts only sets that are done, not warm-ups, and have reps.
  - Plates without a plate weight, and bodyweight with no weight ever logged, make kg unknown. Those sets count as sets but not as volume, and the recap names the exercise.
  - Volume is shown rounded to whole kg. The comparison is `▲ n` / `▼ n` in kg, or `=` when within 1 kg.
- **Settings read now vs. kept from the time:**
  - Each `WorkoutEntry` keeps the `unit` it was logged in.
  - Plate weight, each side and muscle group are read from the exercise's current settings.
  - Body weight is the latest weight logged on or before the workout's date.
- **Pre-filling:**
  - Use the working sets of the last finished workout that has the exercise with at least one done working set, in any routine. If it had fewer sets, repeat the last one.
  - Otherwise use the routine's starting weight with reps empty, or leave both empty.
  - Warm-ups are never copied.
- **One workout in progress at most.** Every change is saved at once.
- **Finish** drops sets that aren't ticked, and entries left with no sets. With nothing ticked, Finish offers `Discard workout` instead.
- **Copy:** `Workouts`, `Start`, `Resume`, `Empty workout`, `Rest day`, `Finish`, `+ Set`, `+ Warm-up`, `+ Add exercise`, `Last:`, `Log a past workout`, `Routines and exercises`, `Discard workout`.
  - Left-out lines: `<name> isn't in the volume: set its plate weight.` and `<name> isn't in the volume: log your weight first.`
- **Numbers:** a decimal comma is accepted. Weights are `≥ 0` with at most 2 decimals. Reps are whole numbers from 1 to 100.
- **Touch:** tap targets of at least 44 pt, and `inputMode="decimal"` or `"numeric"` on number fields.
- **Backups:** the file stays `version: 1` with new `exercises`, `routines` and `workouts` lists. Older files still import.
- **Privacy:** the user's own plan never goes into the repository. Its source is `.superpowers/private/workouts-plan-import.md`, which git ignores.
- **Commits** end with the attribution lines given in the session.

## Review Focus

1. **The app closed or reloaded mid-workout.** Opening `#/` within 3 hours of the workout's last change goes straight back to it. Typed values that weren't ticked yet are still there. After 3 hours, Home shows **Resume** instead. Tests: Tasks 3 and 6.
2. **An exercise's unit changed after it was logged.** Old workouts keep showing and counting in their logged unit. Setting a plate weight later makes past plate sets count. Tests: Tasks 1 and 5.
3. **A workout running past midnight** keeps its start date. The new-day watcher doesn't move the person off the workout screen. Test: Task 3.
4. **Finishing with nothing ticked,** and deleting the only workout that had an exercise. The first offers Discard. After the second, pre-fill falls back to the routine's starting weight. Tests: Tasks 2 and 3.
5. **Swapping an exercise mid-workout.** The recap uses the new exercise's muscle group, and the routine is unchanged. Tests: Tasks 4 and 5.

---

### Task 1: Types, schema version 3, and the workout arithmetic

**Files:**
- Create: `src/domain/workouts.ts`, `src/domain/workouts.test.ts`
- Modify:
  - `src/db/types.ts`
  - `src/db/db.ts`: declare the tables, and add `this.version(3).stores({ exercises: 'id, name', routines: 'id', workouts: 'id, date, startedAt, *exerciseIds' })`

**Interfaces:**
- **Produces, in `src/db/types.ts`:**
  ```ts
  type MuscleGroup = 'Chest' | 'Back' | ... | 'Abs';  // same order as the Global Constraints
  type WeightUnit = 'kg' | 'lb' | 'plates' | 'bodyweight';
  interface Exercise extends BaseRecord { name: string; muscle: MuscleGroup; unit: WeightUnit; plateWeight?: { value: number; unit: 'kg' | 'lb' }; eachSide: boolean; note: string }
  interface RoutineItem { exerciseId: string; sets: number; repsMin: number; repsMax: number; rpeTarget: string; startWeight?: number }
  interface Routine extends BaseRecord { name: string; weekdays: number[] /* 0 = Sunday */; items: RoutineItem[] }
  interface WorkoutSet { id: string; warmup: boolean; weight?: number; reps?: number; rpe?: number; done: boolean }
  interface WorkoutEntry { id: string; exerciseId: string; unit: WeightUnit; target?: Omit<RoutineItem, 'exerciseId' | 'startWeight'>; sets: WorkoutSet[] }
  interface Workout extends BaseRecord { date: string; name: string; routineId?: string; startedAt: string; finishedAt?: string; entries: WorkoutEntry[]; exerciseIds: string[] }
  ```
- **Produces, in `src/domain/workouts.ts`:**
  - Constants: `MUSCLE_GROUPS`, `WEIGHT_UNITS`, `RPE_VALUES = [6, 7, 8, 9, 10]`
  - `parseLift(input: string): number | null`
  - `parseReps(input: string): number | null`
  - `setKg(weight: number | undefined, unit: WeightUnit, exercise: Pick<Exercise, 'plateWeight'>, bodyKg: number | null): number | null`
  - `isWorkingSet(s: WorkoutSet): boolean`: done, not a warm-up, reps set
  - `type RecapRow = { muscle: MuscleGroup; sets: number; volume: number; change?: number }`
  - `type Recap = { rows: RecapRow[]; leftOut: { name: string; reason: 'plates' | 'bodyweight' }[] }`
  - `recapOf(workout: Workout, exercises: Map<string, Exercise>, bodyKg: number | null): Recap`: rows in `MUSCLE_GROUPS` order, only groups with at least one working set
  - `withChanges(now: Recap, previous: Recap | null): Recap`: sets `change` on rows whose muscle group also appears in `previous`
  - `prefillSets(count: number, last: WorkoutSet[] | null, startWeight?: number): WorkoutSet[]`: fresh ids, `done: false`, `warmup: false`
  - `formatLast(sets: WorkoutSet[]): string`: `"22.5×9, 22.5×8"`
  - `formatTarget(t: { sets: number; repsMin: number; repsMax: number; rpeTarget: string }): string`: `"3 × 8–12 · RPE 7–8"`. Equal min and max show one number, and an empty `rpeTarget` drops the RPE part.
  - `formatElapsed(fromIso: string, now: Date): string`: `"32:10"`, or `"1:05:10"` past an hour
  - `routinesForDate(routines: Routine[], date: string): Routine[]`

- [ ] **Step 1: Write the failing tests** in `src/domain/workouts.test.ts`.
  - **Number parsing:**
    - `parseLift('22,5')` → `22.5`, `parseLift('0')` → `0`
    - `parseLift('1.234')`, `parseLift('-1')` and `parseLift('')` → `null`
    - `parseReps('8')` → `8`; `parseReps('0')`, `parseReps('8.5')` and `parseReps('101')` → `null`
  - **`setKg`:**
    - kg 60 → 60
    - lb 10 → `4.5359237`
    - plates 14 with no plate weight → `null`; with `{ value: 5, unit: 'kg' }` → 70; with `{ value: 10, unit: 'lb' }` → `63.5029318`
    - bodyweight with added 0 and bodyKg 78 → 78; with added 10 → 88; with bodyKg `null` → `null`
  - **`recapOf`.** Exercises:
    - Bench (kg, Chest)
    - Raise (lb, Shoulders)
    - LegExt (plates, Quads, no plate weight)
    - SLPress (kg, Quads, each side)
    - BackExt (bodyweight, Hamstrings)

    Its sets, and what each must produce:
    - **Bench:** a done warm-up 40×10, done 60×8, done 60×8, not done 57.5×7, and done 60 with no reps → Chest: `sets 2, volume 960`
    - **Raise:** 10×12 → Shoulders volume `54.43` within 0.01
    - **LegExt:** 14×12 → Quads sets include it, and `leftOut` has `{ name: 'LegExt', reason: 'plates' }`
    - **SLPress:** 25×10 → adds 500 to Quads
    - **BackExt:** 0×12, with bodyKg 78 → Hamstrings 936; with bodyKg `null` → it's in `leftOut` with reason `'bodyweight'`
    - Rows come in `MUSCLE_GROUPS` order.
  - **Changing the exercise later:** the same workout with LegExt now `{ value: 5, unit: 'kg' }` → Quads volume includes 840, and `leftOut` is empty. An entry logged as `unit: 'plates'` is still counted as plates after the exercise's own unit becomes kg (the entry's unit wins).
  - **`withChanges`:**
    - previous Chest 900, now 960 → `change` 60
    - a muscle group missing from previous → no `change`
    - `previous` null → no changes
  - **`prefillSets`:**
    - `(3, [60×8, 60×8], 22.5)` → `[60×8, 60×8, 60×8]`, all `done: false`
    - `(3, null, 22.5)` → three sets of weight 22.5 with reps undefined
    - `(2, null)` → two empty sets
    - The warm-ups in `last` are skipped.
  - **Formatting:**
    - `formatTarget({ sets: 3, repsMin: 8, repsMax: 12, rpeTarget: '7–8' })` → `'3 × 8–12 · RPE 7–8'`
    - `formatElapsed` of 32 min 10 s → `'32:10'`, and of 3910 s → `'1:05:10'`
  - **`routinesForDate`:** routines on weekdays `[1]` and `[4]`, with `'2026-11-23'` (a Monday) → only the first.
- [ ] **Step 2: Run** `npm test -- domain/workouts` → Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the types, the version 3 schema and `src/domain/workouts.ts`. `parseLift` and `parseReps` reuse `parseAmount(input, { allowZero: true })` and add their own range and decimal checks.
- [ ] **Step 4: Run** `npm test -- domain/workouts` → Expected: PASS. Then `npm test` → Expected: all pass (the schema upgrade breaks nothing).
- [ ] **Step 5: Commit** `feat: workout data types, schema version 3 and volume arithmetic`.

---

### Task 2: Storing exercises, routines and workouts; backups

**Files:**
- Create: `src/db/workouts.ts`, `src/db/workouts.test.ts`
- Modify:
  - `src/db/weight.ts`: add `bodyKgOn`
  - `src/db/backup.ts`: `RECORD_TABLES` adds `'exercises'`, `'routines'` and `'workouts'`, each with a `SHAPES` check
  - `src/db/backup.test.ts`

**Interfaces:**
- **Consumes:** the Task 1 types and `prefillSets`.
- **Produces, in `src/db/workouts.ts`:**
  - **Exercises:**
    - `type ExerciseFields = Omit<Exercise, keyof BaseRecord>`
    - `listExercises(): Promise<Exercise[]>`: live, sorted by name
    - `saveExercise(fields: ExerciseFields, id?: string): Promise<Exercise>`
    - `deleteExercise(id: string): Promise<{ usedIn: string[] }>`: refuses (returns the routine names, deletes nothing) if a live routine uses it
    - `setExerciseNote(id: string, note: string): Promise<void>`
  - **Routines:**
    - `type RoutineFields = Omit<Routine, keyof BaseRecord>`
    - `listRoutines(): Promise<Routine[]>`: live, sorted by name
    - `saveRoutine(fields: RoutineFields, id?: string): Promise<Routine>`
    - `deleteRoutine(id: string): Promise<void>`
  - **Workouts:**
    - `getActiveWorkout(): Promise<Workout | undefined>`: live, with no `finishedAt`
    - `startWorkout(opts: { routineId?: string; date: string; startedAt?: string }): Promise<Workout>`
      - It throws `Error('A workout is already in progress')` if one exists.
      - `name` is the routine's name, or `'Workout'`.
      - It builds entries from the routine's items, skipping deleted exercises. Each entry has `unit` from the exercise, `target` from the item, and `prefillSets(item.sets, lastSetsFor(...), item.startWeight)`.
    - `newEntry(exerciseId: string, before: string): Promise<WorkoutEntry>`: one pre-filled set and no `target`
    - `saveWorkout(w: Workout): Promise<Workout>`: touches `updatedAt` and recomputes `exerciseIds`
    - `finishWorkout(id: string, finishedAt?: string): Promise<Workout>`: applies the Finish rule; throws if nothing is ticked
    - `deleteWorkout(id: string): Promise<void>`: soft delete
    - `listFinishedWorkouts(): Promise<Workout[]>`: newest `startedAt` first
    - `lastSetsFor(exerciseId: string, before: string, excludeId?: string): Promise<WorkoutSet[] | null>`: the working sets from the most recent finished, live workout with `startedAt < before` that has any
    - `previousRoutineWorkout(routineId: string, before: string): Promise<Workout | undefined>`
- **Produces, in `src/db/weight.ts`:** `bodyKgOn(date: string): Promise<number | null>`

- [ ] **Step 1: Write the failing tests.**
  - **`src/db/workouts.test.ts`:**
    - **Starting a routine pre-fills from history.** Save exercises Bench and Raise, and a routine `Upper A` (Bench `{ sets: 3, repsMin: 6, repsMax: 10, rpeTarget: '≤8', startWeight: 22.5 }`, Raise `{ sets: 2, ..., startWeight: 4 }`).
      - The first `startWorkout({ routineId, date: '2026-11-23' })` has Bench sets of 22.5 with no reps, and `name === 'Upper A'`.
      - Tick two Bench sets as 25×8 and 25×7, then `finishWorkout`. The result keeps only those two Bench sets, and Raise is dropped (nothing was ticked).
      - The next `startWorkout` has Bench pre-filled 25×8, 25×7, 25×7.
    - **Rules:**
      - A second `startWorkout` while one is active rejects.
      - `finishWorkout` with nothing ticked rejects.
      - `getActiveWorkout()` is `undefined` after Finish.
    - **"Last time" works across routines:** Raise done in `Upper B` pre-fills Raise in `Upper A`.
    - **Deleting the only workout that had Bench:** the next start falls back to 22.5.
    - **`deleteExercise`** of an exercise used by Upper A → `{ usedIn: ['Upper A'] }`, and it's still listed. After it's removed from the routine, it deletes.
    - **`previousRoutineWorkout`** returns the earlier finished Upper A, not an Upper B in between.
    - **`saveWorkout`** keeps `exerciseIds` in step with the entries after an entry is added or removed.
  - **`src/db/weight.test.ts`:** with weights on 11-20 (80) and 11-22 (79):
    - `bodyKgOn('2026-11-21')` → 80
    - `bodyKgOn('2026-11-23')` → 79
    - `bodyKgOn('2026-11-19')` → `null`
  - **`src/db/backup.test.ts`:**
    - Export → reset → import round-trips an exercise, a routine and a finished workout exactly.
    - A version-1 file without the new lists imports.
    - A workout whose `entries` isn't a list → `ImportError`.
- [ ] **Step 2: Run** `npm test -- db/workouts weight backup` → Expected: FAIL.
- [ ] **Step 3: Implement.** `lastSetsFor` and `previousRoutineWorkout` use the `exerciseIds` and `startedAt` indexes, newest first. The SHAPES checks:
  - **exercises:** string `name`, a valid muscle, a valid unit, boolean `eachSide`, string `note`
  - **routines:** string `name`, numeric `weekdays`, and items with a string `exerciseId` and numbers `sets`, `repsMin` and `repsMax`
  - **workouts:** strings `date`, `name` and `startedAt`; an `entries` list whose sets have a boolean `done` and boolean `warmup`; and a string-list `exerciseIds`
- [ ] **Step 4: Run** `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: store exercises, routines and workouts; pre-fill from last time; backups include them`.

---

### Task 3: The workout screen (logging sets)

**Files:**
- Create: `src/ui/screens/WorkoutScreen.tsx`, `src/ui/screens/workout.test.tsx`
- Modify: `src/App.tsx` (route `/workout/:id`)

**Interfaces:**
- **Consumes:**
  - `saveWorkout`, `finishWorkout`, `deleteWorkout`, `setExerciseNote`, `listExercises`, `lastSetsFor` (Task 2)
  - `formatLast`, `formatTarget`, `formatElapsed`, `parseLift`, `parseReps`, `RPE_VALUES` (Task 1)
- **Produces:** route `/workout/:id`. For a workout in progress, it has a header `‹ Workouts` (to `/workouts`), the name, the elapsed time and **Finish**. For a finished workout, the same screen edits it: no Finish button; a `Date` field, **Recap** and **Delete workout** instead. Accessible names:
  - **Sets:** `Set 1 weight`, `Set 1 reps`, and the toggle `Done set 1` (aria-pressed). Warm-up rows are `Warm-up 1 …`.
  - **RPE:** `RPE 8 for set 1`.
  - **Each exercise:** `+ Set` and `+ Warm-up`, with the exercise name in the label; `Note for <name>`; `Remove set 3 of <name>`.

- [ ] **Step 1: Write the failing tests** in `src/ui/screens/workout.test.tsx`. Set up with `saveExercise`, `saveRoutine` and `startWorkout`, the clock at 2026-11-23T10:00Z, then `renderAt('#/workout/<id>')`.
  - **What it shows:**
    - The exercise names, `3 × 6–10 · RPE ≤8`, and pre-filled values (`Set 1 weight` has `22.5`).
    - `Last: 25×8, 25×7` when there's history.
    - The exercise's note.
  - **One tap:** `Done set 1` turns pressed, and the stored workout has set 1 `done: true`.
  - **Editing a set:** typing reps `9` into `Set 2 reps`, then `Done set 2`, stores reps 9. Typing `abc` into a weight shows no change in storage and marks the field invalid.
  - **RPE:** `RPE 8 for set 1` is stored as `rpe: 8`. Tapping it again clears it.
  - **Sets:** `+ Warm-up` adds a `Warm-up 1` row. `+ Set` adds a pre-filled set 4 with the same values as set 3. `Remove set 4 of Bench` removes it.
  - **Notes:** editing `Note for Bench` to `seat 4` and leaving the field saves it on the exercise, so a new workout shows it.
  - **Saved as you go:** unmounting and rendering `#/workout/<id>` again shows the typed values, ticked and unticked.
  - **Finish:**
    - With set 1 ticked, `Finish` stores `finishedAt`, drops the unticked sets and opens `#/workout/<id>/recap`. Until Task 5 adds the recap screen, a placeholder route is fine.
    - With nothing ticked, `Finish` opens a dialog with `Discard workout`. Confirming deletes it and opens `#/workouts`.
  - **Past midnight:** started at 2026-11-23T23:30Z, the clock moved to 2026-11-24T00:30Z, and `visibilitychange` dispatched → still on the workout screen, and the workout's `date` is still `2026-11-23`.
  - **A finished workout:** opening it shows no `Finish`. Changing a weight saves it. Its `Date` field set to 2026-11-21 stores `date: '2026-11-21'`, and moves `startedAt` and `finishedAt` by the same whole days (same times, new date). `Delete workout` → confirm → it leaves the history.
- [ ] **Step 2: Run** `npm test -- workout.test` → Expected: FAIL.
- [ ] **Step 3: Implement `WorkoutScreen`.**
  - Read the workout with `useLiveQuery`. Each edit builds the changed workout and calls `saveWorkout`.
  - Number fields keep their typed text locally while focused, and save on change when they parse. Invalid text gets `aria-invalid` and isn't saved.
  - The elapsed time updates every second while the workout is in progress.
  - `Last:` comes from `lastSetsFor(exerciseId, workout.startedAt, workout.id)`.
- [ ] **Step 4: Run** `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: workout screen — pre-filled sets, one-tap done, RPE, warm-ups, notes, finish`.

---

### Task 4: Adding, swapping, removing and moving exercises mid-workout

**Files:**
- Create: `src/ui/screens/ExercisePickerScreen.tsx`, `src/ui/screens/exercisePicker.test.tsx`
- Modify:
  - `WorkoutScreen.tsx`: `+ Add exercise`, and a menu on each exercise: `Swap`, `Remove`, `Move up`, `Move down`
  - `src/App.tsx`: routes `/workout/:id/add` and `/workout/:id/swap/:entryId`

**Interfaces:**
- **Consumes:** `listExercises`, `saveExercise`, `newEntry`, `saveWorkout` (Task 2).
- **Produces:** the picker. It has a search field (`Search exercises`), a list of matching exercises, and a **New exercise** form with Name, Muscle group (a select listing `MUSCLE_GROUPS`) and Unit (kg / lb / plates / bodyweight).
  - **Picking or creating** adds a `newEntry` at the end, or replaces the swapped entry in place, then returns to `/workout/:id`.
  - **Swapping** keeps the entry's position, uses the new exercise's unit and pre-fill, and drops the old entry's sets.

- [ ] **Step 1: Write the failing tests.**
  - **Add:** `+ Add exercise` → typing `lat` shows `Lat pulldown` → tap → back on the workout with Lat pulldown last, pre-filled from its history.
  - **New exercise:** with no match, filling Name `Cable crunch`, Muscle group `Abs` and Unit `kg`, then saving, creates the exercise and adds it.
  - **Swap:** Bench → `Swap` → `Chest press` → Chest press sits where Bench was, and the routine's items are unchanged.
  - **Remove** (after confirming) and **Move up / Move down** change the stored entry order.
- [ ] **Step 2: Run** `npm test -- exercisePicker` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: add, swap, remove and reorder exercises during a workout`.

---

### Task 5: The recap

**Files:**
- Create: `src/ui/screens/RecapScreen.tsx`, `src/ui/screens/recap.test.tsx`
- Modify: `src/App.tsx` (route `/workout/:id/recap`, replacing Task 3's placeholder)

**Interfaces:**
- **Consumes:**
  - `recapOf`, `withChanges` (Task 1)
  - `previousRoutineWorkout`, `listExercises` (Task 2)
  - `bodyKgOn` (Task 2)
- **Produces:** a screen with these parts:
  - **Title:** `<name> · done · <duration>`
  - **Caption** `vs last <routine name>`, when there's an earlier one
  - **A row per muscle group:** `<muscle>`, `<n> sets`, `<volume> kg` (whole kg, thousands with a comma), and `▲ n` / `▼ n` / `=`
  - **Left-out lines** (see Global Constraints)
  - **Done**, which goes to `/`

- [ ] **Step 1: Write the failing tests.**
  - **A first Upper A:** `Chest`, `2 sets`, `960 kg`, and no arrow.
  - **A second Upper A** with Chest at 1,020 → `▲ 60`. With 960.4 → `=`.
  - **Left out:** a plates exercise with no plate weight shows `Leg extension isn't in the volume: set its plate weight.` After a plate weight is set, reopening the recap counts it, and the line is gone.
  - **Bodyweight** with no weight logged shows `… log your weight first.`
  - **Swapped exercise:** a workout where Bench was swapped for Lat pulldown shows Back, not Chest.
  - **Finished workouts:** a finished workout's screen links `Recap` to this route.
- [ ] **Step 2: Run** `npm test -- recap` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: workout recap — sets and volume per muscle group vs last time`.

---

### Task 6: The Workouts screen, Home button, resuming, history, past workouts

**Files:**
- Create: `src/ui/screens/WorkoutsScreen.tsx`, `src/ui/screens/workouts.test.tsx`
- Modify:
  - `src/ui/screens/HomeScreen.tsx`: a `Workouts` link (`btnSecondary`, after `Food log`); a `Resume workout` card when one is in progress; and the reopen jump
  - `src/App.tsx`: route `/workouts`
  - `src/ui/screens/home.test.tsx`: its "no Workouts" assertion goes

**Interfaces:**
- **Consumes:** `listRoutines`, `getActiveWorkout`, `startWorkout`, `listFinishedWorkouts` (Task 2), `routinesForDate` (Task 1).
- **Produces:** the screen `/workouts`, from top to bottom:
  - **Resume:** `Resume <name>`, when a workout is in progress. Start buttons are then disabled.
  - **Today:** `Today · <weekday>` with each planned routine and its `Start` button (`Start Upper A`), or `Rest day`.
  - **Other routines**, each with Start, and `Empty workout`.
  - **`Log a past workout`:** a date field (max today) and a routine select including `Empty workout`, then `Start`. This creates the workout with that date and `startedAt` at 12:00 local on that date.
  - **`Past workouts`:** rows `Sat 22 Nov · Lower B · 71 min` linking to `/workout/:id`.
  - **`Routines and exercises`**, linking to `/workouts/routines` (Task 7).

  **The reopen jump:** the first time Home renders after the app loads, if a workout is in progress and its `updatedAt` is within 3 hours, Home replaces itself with `/workout/:id`. Later Home visits only show the card.

- [ ] **Step 1: Write the failing tests.**
  - **Home:**
    - It has a `Workouts` link to `#/workouts`.
    - With a workout started 10 minutes ago, a fresh render of `#/` lands on the workout. Pressing ‹ to `/workouts` and then Home stays on Home and shows `Resume workout`.
    - With one last changed 5 hours ago, `#/` stays on Home and shows the card.
  - **Workouts screen:**
    - On Monday 2026-11-23, with routines on Mon/Tue/Thu/Sat → `Today · Monday`, `Start Upper A`, and the others under Other routines.
    - On Wednesday → `Rest day`.
    - `Start Upper A` opens `/workout/<new id>`.
    - With a workout in progress, `Resume Upper A` is shown and Start is disabled.
    - Past workouts are listed newest first, with their duration, and open the workout.
    - `Log a past workout` for 2026-11-20 with Upper B creates a workout dated 2026-11-20 and opens it.
- [ ] **Step 2: Run** `npm test -- workouts.test home` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: Workouts screen and Home button; resume, history, log a past workout`.

---

### Task 7: Editing routines and exercises

**Files:**
- Create: `src/ui/screens/RoutinesScreen.tsx`, `src/ui/screens/RoutineEditorScreen.tsx`, `src/ui/screens/ExerciseEditorScreen.tsx`, `src/ui/screens/routines.test.tsx`
- Modify: `src/App.tsx`, with these routes:
  - `/workouts/routines`: a list of routines and exercises, `New routine` and `New exercise`
  - `/routines/:id`: the routine editor; `new` is allowed
  - `/exercises/:id`: the exercise editor; `new` is allowed

**Interfaces:**
- **Consumes:** the Task 2 storage functions.
- **Produces:**
  - **Exercise editor:**
    - Name, Muscle group, Unit, `1 plate =` (value and kg/lb; shown only for plates), an `Each side` checkbox, and Note.
    - **Save.**
    - **Delete,** which shows `Used in Upper A — remove it there first` when it's refused.
  - **Routine editor:**
    - Name, and seven weekday checkboxes (`Mon` … `Sun`).
    - A list of items, each with fields Sets, Reps from, Reps to, RPE target, and Starting weight (optional), plus `Move up`, `Move down` and `Remove`.
    - `+ Add exercise`, which picks from the exercise list.
    - Save, and Delete with a confirmation.

- [ ] **Step 1: Write the failing tests.**
  - **Routines:**
    - Create a routine `Upper A` on Mon with Bench `3 × 6–10`, RPE `≤8`, starting weight `22,5` → it's stored with `startWeight: 22.5` and `weekdays: [1]`.
    - Edit it and move Raise above Bench → the order is stored.
    - Reps from > Reps to → an error, and nothing is saved.
  - **Exercises:**
    - Set `Leg extension` to plates with `1 plate = 5 kg` → it's stored. Choosing a unit other than plates hides the field and clears `plateWeight`.
    - Deleting an exercise used by a routine shows the refusal text.
- [ ] **Step 2: Run** `npm test -- routines.test` → Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npx tsc -b && npm run build` → Expected: all pass, and the build succeeds.
- [ ] **Step 5: Commit** `feat: edit routines and exercises`.

---

### Task 8: The user's plan as an import file (outside the repository)

**Files (all git-ignored, under `.superpowers/private/`):**
- `make-plan-import.mjs`: builds `workouts-plan-import.json` from the tables in `workouts-plan-import.md`
- `check-plan-import.test.ts`: a throwaway check, run with `npx vitest run --root . .superpowers/private/check-plan-import.test.ts` (or copied temporarily into `src/` and removed before committing)

**Interfaces:**
- **Consumes:** the backup format (`format: 'fitness-app-export'`, `version: 1`) and `importAll`, `startWorkout`, `listRoutines` (Task 2).
- **Produces:** `workouts-plan-import.json`, holding only `exercises` and `routines` records, with fresh UUIDs and `createdAt`/`updatedAt` set to now. Exercises with the same name are one record. The weekdays are Upper A `[1]`, Lower A `[2]`, Upper B `[4]` and Lower B `[6]`.

- [ ] **Step 1: Write the check.** It imports the file into an empty database (fake-indexeddb) and asserts:
  - 4 routines, and 25 distinct exercises
  - every exercise's muscle group, unit, "each side" and note, and every routine item's sets, reps, RPE target and starting weight, match the rows of the private tables
  - the plates exercises have no plate weight, and the bodyweight exercise starts at 0 added
  - starting the first routine pre-fills its first exercise with that exercise's starting weight
- [ ] **Step 2: Run the check** → Expected: FAIL (the file doesn't exist yet).
- [ ] **Step 3: Write `make-plan-import.mjs`** and run it.
- [ ] **Step 4: Run the check** → Expected: PASS. Confirm with `git status` that nothing under `.superpowers/` is tracked.
- [ ] **Step 5: No commit.** Send `workouts-plan-import.json` to the user after publishing, with the steps: Settings → Import.
