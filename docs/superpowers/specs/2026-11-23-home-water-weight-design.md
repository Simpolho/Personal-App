# Home, water and weight — design (step 3)

Proposed 2026-11-23. This is build step 3 of the app design (`2026-11-16-fitness-app-design.md`), "Weight and body measurements", reshaped with the user: body measurements are dropped, and a Home screen and water tracking are added.

## Intent

Open the app on a summary of the day rather than the food log, so the food log becomes a secondary screen as the app grows. Home shows calories and macros, water and weight, with one tap to log any of them. Weight is tracked with a 7-day average so daily ups and downs don't hide the trend.

## Goals

- **Home is where the app opens.** It shows:
  - the date, with a gear that opens Settings
  - today's calories and macros against targets (the same card as the food log)
  - a water card
  - a weight card
  - **Food log** and **+ Log food** buttons
  - the backup reminder, when due
- **Water card:** today's total against a target, with a bar. Two one-tap buttons (+250 ml, +500 ml) and **Undo** for the last tap of the day.
- **Weight card:** the latest weight, the 7-day average and the change per week.
  - If nothing is logged today, it says **"Not weighed today"** and highlights **Log weight**.
  - Tapping the card opens the Weight screen.
- **Weight screen:** log a weight, see the trend, fix past entries.
  - **Logging:** starts at the last weight logged; the date defaults to today, and a past date can be chosen. There's one weight per day, so logging again on the same day replaces it.
  - **30-day chart:** one dot per weigh-in, plus a line for the 7-day average.
  - **History list:** every weigh-in, with edit and delete.
- **Settings:** the water target and the two button sizes (defaults 2 L, 250 ml and 500 ml).
- **Food log:** keeps everything it has today and gains a ‹ back to Home.
  - **Done** on a meal from today goes to Home.
  - **Done** on a meal from an earlier day goes to that day's food log.
- **Backups:** export and import include weights and water.

## Non-goals

- Body measurements and body fat % (the user's decision).
- Drinks from the food log counting as water (the user's decision; only tapped water counts).
- Notifications or weigh-in reminders outside the app.
- A Workouts button. It's added in step 5, when workouts exist, so there's never a button that leads nowhere.
- Editing water for earlier days.
- Units other than kg and ml.

## Anti-goals (would make it a failure even if it works)

- Logging food taking more taps than now. **+ Log food** on Home keeps it at the same count.
- A nudge that pops up or blocks anything. Nudges are only lines on Home.
- Losing water or weight data in a backup round trip.

## Constraints

- **Same app and storage:** same stack, data only on the phone, works offline.
- **Numbers:** a decimal comma is accepted. Weights, averages and weekly change are kept and shown with 2 decimals (the user's decision).
- **Older backups** (from before step 3) must still import.

## Approaches

| Approach | Verdict |
|---|---|
| **A Home screen as the app's start, built from what exists:** the totals card, Dexie storage, and a small hand-drawn SVG chart | **Chosen**: what the user described, with the fewest new parts |
| Tabs along the bottom (Home / Food / Workouts) | Not now. The user asked for buttons on Home, and with only Food behind it a tab bar is mostly empty. Worth revisiting in step 5 |
| A chart library (e.g. Recharts) | Rejected. It adds roughly 100 KB for one small chart; a hand-drawn SVG is a few dozen lines and works offline |

## Decided with the user

- **Home:** shows calories, macros and water, with a Food log button. A Workouts button comes once workouts exist.
- **Accepted suggestions:**
  - **+ Log food** on Home
  - water with one-tap buttons, a target in Settings, and Undo
  - a weight card on Home that opens the Weight screen
  - no Workouts button until step 5
  - Settings behind a gear
  - the backup reminder on Home
  - the Food log unchanged
- **Weight:** a 30-day chart, the last weight pre-filled, the "Not weighed today" nudge shown when the app is opened, and 2 decimals for weights.
- **Water:** only tapped water counts.
- **Left out:** body measurements and body fat %.

## Builder's calls (Claude's proposals, open to correction)

- **Routes:** `/` becomes Home (it used to jump to today's food log). The new Weight screen is at `/weight`. The food log stays at `/day/:date`.
- **Data:**
  - **Weights:** `WeightEntry { date, kg }`, with `id = date`, so there's one per day.
  - **Water:** `WaterEntry { date, ml }`, one record per tap, so Undo removes the last one.
  - **Settings:** `waterTargetMl`, `waterSmallMl`, `waterLargeMl`.
  - All are soft-deleted like everything else.
- **7-day average:** the mean of the weigh-ins in the 7 days ending today; days without one are skipped.
- **Weekly change:** this average minus the average of the 7 days before. It's shown only when both weeks have at least one weigh-in.
- **Input:** weights between 20 and 300 kg are accepted, typed with up to 2 decimals.
- **Empty card:** before the first weigh-in, the weight card says "No weight yet" and shows **Log weight**.
- **Chart:** covers the last 30 days. The vertical axis is fitted to the weights shown, with a little room above and below.
- **Reopening the app on a new day:** a screen that belonged to the old "today" goes to Home. Home always shows today.
- **Backup file:** stays version 1, with `weights` and `water` lists added. A file without them (an older backup) imports as before.
- **Tests:**
  - the average and weekly-change sums
  - water add and Undo
  - one weight per day
  - the Home screen, including the nudge, Food log, + Log food and the gear
  - the Weight screen, including pre-filling, the chart's points, and edit and delete
  - Done's destination
  - the backup round trip with the new data

## Left to the builder

Card layout details, the chart's look, file layout.

## Risks

- Weighing at different times of day adds noise. The 7-day average is there to smooth it.
