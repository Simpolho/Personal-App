# Workouts, part 1: logging — design (step 5)

Proposed 2026-11-24. This is the first part of build step 5 of the app design (`2026-11-16-fitness-app-design.md`), "Workouts". The user moved step 5 ahead of step 4 (progress photos); the two don't depend on each other. Step 5 is built in parts, each finished and published before the next:

1. **Logging** (this document)
2. Training-day and rest-day targets (its own short design later)
3. A history screen for each exercise (its own short design later)

## Intent

The user logs workouts in the iPhone Notes app today. It's simple, but he wants everything about fitness in one place. Part 1 replaces Notes for logging in the gym. The bar is Notes itself: a set done as planned should take one tap. The app pre-fills each set with last time's numbers, keeps a note per exercise, and ends with a recap of volume per muscle group.

He trains an upper/lower split four times a week, with a written plan (below) that has sets × reps, a target RPE and a starting weight for each exercise. He tracks rest times on a smartwatch.

## Goals

- **Routines.** Named routines (Upper A, Lower A, Upper B, Lower B), each with:
  - the weekdays it's planned for
  - exercises in order, each with sets, a rep range, a target RPE (text such as "7–8" or "≤8") and an optional starting weight
- **Exercises**, the user's own list, created as needed and suggested as you type. Each exercise has:
  - a name
  - one muscle group
  - a unit
  - an "each side" switch
  - a note
- **Workouts screen**, opened by a **Workouts** button on Home next to Food log. It shows:
  - **Resume** for a workout in progress, if there is one
  - today's planned routine(s) with **Start**, or "Rest day" when none is planned today
  - the other routines, and **Empty workout**
  - past workouts, newest first
  - links to edit routines and exercises
  - **Log a past workout**, with a date
- **Logging a workout.** Starting a routine opens the workout screen.
  - Each exercise shows its target (for example "3 × 8–10 · RPE 7–8"), last time's working sets ("Last: 60×8, 60×8, 57.5×7") and its note.
  - **Set rows are pre-filled** with weight and reps (see Pre-filling). Tapping ✓ marks a set done as shown; changing the weight or reps first is one or two taps more.
  - **RPE per set**, optional: buttons 6 7 8 9 10 under the set.
  - **Warm-up sets:** **+ Warm-up** adds a set marked **W**. Warm-ups are saved and shown, but they don't count toward volume or "last time".
  - **Changes mid-workout** don't touch the routine: add a set, remove a set, add an exercise, swap an exercise for another, remove or skip an exercise, and reorder.
  - **The note** is shown and can be edited during the workout. It belongs to the exercise, so it shows again next time.
- **Saved as you go.** Every change is saved at once. If the phone locks, the app is closed or the page reloads, opening the app again returns to the workout. There's at most one workout in progress.
- **Finish** shows the recap (see Volume), then the workout goes into history. Sets not ticked are left out.
- **History.** Any past workout can be opened, corrected (sets, values, date) or deleted.
- **The user's plan comes in as a file.** Claude converts the plan below into a backup-format file holding the exercises and routines, sent to the user in chat. He imports it once in Settings. The plan is not bundled into the app: the app's files are public.
- **Backups:** export and import include exercises, routines and workouts. Older backups still import.

## Non-goals

