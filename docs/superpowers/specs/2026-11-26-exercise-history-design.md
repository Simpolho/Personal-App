# Workouts, part 3: exercise history and kg / lb only — design (step 5)

Proposed 2026-11-26. This is the last part of step 5 (Workouts). Part 1 (logging) and part 2 (training-day and rest-day targets) are live.

## Intent

The user wants to follow his progress on each lift: open an exercise and see every session he has done it, newest first.

While starting this part he asked for two changes to units:
- He wants to **switch an exercise between kg and lb during a session**, because a machine may show either.
- He wants to **drop the plates and bodyweight units** and use only kg or lb. For a bodyweight exercise he types the weight he holds, so **0 kg means bodyweight only**. That is exactly how he wants to use it, and such a set's volume counts only the weight held.

Some of his exercises are already set to plates or bodyweight, with sets logged that way. The update has to move them to kg without losing or mis-converting anything.

## Goals

### 1. kg and lb only

- Exercises can only be **kg** or **lb**. The exercise editor offers just those two. The plate-weight boxes go away. "Each side" stays.
- **The first time the updated app opens,** it switches every exercise set to plates or bodyweight to **kg**, once and automatically. A backup imported later gets the same treatment, so an older backup can't bring plates back.
- **Sets already logged in plates stay as logged,** for example "14 plates". They can't be converted, because no plate weight is known. They show as logged in history and on the workout screen. New sets for that exercise are kg.
- **Plate sets in recaps (Claude's call):** with no plate-weight box any more, a plate set counts toward volume only if its exercise already had a plate weight. Otherwise it stays out, and the recap's note for it reads "logged in plates" instead of asking for a plate weight that can no longer be set.
- **Sets already logged in bodyweight become kg,** with the same number. The typed number was always the added weight in kg, so "+0" becomes "0 kg". A bodyweight set with no weight typed meant +0, so it becomes 0 kg. Their volume then counts only that weight, which is the new rule for these exercises.
- **Routine start weights that were plate counts are cleared** for exercises switched from plates. Otherwise "7 plates" would pre-fill as "7 kg", so the first kg session starts with an empty weight. Start weights on bodyweight exercises stay, because they already mean kg held.

### 2. kg / lb during a session

- Each exercise's ⋯ menu on the workout screen (with Swap, Remove, Move) gets a **kg | lb** choice.
- Switching **changes the unit label, not the numbers**, because the user types what the machine shows.
- It applies to that exercise in this workout, including sets already ticked.
- **During a workout in progress,** it also becomes the exercise's unit for next time. **On a finished workout,** where the menu is used for corrections, it changes only that workout's entry (Claude's call): a correction is about that session, not the next one.
- **On a finished workout, a plates entry has no switch** (Claude's call). Switching would relabel "14 plates" as "14 kg".
- The "Last:" line then shows the last session in the new unit, which is the existing rule.
- An entry still in plates in a workout **in progress** when the update arrives can be switched to kg or lb the same way, because the user is choosing the unit for the sets he's about to do.

### 3. The history screen

The layout he approved (example numbers):

```
‹  Bench press                    Edit
   Chest · kg
   Best: 80 × 6 · est. max 96 kg (17 Nov)

   Thu 26 Nov · Upper A           ›
   W 40×10
   80×6 @8 · 80×6 · 77.5×7
   Best 80×6 · est. max 96

   Mon 23 Nov · Upper B           ›
   77.5×7 · 77.5×6 · 75×8
   Best 77.5×7 · est. max 96
```

- **Ways in:**
  - Tapping the exercise's **name** on the workout screen, mid-session or on a finished workout.
  - Tapping the exercise in **Routines & exercises**. That list now opens the history, and **Edit** at the top opens the existing editor.
- **One block per finished workout** that includes the exercise, newest first. Each block shows:
  - the date and workout name
  - warm-up sets marked **W**
  - working sets as `weight×reps`, with `@RPE` where logged
  - the session's best set and its estimated max
- **Tapping a block** opens that workout, where it can be corrected as today.
- **Units:** a block shows each set in the unit it was logged in, with no conversion. Blocks in the exercise's current unit show no unit, as in the approved layout. A block in another unit names it after its sets, for example `14×10 · 13×10 · plates` or `· lb` (Claude's call), so no number reads as the wrong unit.
- **Workouts in progress** don't appear. Only finished ones do.
- **Empty state:** an exercise never done shows a plain line saying so, plus Edit.

**Estimated max** uses the Epley formula, `weight × (1 + reps / 30)`, with weight alone when reps is 1.
- It counts only working sets with a weight above 0, in kg or lb.
- Plate sets and 0 kg sets have none. In a session where every set is 0 kg, the best set is the one with the most reps, and no estimated max is shown.
- The number is rounded to a whole number and shown in the session's unit.

**Best set:** the set with the highest Epley value worked out on the numbers as logged (an empty weight counts as 0). A tie goes to more reps, then the earlier set. So an all-0 kg session's best set is its set with the most reps, and a plates session's best is ranked by its plate numbers. Only kg/lb sets with weight above 0 *show* an estimated max (Claude's call).

**The "Best" line at the top** is the best estimated max across all sessions, in the exercise's current unit. lb converts to kg at 0.45359237. It names that set, as logged with its unit when that differs from the current unit, and its date, for example `Best: 176 × 6 lb · est. max 93 kg (17 Nov)`. The line is hidden when no set has an estimated max.

## Non-goals

- Charts, personal-record badges and trends. These stay in step 6 (insights).
- Converting old plate sets to kg.
- Editing sets from the history screen. That stays on the workout screen.
- Changing how volume is worked out, beyond bodyweight sets now counting only the weight held.
- A bodyweight unit, or adding bodyweight to volume.

## Anti-goals

- Any logged number changing its meaning. "14 plates" must never read "14 kg".
- Losing a workout or set in the switch to kg.
- A set done as planned taking more than one tap. The ⋯ menu choice must not add steps to normal logging.

## Approaches

| Approach | Verdict |
|---|---|
| **Switch to kg once, automatically**, in a database upgrade, and run the same clean-up after every backup import | **Chosen**: nothing to remember, and old backups can't undo it |
| The user changes the affected exercises by hand in the editor | Rejected: easy to miss one, and an old backup would bring plates back |
| Relabel every old set as kg | Rejected: "14 plates" would read "14 kg" |
| **Work out history from saved workouts each time it opens**, using the existing `exerciseIds` index | **Chosen**: always matches the workouts, including corrections and deletions |
| Keep a running summary per exercise | Rejected: drifts when a workout is corrected or deleted |

## Decided

- **Units in the data:**
  - Exercises: `'kg' | 'lb'`.
  - Workout entries: `'kg' | 'lb' | 'plates'`. `'plates'` remains only for old entries.
  - `'bodyweight'` disappears after the clean-up.
  - Backups that still contain plates or bodyweight anywhere import and are cleaned up. They are not refused.
- **One clean-up function** (Claude's call), run by the database upgrade, and on each imported backup's own records before they're merged (keeping their timestamps; changed after the final review so restoring two old backups in turn can't bring back a plate start weight). It:
  - sets plates and bodyweight exercises to kg
  - clears start weights on routine items whose exercise was switched from plates
  - turns bodyweight entries into kg, with an empty weight becoming 0
  - changes no other record

  Records it changes get a new `updatedAt`, so re-importing an older backup doesn't overwrite them with the old version.
- **Plate weight:** an exercise's existing `plateWeight` value is kept, unused by the editor, so old plate sets that had one still count in recaps.
- **The switch in the menu** is the same segmented style as the Training day / Rest day switch (Claude's call). Its VoiceOver label is "Unit".
- **Routes** (Claude's call):
  - `/exercises/:id/history` for the new screen.
  - `/exercises/:id` stays the editor, and `/exercises/new` is unchanged.
  - The Routines & exercises list links to the history.

## Left to the builder

- Copy for the empty state, in the app's plain style.
- How the workout screen's exercise name becomes a link without breaking the save queue. The workout is saved as it goes, so leaving and coming back must lose nothing.
- How history formats numbers. It reuses the existing `weight×reps` formatting.
