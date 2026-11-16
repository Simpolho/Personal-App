# Personal fitness app — design (foundation + step 1: food log)

Approved, 2026-11-16. Covers the whole app's foundation and step 1 in detail. Steps 2–7 get their own short design when we reach them, so each section is finished before the next starts.

## Intent

A personal-use app for one person that does what Cronometer does well for food logging (calories, macros, food database, barcode lookup), and puts food, body tracking (weight, measurements, progress photos), workouts and analytics in one place. Data stays on the phone and uses as little storage as possible; only barcode lookups go online.

## Goals

- Log food quickly: search, recent and favourite foods, recipes, barcode, manual add.
- See calories and macros against daily targets.
- Work offline, except barcode lookups.
- Full backup through export and import.
- Can later be wrapped as a real iPhone app (Capacitor) with the data carried over.

## Non-goals

- Other users, accounts, sharing.
- Syncing between devices. The phone is the device; a copy opened on a computer has its own separate data.
- App Store release.
- A server or backend.
- Apple Health in the web version.

## Anti-goals (would make it a failure even if it works)

- Data that disappears silently.
- Logging a common food takes more taps than in Cronometer.
- Large databases or full-size photos stored on the phone.
- Past days change when a food is edited later.

## Constraints

- No Mac; free hosting; no yearly fee for now.
- iPhone Safari, used from the Home Screen icon (Safari deletes a site's saved data after 7 days without a visit; Home Screen web apps are exempt).
- Safari has no built-in barcode reader, so a JavaScript library is needed (step 2).
- Open Food Facts: used for barcode lookups only (it limits search requests); data is user-contributed, so a review screen is needed before saving; attribution required (ODbL).
- USDA FoodData Central: public domain. INSA table: free Excel download; check its terms of use before bundling.

## Approaches considered

| Approach | Mac | Cost | Apple Health | Verdict |
|---|---|---|---|---|
| Native iPhone app (Swift) | Yes | Free with 7-day reinstall, or 99 USD/year | Yes | Not now: no Mac |
| Expo / React Native, cloud build | No | 99 USD/year | Yes | Not now: cost; possible later |
| Web app on the Home Screen | No | Free | No | **Chosen** |

Chosen: the web app, built so it can later be wrapped with Capacitor (keeping most of the code) if Apple Health becomes worth 99 USD a year. Data moves to the wrapped app by export and import.

## Decided with the user

- Web app first; Capacitor later if wanted.
- Everything stored on the phone; only barcode lookups go online.
- Small USDA and INSA tables bundled on the phone for offline search.
- Branded foods looked up by barcode in Open Food Facts; only foods actually used are saved.
- Build order, one section finished before the next:
  1. Food log, recipes, manual add, targets
  2. Barcode scanning
  3. Weight and body measurements
  4. Progress photos
  5. Workouts
  6. Insights and weekly summary
  7. Label scanning (optional)
- Export and import with permanent IDs, fixed units, and a version number in the file.
- Nutrients tracked: calories plus the EU label set (protein, carbs, fat, fibre, sugars, saturated fat, salt). Vitamins and minerals can be added later by reprocessing the tables.
- Meals are not fixed slots: the day starts empty and meals are created as you eat, as many as you want.
- Step 1 also includes:
  - **Remember the last amount:** each food suggests the amount used last time.
  - **Show the effect before adding:** the amount screen shows what's left of the day's targets after this food.
  - **Quick add:** an entry with just a name (optional), calories and macros, no food attached.
  - **"Day complete" check:** a tick per day; analytics later use only complete days.
- Dropped from step 1: recipes by cooked weight; copying a meal from another day; undo after delete.

## Builder's calls (Claude's proposals, open to correction)

- **Tools:** React + TypeScript + Vite; vite-plugin-pwa for the Home Screen app and offline use; IndexedDB through Dexie for storage; Tailwind for styling; Vitest for tests of the calculations and export/import.
- **Hosting:** GitHub Pages or Netlify (HTTPS is needed for the camera). Needs a free account in the user's name.
- **Language:** screens in English; food names shown as the source gives them (INSA in Portuguese, USDA in English); search covers both, ignoring accents.
- **Meals:** a new meal is named "Meal N" with the time it was created; renaming is optional, with names used before offered as suggestions. Any meal can be saved as a template and repeated later.
- **Targets:** set once and kept every day until you change them. Each of kcal, protein, carbs and fat is optional; with none set, the app just shows totals. A change applies from that day on, so past days keep the targets they had.
- **Units:** foods store nutrients per 100 g (or per 100 ml for drinks); log entries store the amount in the same unit.
- **Table foods are read-only.** "Duplicate to edit" makes an editable copy.
- **Data safety:** ask the browser for persistent storage; if not opened from the Home Screen, show how to add it; show "last backup N days ago" after 14 days without an export.
- **Day boundary:** an entry belongs to the date selected on the Today screen.

## Data model (step 1)

Every record has `id` (UUID), `createdAt`, `updatedAt` (ISO 8601, UTC) and `deletedAt` (soft delete, which keeps imports and a future sync simple).

- **TableFood** (bundled, read-only): `id` like `usda:171287` or `insa:1234`, `name`, `source`, `basis` (100g or 100ml), `nutrients`, `servings`.
- **Food** (custom, Open Food Facts, or edited copies): `name`, `brand?`, `barcode?`, `source` (custom / off), `sourceId?`, `basis`, `nutrients`, `servings` [{label, grams}], `favourite`, `lastUsedAt`.
- **FoodUsage:** `foodRef` (a TableFood or Food id), `lastAmount`, `lastUnit` (grams or a serving label), `lastUsedAt`. Kept separate so read-only table foods can remember amounts too.
- **Recipe:** `name`, `items` [{foodRef, grams}], `servings` (how many portions it makes); nutrients are calculated.
- **Meal:** `date` (local YYYY-MM-DD), `name`, `time` (when it was created, editable).
- **MealTemplate:** `name`, `items` [{foodRef or recipeRef, amount}].
- **Day:** `date`, `complete` (true/false).
- **LogEntry:** `mealId`, `foodRef` or `recipeRef` (both empty for a quick add), `nameSnapshot`, `amount`, `nutrientsSnapshot` (totals for this entry, so later edits to the food don't change past days).
- **Targets:** `effectiveFrom`, `kcal?`, `protein?`, `carbs?`, `fat?` (each optional).
- **Settings:** last export date and preferences.

**Nutrients tracked:** `kcal`, `protein`, `carbs`, `fat`, `fibre`, `sugars`, `saturatedFat`, `salt` (grams, except kcal). The `nutrients` field is a map, so more can be added later without changing the records.

## Food data pipeline

A script the developer runs (not part of the app) downloads the USDA Foundation and SR Legacy files and the INSA Excel, maps them to the app's nutrient names, and writes compact JSON files. These ship with the app; on first launch they are loaded into IndexedDB with a search index (lowercase, accents removed). Size target: under 5 MB compressed for the macros-only set.

Search order: recent and favourite foods, then saved foods and recipes, then the tables. Matches word starts, ignoring accents.

## Screens (step 1)

```
┌──────────────────────────────┐
│  ‹  Mon 16 Nov  ›             │
│  1 640 / 2 300 kcal           │
│  P ███████░░ 120/160 g        │
│  C █████░░░░ 150/250 g        │
│  F ██████░░░  55/ 75 g        │
├──────────────────────────────┤
│  Meal 1 · 08:15      520 kcal │
│   Oats, 80 g          303     │
│   Milk, 250 ml        125     │
│  Pre-workout · 17:30 210 kcal │
│   Banana, 1 medium    105     │
├──────────────────────────────┤
│        [ + Log food ]         │
└──────────────────────────────┘

Log food →
┌──────────────────────────────┐
│  Add to…                      │
│   + New meal                  │
│   ↻ Repeat a saved meal       │
│   Meal 1 · 08:15              │
│   Pre-workout · 17:30         │
└──────────────────────────────┘
```

- **Today:** date switcher, totals against targets, the day's meals in time order, one "Log food" button. Starts empty each day.
- **Log food → Add to…:** new meal, repeat a saved meal (creates a meal pre-filled with its foods), or add to one of today's meals. Tapping a meal on Today also opens it to add, edit or remove foods, rename it, change its time, delete it, or save it as a template.
- **Add food:** search box; Recent / Favourites / Recipes; a "Quick add" option; tap a result to open the amount screen.
- **Amount screen:** grams or a serving, pre-filled with the last amount used for that food; shows this food's calories and macros and what's left of the day's targets after adding it (only for the targets you've set).
- **Day complete:** a tick at the bottom of the Today screen.
- **Food editor (manual add):** name, brand, per 100 g or 100 ml, nutrients, servings.
- **Recipes:** list and editor (ingredients with grams, number of portions).
- **Settings:** targets, export, import, storage status, Home Screen instructions.

## Export and import

One JSON file: `{format: "fitness-app-export", version: 1, exportedAt, records: {foods, foodUsage, recipes, meals, mealTemplates, days, logEntries, targets, settings}}`. Progress photos (step 4) will be added as a zip alongside it.

Import checks the format and version, merges records by `id` (newer `updatedAt` wins), and reports what was added and updated. A test must confirm that export followed by import gives back identical data.

## Later steps (outline; each gets a short design before building)

- **2 Barcode:** camera scan with a JS library; look in saved foods, then Open Food Facts; review and fix values before saving.
- **3 Body:** weight with a 7-day average; waist, chest, arms and other measurements.
- **4 Progress photos:** front, side and back poses with an overlay of the last photo; side-by-side or slider comparison with date and weight; stored inside the app, resized to about 0.4 MB; included in export.
- **5 Workouts:** templates, sets with reps, weight and effort; rest timer; last session's numbers shown beside each set. Also: separate targets for training days and rest days (user asked to keep this for this step).
- **6 Insights:** weight trend, estimated maintenance calories, protein target hit rate, training volume, personal records, weekly summary; calculations use only days marked complete. Also: suggested calorie target changes when the weight trend doesn't match the goal for 2–3 weeks (user asked to keep this for this step).
- **7 Label scanning (optional):** read a nutrition table from a photo.

## Left to the builder

Component structure, styling details, exact search scoring, file layout, and the language of the data script.

## Risks

- Deleting the Home Screen icon or clearing Safari data erases everything; the backup reminder and export are the safety net.
- INSA terms of use, checked 2026-11-16: the spreadsheet's own "Informação adicional" sheet says that downloading it means accepting the conditions of use under copyright law, and that the source must be shown visibly wherever the data is used. There is no open licence; redistribution is neither granted nor forbidden. Decision (user): bundle the table and show the source in Settings, worded as the file asks: "Fonte: Base de Dados da Composição de Alimentos. Instituto Nacional de Saúde Doutor Ricardo Jorge, I. P.- INSA. v 7.1 - 2026". Bundling puts `insa.json` on the app's public URL. Contact if permission is ever wanted in writing: tabela.alimentos@insa.min-saude.pt.
- Open Food Facts values can be wrong; step 2's review screen handles that.