- A rest timer (the user's decision: his watch handles rest).
- Cardio (stays on the watch).
- Secondary muscle groups (the user's decision: one group per exercise).
- A built-in exercise library.
- Training-day and rest-day targets (part 2), a history screen per exercise (part 3), charts and personal records (step 6, insights).
- Tabs along the bottom. The user asked for buttons on Home.
- Apple Health or smartwatch connections.
- Weekly progression rules (such as adding weight when the top of the rep range is reached). The plan's "Wk 1" weights are starting points only.

## Anti-goals (would make it a failure even if it works)

- A set done as planned taking more than one tap.
- Losing a workout in progress to a locked phone, a closed app or a reload.
- A warm-up set, or a plate machine whose plate weight isn't set yet, quietly distorting the recap.

## Decisions (the user's)

- **No rest timer.**
- **One muscle group per exercise:** Chest, Back, Shoulders, Biceps, Triceps, Forearms, Quads, Hamstrings, Glutes, Calves, Abs. Adductor machines count as Quads, and the abductor counts as Glutes.
- **Volume = reps × weight**, added up over working sets, in kg.
- **Warm-ups** are logged, marked W, and excluded from volume and from "last time".
- **Effort is RPE**, matching his plan, and optional.
- **Each exercise has its own unit:** kg, lb, plates (a machine's stack) or bodyweight.
  - **lb** converts to kg for volume.
  - **Plates** count toward volume only once that exercise has "1 plate = X kg" (or lb). Until then its sets show but add nothing to volume.
- **Recap by muscle group,** with sets and volume, compared with the last finished workout of the same routine.
- **Notes per exercise**, carried to the next time.
- **Workouts button on Home**, next to Food log.

## Claude's calls (correctable)

- **Each side:** for "each leg / each arm" exercises, you type one side's weight and reps, and volume counts both sides (× 2).
- **Bodyweight:** an exercise in bodyweight records the added weight (0 by default). Volume uses the latest weight logged on or before the workout's date, plus the added weight. With no weight logged at all, the sets show but add nothing to volume.
- **Numbers without a unit in the plan** are taken as kg.
- **Weight steps:** any number with up to 2 decimals, with a decimal comma accepted. No fixed plate increments.
- **The recap names what it left out.** For example: "Leg extension isn't in the volume: set its plate weight."
- **Today's routine** comes from the routine weekdays. If two routines share a day, both are shown.
- **Changing an exercise's settings later.** Each logged exercise keeps the unit it was logged in, so "14 plates" stays 14 plates if the exercise later switches to kg. Plate weight, each side and muscle group are always read from the exercise's current settings. So setting a plate weight later also counts past workouts, and the ▲/▼ comparison stays fair.

## Pre-filling

For each exercise in a routine, the app looks for the last finished workout that included that exercise, in any routine, since an exercise like Lateral raise appears in both Upper A and Upper B.

- **If found:** the routine's number of sets is filled with that workout's working sets in order (weight and reps). If there were fewer sets last time, the last one is repeated. Warm-ups aren't copied.
- **If not found:** every set gets the routine's starting weight, and reps are left empty. With no starting weight ("find it"), both are empty.
- **Exercises added mid-workout** are pre-filled the same way, with one set.

## Volume and the recap

- **kg per set:**
  - kg: the weight as entered
  - lb: weight × 0.45359237
  - plates: plates × plate weight, converted to kg; unknown if no plate weight is set
  - bodyweight: body weight + added weight; unknown if no weight has ever been logged
- **Set volume** = kg × reps, × 2 for "each side". Only sets that are done, aren't warm-ups and have reps count.
- **For each muscle group in the workout:**
  - the number of working sets done
  - total volume, shown rounded to whole kg
  - the change in volume against the last finished workout of the same routine: ▲ / ▼ with the difference in kg, = when within 1 kg, or nothing if there's no earlier one
- **Sets whose kg is unknown** count as sets but not as volume, and the recap names their exercises.

## Screens (text sketches)

Workouts:
```
‹ Home                    Workouts
┌──────────────────────────────────┐
│ Today · Monday                   │
│ Upper A · 8 exercises    [Start] │
└──────────────────────────────────┘
Other routines
  Lower A · Upper B · Lower B
  Empty workout
Past workouts
  Sat 22 Nov · Lower B · 71 min
  Thu 20 Nov · Upper B · 65 min
Routines and exercises · Log a past workout
```

Workout in progress:
```
‹ Workouts      Upper A   32:10   [Finish]
Bench press             3 × 6–10 · RPE ≤8
Last: 60×9, 60×8, 60×8
Note: seat 4
  W  40 kg × 10                         ✓
  1  60 kg × 9                          ✓
     RPE  6  7 [8] 9  10
  2  60 kg × 8                          ○
  3  60 kg × 8                          ○
  + Set   + Warm-up   ⋯ (swap, remove, move)
Lat pulldown ...
+ Add exercise
```

Recap:
```
Upper A · done · 68 min      vs last Upper A
Chest       9 sets    2,840 kg      ▲ 120
Back       12 sets    3,100 kg      ▲ 40
Shoulders   6 sets      960 kg      ▼ 30
Triceps     6 sets      720 kg      =
Leg extension isn't in the volume: set its plate weight.
```
The arrow compares **volume** with the last finished workout of the same routine, and shows the difference in kg. The set count has no arrow.

Exercise editor: name, muscle group, unit (kg / lb / plates / bodyweight), "1 plate =" weight and unit (plates only), each side, note.

Routine editor: name, weekdays, and an ordered list of exercises with sets, rep range, target RPE and starting weight.

## The user's plan (for the import file)

The user's four routines (exercises, sets × reps, RPE targets, week-1 weights, and Claude's muscle-group and "each side" calls for each exercise) are kept out of this public repository, in the git-ignored file `.superpowers/private/workouts-plan-import.md`. The rules used to build them:
- Numbers without a unit are kg; "pl" means plates; "bodyweight" means bodyweight with 0 added; "find it" means no starting weight.
- Exercises with the same name in two routines are one exercise, so "last time" carries across routines.
- Single-arm and single-leg exercises are "each side".
- Plan notes become exercise notes.

## Constraints

- **Same app and storage:** same stack (React, Dexie), data only on the phone, works offline, the soft-delete record pattern, and `nowIso()` timestamps.
- **The database version goes up** for the new tables. Existing data must survive the upgrade.
- **iPhone first:** tap targets of at least 44 pt, and number fields that bring up the number keypad with a decimal comma.
- **Backup format** stays JSON v1, with the new tables added to its shapes. Older backups import.

## Approaches

| Approach | Verdict |
|---|---|
| **Workouts inside the existing app and storage**, with a Workouts button on Home | **Chosen**: one place, on the phone, reusing storage, backup and screens |
| Free-text notes, like the Notes app, read by the app | Rejected: volume and pre-filling need structured numbers, and typos would break them |
| A workout app or service (Hevy, Strong, Apple Health) | Rejected: the user wants everything in one place, on his phone, with no accounts |

## Left to the builder

- **Storage shape.** Claude's lean is one record per workout holding its exercises and sets: simple to save as you go, resume, edit and back up. "Last time" is found by looking through recent workouts, perhaps with a multi-entry index on exercise ids.
- **Interaction details:** how reordering and swapping work, how the RPE buttons look, how numbers are edited inline.
- **The elapsed-time display** and how it ticks.
- **How "Log a past workout" sets its times.**
- **The import file's ids.**
