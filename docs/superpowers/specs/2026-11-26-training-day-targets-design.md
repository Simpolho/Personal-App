# Training-day and rest-day targets — design

Proposed 2026-11-26. Step 5 part 2. This is a small change.

## Intent

The user eats more on training days than on rest days. In his plan only the carbs differ, so the calories differ with them. Protein and fat stay the same every day. Over a week this averages out to his target. Today the app has one set of targets for every day. On rest days that makes the totals card measure him against the wrong numbers.

He wants a simple **Training day | Rest day** switch for each day. The switch only changes which targets apply. He turned down having the app work out the kind of day from logged workouts.

## Goals

- **Two sets of targets** in Settings, side by side: **Training day** and **Rest day**. Each has calories, protein, carbs and fat. Each box is optional, as now. Any of the four can differ between the sets, not only carbs.
- **A switch on Home and on the food log day** (any date): `[ Training day ][ Rest day ]`, at the top of the totals card. Tapping one saves the choice for that date. The totals, the bars and the "x / y" all use that set straight away.
- **Everything that uses the day's targets** uses the chosen set:
  - the Home totals card
  - the food log day's totals card
  - the amount screen's "left after this" line
  - the recipe portion screen
- **Starting choice:** a day nobody has switched starts on the weekly plan. If a live routine is scheduled on that weekday, it starts on Training day; otherwise Rest day. Once tapped, the saved choice wins, including on past days.
- **One set still works.** If every Rest day box is empty, every day uses the Training day set, exactly as today, and the switch is hidden.
- **Past days keep their targets.** Changing targets in Settings still applies from today on. A past day uses the targets in force on that date and that day's own choice.
- **Backups** carry both the rest-day set and each day's choice. Backups made before this change still import, as one set for every day with no saved choices.

## Non-goals

- Working out the kind of day from logged workouts, or switching automatically when a workout starts.
- A weekly average, or showing how the week compares with the target. That belongs to step 6 (insights).
- Different water targets, or anything in the workout screens, depending on the kind of day.
- Steps, cardio or meal plans from the user's coach notes. (His meals can already be saved as meal templates.)

## Approaches

| Approach | Verdict |
|---|---|
| **Save the choice on that day's record**, the one that already holds the "day complete" tick (`days`, `id === date`), as an optional field | **Chosen**: one choice per date, no new table and no database version change, and backups already include day records |
| One switch that stays put until changed (a setting) | Rejected: flipping it would also change the targets shown on every past day |
| A new table of day choices | Rejected: does the same as the chosen approach with an extra table and a database version change |

## Decided

- **Day record:** `Day` gains `kind?: 'training' | 'rest'`. An absent kind means "not chosen; use the weekly plan". Setting the kind keeps `complete` as it is. Setting `complete` keeps `kind` as it is.
- **Targets record:** the existing `kcal`/`protein`/`carbs`/`fat` fields are the Training day set. `Targets` gains `rest?: { kcal?, protein?, carbs?, fat? }`, the Rest day set, cleaned the same way (positive finite numbers only). Old records have no `rest`. That means one set for every day, so existing data needs no migration.
- **Which set applies on a date:**
  1. Take the targets record in force on that date (unchanged rule).
  2. If its rest set has no values, use the main set, whatever the kind.
  3. Otherwise use the rest set on a Rest day and the main set on a Training day.
  4. A set with no values means no targets, as now.
- **Settings form:** two columns, Training day and Rest day, with one row each for calories, protein, carbs and fat. The note says: "Leave the Rest day column empty to use the same targets every day." The button stays "Save — applies from today".
- **Switch look:** the same segmented style as the Add food screen's list tabs (Claude's call). The selected option uses the accent. It's labelled for VoiceOver as a choice between the two, with the selected one announced.
- **Weekdays** come from the routines' existing weekday setting (`routinesForDate`). Deleted routines don't count.

## Left to the builder

- How `getTargetsFor` changes shape (for example, returning the set plus the day's kind and whether the switch shows), as long as all four screens and Settings agree.
- Exact copy for the switch's VoiceOver label and the Settings column headings, in the app's plain style.
- Whether a day record created only to save a kind affects the backup reminder's "first entry" date. It must not trigger a reminder sooner than one real logged entry would.

## Example (generic numbers)

Training day: 2,400 kcal, 150 g protein, 280 g carbs, 70 g fat. Rest day: 2,000 kcal, 150 g protein, 180 g carbs, 70 g fat. On a Rest day the card reads `… / 2,000 kcal` and `Carbs … / 180 g`. Tapping Training day changes them to `… / 2,400 kcal` and `… / 280 g`.
