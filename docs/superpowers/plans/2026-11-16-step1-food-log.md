# Step 1: Food Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Home Screen web app for iPhone that logs food into a free number of meals per day, against optional calorie and macro targets, with offline food tables, recipes, saved meals, quick add and full export/import.

**Architecture:** A static React app (no server). Pure calculation code lives in `src/domain/` and is tested without a browser; storage is IndexedDB through Dexie in `src/db/`, tested with fake-indexeddb; screens in `src/ui/` read live data with `useLiveQuery`. USDA and INSA tables are converted ahead of time by a Node script into compact JSON files that ship with the app and are loaded into IndexedDB on first launch.

**Tech Stack:** Vite, React 18+, TypeScript (strict), React Router (HashRouter), Dexie + dexie-react-hooks, Tailwind CSS v4 (`@tailwindcss/vite`), vite-plugin-pwa, Vitest + jsdom + fake-indexeddb + Testing Library; build script uses tsx, csv-parse, exceljs; icons use sharp.

**Spec:** `docs/superpowers/specs/2026-11-16-fitness-app-design.md`

## Global Constraints

- Nutrient keys, exactly and in this order: `kcal`, `protein`, `carbs`, `fat`, `fibre`, `sugars`, `saturatedFat`, `salt`. All grams except `kcal`. A missing value is absent from the map, never `0` and never `NaN`.
- Every stored record except table foods has `id` (UUID from `crypto.randomUUID()`), `createdAt`, `updatedAt` (ISO 8601 UTC, `new Date().toISOString()`), and optional `deletedAt`. Deleting sets `deletedAt`; nothing user-made is hard-deleted.
- Day dates are local `YYYY-MM-DD`, never derived from `toISOString()`. Meal times are local `HH:MM`.
- Table food ids are `usda:<fdc_id>` and `insa:<code>`. Table foods are read-only; editing goes through "Duplicate to edit".
- Foods store nutrients per 100 g (`basis: '100g'`) or per 100 ml (`basis: '100ml'`). All table foods are `'100g'`.
- A log entry stores `nutrientsSnapshot` when created. Nothing recomputes it from the food afterwards.
- Targets: set once, apply from `effectiveFrom` until a later record; each of `kcal`, `protein`, `carbs`, `fat` optional; with none set, screens show totals only.
- Export file: `{format: "fitness-app-export", version: 1, exportedAt, records: {foods, foodUsage, recipes, meals, mealTemplates, days, logEntries, targets, settings}}`.
- Backup reminder after 14 days without an export.
- Screens in English. Search ignores case and accents and matches word starts.
- No network calls at runtime in step 1 other than loading the app's own files.
- Bundled food tables: under 5 MB gzip in total.
- Tests run with `TZ=Europe/Lisbon`.

## Review Focus

1. **A food missing some nutrients** (INSA row without salt, manual food with fibre left blank): totals add only known values and never show `NaN`; the missing nutrient is shown as `–`. Tests: Task 1 (`sumNutrients`), Task 10 (amount screen shows `–`).
2. **Decimal comma** (`80,5` typed on a Portuguese keyboard): accepted as 80.5 everywhere a number is typed. Tests: Task 1 (`parseAmount`), Task 10 (amount screen).
3. **Logging after midnight or in summer time:** an entry made at 00:30 local belongs to the date on screen, and `localDate` never shifts a day because of UTC. Tests: Task 1 (`localDate` in July), Task 3 (`createMeal` near midnight).
4. **Editing or deleting a food that's already in past days:** past entries keep their numbers and names. Tests: Task 3.
5. **No targets set** (first launch): no progress bars, no "left after this", no `Infinity` or `NaN`. Tests: Task 4 (`remaining`), Task 9 (Today), Task 10 (amount screen).

---

### Task 1: Project setup and nutrient, amount and date helpers

**Files:**
- Create: project scaffold (`package.json`, `vite.config.ts`, `tsconfig*.json`, `index.html`, `src/main.tsx`, `src/index.css`, `src/test/setup.ts`, `.gitignore`)
- Create: `src/domain/nutrients.ts`, `src/domain/dates.ts`
- Test: `src/domain/nutrients.test.ts`, `src/domain/dates.test.ts`

**Interfaces:**
- Produces:
  - `NUTRIENT_KEYS: readonly ['kcal','protein','carbs','fat','fibre','sugars','saturatedFat','salt']`, `type NutrientKey`, `type Nutrients = Partial<Record<NutrientKey, number>>`
  - `type Basis = '100g' | '100ml'`, `interface Serving { label: string; grams: number }`
  - `scaleNutrients(per100: Nutrients, amount: number): Nutrients`
  - `scaleSnapshot(snapshot: Nutrients, factor: number): Nutrients`
  - `sumNutrients(list: Nutrients[]): Nutrients`
  - `formatNutrient(key: NutrientKey, value: number | undefined): string`
  - `parseAmount(input: string, opts?: { allowZero?: boolean }): number | null`
  - `amountInBase(amount: number, unit: string, basis: Basis, servings: Serving[]): number` (unit is `'g'`, `'ml'` or a serving label)
  - `localDate(d: Date): string`, `localTime(d: Date): string`, `addDays(date: string, n: number): string`, `formatDayLabel(date: string): string` (e.g. `'Mon 16 Nov'`), `nowIso(): string`

- [ ] **Step 1: Scaffold the project**

Run in an empty folder `fitness-app` (keep `docs/`):
```bash
npm create vite@latest . -- --template react-ts
npm i dexie dexie-react-hooks react-router-dom
npm i -D vitest jsdom fake-indexeddb @testing-library/react @testing-library/user-event @testing-library/jest-dom tailwindcss @tailwindcss/vite vite-plugin-pwa tsx csv-parse exceljs sharp @types/node
git init && git add -A && git commit -m "chore: scaffold Vite React TypeScript app"
```
Set `"test": "TZ=Europe/Lisbon vitest run"` in `package.json`. In `vite.config.ts` add `test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'] }` and the Tailwind plugin. `src/test/setup.ts` imports `fake-indexeddb/auto` and `@testing-library/jest-dom/vitest`, and calls `vi.useFakeTimers({ toFake: ['Date'] })` in a `beforeEach` (fake only `Date`: faking `setTimeout` stalls IndexedDB) with `vi.useRealTimers()` in `afterEach`. Tests then move the clock with `vi.setSystemTime(...)`. `src/index.css` is `@import "tailwindcss";`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/domain/nutrients.test.ts
const close = (a: Nutrients, e: Nutrients) => {
  expect(Object.keys(a).sort()).toEqual(Object.keys(e).sort());
  for (const k of Object.keys(e) as NutrientKey[]) expect(a[k]).toBeCloseTo(e[k]!, 6);
};

test('scaleNutrients scales per-100 values to the amount', () =>
  close(scaleNutrients({ kcal: 379, protein: 13.2, fat: 6.5 }, 80), { kcal: 303.2, protein: 10.56, fat: 5.2 }));
test('scaleNutrients keeps missing nutrients missing', () =>
  expect(scaleNutrients({ kcal: 100 }, 50)).toEqual({ kcal: 50 }));
test('scaleSnapshot multiplies every value', () =>
  close(scaleSnapshot({ kcal: 303.2, protein: 10.56 }, 0.5), { kcal: 151.6, protein: 5.28 }));
test('sumNutrients adds only known values', () => {
  expect(sumNutrients([{ kcal: 100, fibre: 2 }, { kcal: 50 }])).toEqual({ kcal: 150, fibre: 2 });
  expect(sumNutrients([])).toEqual({});
  expect(Number.isNaN(sumNutrients([{ kcal: 1 }, { salt: undefined }]).kcal)).toBe(false);
});
test('formatNutrient rounds per nutrient', () => {
  expect(formatNutrient('kcal', 311.2)).toBe('311');
  expect(formatNutrient('protein', 13.52)).toBe('13.5');
  expect(formatNutrient('salt', 0.254)).toBe('0.25');
  expect(formatNutrient('fibre', undefined)).toBe('–');
});
test('parseAmount accepts dot and comma decimals', () => {
  expect(parseAmount('80')).toBe(80);
  expect(parseAmount('80,5')).toBe(80.5);
  expect(parseAmount(' 80.5 ')).toBe(80.5);
  for (const bad of ['', 'abc', '-5', '0', '1,2,3']) expect(parseAmount(bad)).toBeNull();
  expect(parseAmount('0', { allowZero: true })).toBe(0);
});
test('amountInBase converts servings to grams', () => {
  const servings = [{ label: '1 medium', grams: 118 }];
  expect(amountInBase(80, 'g', '100g', servings)).toBe(80);
  expect(amountInBase(250, 'ml', '100ml', [])).toBe(250);
  expect(amountInBase(1.5, '1 medium', '100g', servings)).toBe(177);
  expect(() => amountInBase(1, 'slice', '100g', servings)).toThrow();
});
```
```ts
// src/domain/dates.test.ts  (runs with TZ=Europe/Lisbon)
test('localDate uses local time, not UTC', () => {
  expect(localDate(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02'); // 00:30 in Lisbon summer
  expect(localDate(new Date('2026-11-16T10:00:00Z'))).toBe('2026-11-16');
});
test('localTime is HH:MM local', () => expect(localTime(new Date('2026-07-01T07:05:00Z'))).toBe('08:05'));
test('addDays crosses months and years', () => {
  expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
  expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  expect(addDays('2026-03-28', 1)).toBe('2026-03-29'); // DST change weekend
});
test('formatDayLabel', () => expect(formatDayLabel('2026-11-16')).toBe('Mon 16 Nov'));
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/domain`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `src/domain/nutrients.ts` and `src/domain/dates.ts`**

`formatNutrient`: `kcal` 0 decimals, `salt` 2, others 1; `undefined` → `'–'`. `parseAmount`: trim, replace a single `,` with `.`, require `/^\d+(\.\d+)?$/`, reject 0 unless `allowZero`. `addDays`: build with `new Date(y, m - 1, d + n)` and read local parts back. `formatDayLabel`: English weekday and month short names, built by hand (no locale dependence).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/domain`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: nutrient, amount and date helpers"
```

---

### Task 2: Database, records and foods

**Files:**
- Create: `src/db/types.ts`, `src/db/db.ts`, `src/db/records.ts`, `src/db/foods.ts`
- Test: `src/db/foods.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces (`src/db/types.ts`):
  ```ts
  interface BaseRecord { id: string; createdAt: string; updatedAt: string; deletedAt?: string }
  interface TableFood { id: string; name: string; source: 'usda' | 'insa'; basis: Basis; nutrients: Nutrients; servings: Serving[]; searchKey: string }
  interface Food extends BaseRecord { name: string; brand?: string; barcode?: string; source: 'custom' | 'off'; sourceId?: string; basis: Basis; nutrients: Nutrients; servings: Serving[] }
  type FoodLike = TableFood | Food
  interface FoodUsage extends BaseRecord { /* id === foodRef */ foodRef: string; lastAmount: number; lastUnit: string; lastUsedAt: string; favourite: boolean }
  interface Recipe extends BaseRecord { name: string; items: { foodRef: string; grams: number }[]; servings: number }
  interface Meal extends BaseRecord { date: string; name: string; time: string }
  type TemplateItem =
    | { kind: 'food'; foodRef: string; amount: number; unit: string }
    | { kind: 'recipe'; recipeRef: string; amount: number }
    | { kind: 'quick'; name: string; nutrients: Nutrients }
  interface MealTemplate extends BaseRecord { name: string; items: TemplateItem[] }
  interface Day extends BaseRecord { /* id === date */ date: string; complete: boolean }
  interface LogEntry extends BaseRecord { mealId: string; foodRef?: string; recipeRef?: string; nameSnapshot: string; amount: number; unit: string; nutrientsSnapshot: Nutrients }
  interface Targets extends BaseRecord { effectiveFrom: string; kcal?: number; protein?: number; carbs?: number; fat?: number }
  interface Settings extends BaseRecord { /* id === 'settings' */ lastExportAt?: string }
  ```
  Favourites and last use live only on `FoodUsage` (one record per food ref), so read-only table foods can be favourites and remember amounts too. This replaces the spec's `favourite` / `lastUsedAt` fields on `Food`.
- Produces (`db.ts`): `class AppDB extends Dexie` with tables `tableFoods ('id')`, `foods ('id, barcode')`, `foodUsage ('id, lastUsedAt')`, `recipes ('id')`, `meals ('id, date')`, `mealTemplates ('id')`, `days ('id')`, `logEntries ('id, mealId')`, `targets ('id, effectiveFrom')`, `settings ('id')`, `meta ('key')`; `export const db`; `resetDb(): Promise<void>` (tests only: delete and reopen).
- Produces (`records.ts`): `newRecord<T extends object>(fields: T): T & BaseRecord`, `touched<T extends BaseRecord>(r: T): T` (new `updatedAt`), `softDeleted<T extends BaseRecord>(r: T): T`.
- Produces (`foods.ts`): `isTableRef(ref: string): boolean`, `getFood(ref: string): Promise<FoodLike | undefined>` (returns deleted foods too), `listFoods(): Promise<Food[]>` (not deleted), `saveFood(input: Omit<Food, keyof BaseRecord | 'source'> & { id?: string; createdAt?: string; source?: Food['source'] }): Promise<Food>`, `duplicateFood(ref: string): Promise<Food>`, `deleteFood(id: string): Promise<void>`, `recordUsage(foodRef: string, amount: number, unit: string): Promise<void>`, `getUsage(foodRef: string): Promise<FoodUsage | undefined>`, `setFavourite(foodRef: string, on: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/db/foods.test.ts
beforeEach(() => resetDb());
const oats: TableFood = { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g',
  nutrients: { kcal: 379, protein: 13.2 }, servings: [{ label: '1 cup', grams: 81 }], searchKey: 'oats' };

test('saveFood creates a custom food with record fields', async () => {
  const f = await saveFood({ name: 'Granola caseira', basis: '100g', nutrients: { kcal: 450 }, servings: [] });
  expect(f.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(f.source).toBe('custom');
  expect(f.createdAt).toBe(f.updatedAt);
  expect(await getFood(f.id)).toEqual(f);
});
test('saveFood with an id updates and keeps createdAt', async () => {
  const f = await saveFood({ name: 'A', basis: '100g', nutrients: {}, servings: [] });
  vi.setSystemTime(new Date(Date.now() + 1000));
  const g = await saveFood({ ...f, name: 'B' });
  expect(g.createdAt).toBe(f.createdAt);
  expect(g.updatedAt > f.updatedAt).toBe(true);
});
test('getFood resolves table refs', async () => {
  await db.tableFoods.put(oats);
  expect(isTableRef('usda:173904')).toBe(true);
  expect(await getFood('usda:173904')).toEqual(oats);
});
test('duplicateFood copies a table food into an editable custom food', async () => {
  await db.tableFoods.put(oats);
  const copy = await duplicateFood('usda:173904');
  expect(copy).toMatchObject({ name: 'Oats', source: 'custom', basis: '100g', nutrients: oats.nutrients, servings: oats.servings });
  expect(copy.id).not.toBe(oats.id);
  expect(await getFood('usda:173904')).toEqual(oats);
});
test('deleteFood hides it from lists but keeps it resolvable', async () => {
  const f = await saveFood({ name: 'X', basis: '100g', nutrients: {}, servings: [] });
  await deleteFood(f.id);
  expect(await listFoods()).toEqual([]);
  expect((await getFood(f.id))?.deletedAt).toBeDefined();
});
test('recordUsage and setFavourite upsert one usage record per food', async () => {
  await recordUsage('usda:173904', 80, 'g');
  await recordUsage('usda:173904', 60, 'g');
  await setFavourite('usda:173904', true);
  expect(await getUsage('usda:173904')).toMatchObject({ id: 'usda:173904', lastAmount: 60, lastUnit: 'g', favourite: true });
  expect(await db.foodUsage.count()).toBe(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/db/foods.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `types.ts`, `db.ts`, `records.ts`, `foods.ts`**

`setFavourite` on a food never used creates a usage record with `lastAmount: 0, lastUnit: ''`; Task 10 treats `lastAmount: 0` as "no last amount".

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/db/foods.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: database schema and foods"
```

---

### Task 3: Meals, log entries and the day view

**Files:**
- Create: `src/db/log.ts`
- Test: `src/db/log.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; Task 2 `db`, `getFood`, `recordUsage`, `newRecord`, `touched`, `softDeleted`.
- Produces:
  - `nextMealName(names: string[]): string`
  - `createMeal(date: string, now?: Date): Promise<Meal>` (name from `nextMealName` of that day's live meals, time `localTime(now)`)
  - `renameMeal(id: string, name: string)`, `setMealTime(id: string, time: string)`, `deleteMeal(id: string)` (soft-deletes its entries too): `Promise<void>`
  - `logFood(mealId: string, foodRef: string, amount: number, unit: string): Promise<LogEntry>` (snapshot from `scaleNutrients(food.nutrients, amountInBase(...))`, `nameSnapshot` = food name plus `, brand` when present; calls `recordUsage`)
  - `quickAdd(mealId: string, name: string | undefined, nutrients: Nutrients): Promise<LogEntry>` (`nameSnapshot` `'Quick add'` when no name, `amount: 1`, `unit: 'quick'`)
  - `updateEntryAmount(id: string, amount: number, unit: string): Promise<LogEntry>` (scales the existing snapshot by new base amount ÷ old base amount; never re-reads the food; for `unit: 'portion'` the factor is new ÷ old portions)
  - `updateQuickAdd(id: string, name: string | undefined, nutrients: Nutrients): Promise<LogEntry>`
  - `deleteEntry(id: string): Promise<void>`
  - `interface MealView { meal: Meal; entries: LogEntry[]; totals: Nutrients }`, `interface DayView { date: string; complete: boolean; meals: MealView[]; totals: Nutrients }`
  - `getDay(date: string): Promise<DayView>` (live meals sorted by `time`, live entries by `createdAt`)
  - `setDayComplete(date: string, complete: boolean): Promise<void>`
  - `firstEntryAt(): Promise<string | undefined>` (earliest live entry `createdAt`, for the backup reminder)
  - `pastMealNames(limit = 20): Promise<string[]>` (distinct names of live meals, excluding `Meal N`, most recently created first; the rename field offers them as suggestions)

- [ ] **Step 1: Write the failing tests**

```ts
// src/db/log.test.ts
beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T08:15:00Z')); // 08:15 Lisbon (UTC+0 in November)
  await db.tableFoods.bulkPut([
    { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379, protein: 13.2 }, servings: [], searchKey: 'oats' },
    { id: 'usda:173944', name: 'Banana', source: 'usda', basis: '100g', nutrients: { kcal: 89 }, servings: [{ label: '1 medium', grams: 118 }], searchKey: 'banana' },
  ]);
});

test('nextMealName counts past the highest "Meal N"', () => {
  expect(nextMealName([])).toBe('Meal 1');
  expect(nextMealName(['Meal 1', 'Pre-workout', 'Meal 3'])).toBe('Meal 4');
});
test('createMeal names and times the meal', async () => {
  expect(await createMeal('2026-11-16')).toMatchObject({ date: '2026-11-16', name: 'Meal 1', time: '08:15' });
  expect((await createMeal('2026-11-16')).name).toBe('Meal 2');
});
test('a meal created at 00:30 belongs to the date on screen', async () => {
  vi.setSystemTime(new Date('2026-07-01T23:30:00Z')); // 00:30 on 2 July in Lisbon
  expect(await createMeal('2026-07-01')).toMatchObject({ date: '2026-07-01', time: '00:30' });
});
test('logFood snapshots nutrients and remembers the amount', async () => {
  const m = await createMeal('2026-11-16');
  const e = await logFood(m.id, 'usda:173904', 80, 'g');
  expect(e.nameSnapshot).toBe('Oats');
  expect(e.nutrientsSnapshot.kcal).toBeCloseTo(303.2);
  expect(e.nutrientsSnapshot.protein).toBeCloseTo(10.56);
  expect(await getUsage('usda:173904')).toMatchObject({ lastAmount: 80, lastUnit: 'g' });
});
test('logFood converts servings', async () => {
  const m = await createMeal('2026-11-16');
  expect((await logFood(m.id, 'usda:173944', 1, '1 medium')).nutrientsSnapshot.kcal).toBeCloseTo(105.02);
});
test('editing or deleting a food later does not change past entries', async () => {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  const m = await createMeal('2026-11-16');
  await logFood(m.id, f.id, 100, 'g');
  await saveFood({ ...f, name: 'Pão novo', nutrients: { kcal: 999 } });
  await deleteFood(f.id);
  const day = await getDay('2026-11-16');
  expect(day.meals[0].entries[0]).toMatchObject({ nameSnapshot: 'Pão', nutrientsSnapshot: { kcal: 250 } });
});
test('updateEntryAmount scales the snapshot without re-reading the food', async () => {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  const m = await createMeal('2026-11-16');
  const e = await logFood(m.id, f.id, 100, 'g');
  await saveFood({ ...f, nutrients: { kcal: 999 } });
  expect((await updateEntryAmount(e.id, 40, 'g')).nutrientsSnapshot.kcal).toBeCloseTo(100);
});
test('quickAdd has no food and a default name', async () => {
  const m = await createMeal('2026-11-16');
  expect(await quickAdd(m.id, undefined, { kcal: 650, protein: 30 }))
    .toMatchObject({ nameSnapshot: 'Quick add', foodRef: undefined, nutrientsSnapshot: { kcal: 650, protein: 30 } });
});
test('getDay sorts meals by time, totals live entries, and skips deleted ones', async () => {
  const a = await createMeal('2026-11-16');
  const b = await createMeal('2026-11-16');
  await setMealTime(a.id, '12:30');
  await quickAdd(a.id, 'Lunch out', { kcal: 700 });
  await quickAdd(b.id, undefined, { kcal: 300 });
  const gone = await quickAdd(b.id, undefined, { kcal: 999 });
  await deleteEntry(gone.id);
  const day = await getDay('2026-11-16');
  expect(day.meals.map((x) => x.meal.id)).toEqual([b.id, a.id]);
  expect(day.totals).toEqual({ kcal: 1000 });
  expect(day.complete).toBe(false);
});
test('deleteMeal removes the meal and its entries from the day', async () => {
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, undefined, { kcal: 300 });
  await deleteMeal(m.id);
  expect(await getDay('2026-11-16')).toMatchObject({ meals: [], totals: {} });
});
test('setDayComplete persists', async () => {
  await setDayComplete('2026-11-16', true);
  expect((await getDay('2026-11-16')).complete).toBe(true);
});
test('pastMealNames suggests names used before, newest first, without "Meal N"', async () => {
  const a = await createMeal('2026-11-15');
  await renameMeal(a.id, 'Lunch');
  vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
  const b = await createMeal('2026-11-16');
  await renameMeal(b.id, 'Pre-workout');
  await createMeal('2026-11-16');
  vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
  const c = await createMeal('2026-11-16');
  await renameMeal(c.id, 'Lunch');
  expect(await pastMealNames()).toEqual(['Lunch', 'Pre-workout']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/db/log.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement `src/db/log.ts`**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/db`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: meals, log entries and day view"
```

---

### Task 4: Targets

**Files:**
- Create: `src/domain/targets.ts`, `src/db/targets.ts`
- Test: `src/domain/targets.test.ts`, `src/db/targets.test.ts`

**Interfaces:**
- Consumes: Task 1 `Nutrients`; Task 2 `Targets`, `db`, `newRecord`, `touched`.
- Produces:
  - `TARGET_KEYS = ['kcal','protein','carbs','fat'] as const`, `type TargetKey`, `type TargetValues = Partial<Record<TargetKey, number>>`
  - `targetsFor(date: string, list: Targets[]): TargetValues | null` (latest live record with `effectiveFrom <= date`; `null` when none or when that record sets no values)
  - `remaining(targets: TargetValues, totals: Nutrients): TargetValues` (only keys set in `targets`; missing totals count as 0; can be negative)
  - `setTargets(effectiveFrom: string, values: TargetValues): Promise<Targets>` (updates the record with the same `effectiveFrom` if one exists)
  - `listTargets(): Promise<Targets[]>` (live, sorted by `effectiveFrom`), `getTargetsFor(date: string): Promise<TargetValues | null>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/targets.test.ts
const rec = (effectiveFrom: string, v: TargetValues, deletedAt?: string) =>
  ({ id: effectiveFrom, createdAt: '', updatedAt: '', effectiveFrom, deletedAt, ...v }) as Targets;
test('no records means no targets', () => expect(targetsFor('2026-11-16', [])).toBeNull());
test('the latest record on or before the date wins, as a whole set', () => {
  const list = [rec('2026-11-01', { kcal: 2300, protein: 160 }), rec('2026-11-10', { kcal: 2100 })];
  expect(targetsFor('2026-10-31', list)).toBeNull();
  expect(targetsFor('2026-11-05', list)).toEqual({ kcal: 2300, protein: 160 });
  expect(targetsFor('2026-11-10', list)).toEqual({ kcal: 2100 });
});
test('a record with no values switches targets off', () =>
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 }), rec('2026-11-15', {})])).toBeNull());
test('deleted records are ignored', () =>
  expect(targetsFor('2026-11-16', [rec('2026-11-01', { kcal: 2300 }), rec('2026-11-15', { kcal: 1, }, 'x')])).toEqual({ kcal: 2300 }));
test('remaining covers only set targets and never NaN', () => {
  expect(remaining({ kcal: 2100 }, { kcal: 1640, protein: 120 })).toEqual({ kcal: 460 });
  expect(remaining({ kcal: 2000, protein: 150 }, {})).toEqual({ kcal: 2000, protein: 150 });
  expect(remaining({ kcal: 2000 }, { kcal: 2100 })).toEqual({ kcal: -100 });
  expect(remaining({}, { kcal: 500 })).toEqual({});
});
```
```ts
// src/db/targets.test.ts
beforeEach(() => resetDb());
test('setTargets on the same day updates instead of adding', async () => {
  await setTargets('2026-11-16', { kcal: 2300 });
  await setTargets('2026-11-16', { kcal: 2200, protein: 160 });
  expect(await listTargets()).toHaveLength(1);
  expect(await getTargetsFor('2026-11-20')).toEqual({ kcal: 2200, protein: 160 });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- targets`
Expected: FAIL

- [ ] **Step 3: Implement both files**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- targets`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: optional targets with effective dates"
```

---

### Task 5: Search

**Files:**
- Create: `src/domain/search.ts`, `src/db/search.ts`
- Test: `src/domain/search.test.ts`, `src/db/search.test.ts`

**Interfaces:**
- Consumes: Task 2 tables and types.
- Produces:
  - `normalize(s: string): string` (lowercase, NFD with combining marks removed, punctuation to spaces, single spaces, trimmed)
  - `matches(query: string, name: string): boolean` (every query word is the start of some word in `name`; empty query → false)
  - `type SearchResult = { kind: 'food' | 'recipe'; ref: string; name: string; detail?: string; group: 0 | 1 | 2 }` (`detail` = brand, or `'USDA'` / `'INSA'` for table foods)
  - `searchAll(query: string, limit = 50): Promise<SearchResult[]>` (fewer than 2 characters after `normalize` → `[]`; group 0 = foods with a usage record that is a favourite or used, by `lastUsedAt` desc; group 1 = saved foods and recipes not in group 0, by name; group 2 = table foods not in group 0, shorter names first; deleted foods and recipes excluded; table foods read once into memory and cached)
  - `recentItems(limit = 20): Promise<SearchResult[]>`, `favouriteItems(): Promise<SearchResult[]>`, `recipeItems(): Promise<SearchResult[]>`

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/search.test.ts
test('normalize strips accents and punctuation', () => expect(normalize('Açúcar, Amarelo!')).toBe('acucar amarelo'));
test('matches word starts across accents', () => {
  expect(matches('acucar', 'Açúcar amarelo')).toBe(true);
  expect(matches('rice', 'Rice, white, cooked')).toBe(true);
  expect(matches('rice', 'Brown rice')).toBe(true);
  expect(matches('rice', 'Price list')).toBe(false);
  expect(matches('arroz coz', 'Arroz agulha, cozido')).toBe(true);
  expect(matches('', 'Arroz')).toBe(false);
});
```
```ts
// src/db/search.test.ts
beforeEach(async () => {
  await resetDb();
  await db.tableFoods.bulkPut([
    { id: 'insa:1', name: 'Arroz agulha, cru', source: 'insa', basis: '100g', nutrients: {}, servings: [], searchKey: 'arroz agulha cru' },
    { id: 'insa:2', name: 'Arroz carolino, cozido', source: 'insa', basis: '100g', nutrients: {}, servings: [], searchKey: 'arroz carolino cozido' },
  ]);
});
test('used foods first, then saved foods, then tables', async () => {
  const mine = await saveFood({ name: 'Arroz do pai', basis: '100g', nutrients: {}, servings: [] });
  await recordUsage('insa:2', 150, 'g');
  expect((await searchAll('arroz')).map((r) => [r.ref, r.group])).toEqual([['insa:2', 0], [mine.id, 1], ['insa:1', 2]]);
});
test('short queries and deleted foods return nothing', async () => {
  const f = await saveFood({ name: 'Arroz velho', basis: '100g', nutrients: {}, servings: [] });
  await deleteFood(f.id);
  expect(await searchAll('a')).toEqual([]);
  expect((await searchAll('arroz velho'))).toEqual([]);
});
test('recipes are searchable', async () => {
  await saveRecipe({ name: 'Arroz de pato', items: [], servings: 4 });
  expect((await searchAll('pato'))[0]).toMatchObject({ kind: 'recipe', name: 'Arroz de pato', group: 1 });
});
```
(`saveRecipe` comes from Task 6. If Task 5 is built first, write that test with `db.recipes.put(newRecord({ name: 'Arroz de pato', items: [], servings: 4 }))` instead.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- search`
Expected: FAIL

- [ ] **Step 3: Implement both files**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- search`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: accent-insensitive food search"
```

---

### Task 6: Recipes and saved meals

**Files:**
- Create: `src/db/recipes.ts`, `src/db/templates.ts`
- Test: `src/db/recipes.test.ts`, `src/db/templates.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `saveRecipe(input: { id?: string; name: string; items: { foodRef: string; grams: number }[]; servings: number }): Promise<Recipe>`, `deleteRecipe(id: string)`, `listRecipes(): Promise<Recipe[]>`
  - `recipeNutrientsPerPortion(recipe: Recipe): Promise<Nutrients>` (sum of item nutrients ÷ `servings`)
  - `logRecipe(mealId: string, recipeRef: string, portions: number): Promise<LogEntry>` (`unit: 'portion'`, snapshot = per-portion × portions; records usage with `lastUnit: 'portion'`)
  - `saveMealAsTemplate(mealId: string, name: string): Promise<MealTemplate>`
  - `listTemplates(): Promise<MealTemplate[]>`, `deleteTemplate(id: string)`
  - `applyTemplate(templateId: string, date: string, now?: Date): Promise<Meal>` (new meal named after the template, time `localTime(now)`, entries logged fresh through `logFood` / `logRecipe` / `quickAdd`)

- [ ] **Step 1: Write the failing tests**

```ts
// src/db/recipes.test.ts
beforeEach(async () => {
  await resetDb();
  vi.setSystemTime(new Date('2026-11-16T08:15:00Z'));
  await db.tableFoods.bulkPut([
    { id: 'usda:173904', name: 'Oats', source: 'usda', basis: '100g', nutrients: { kcal: 379 }, servings: [], searchKey: 'oats' },
    { id: 'usda:171265', name: 'Milk', source: 'usda', basis: '100g', nutrients: { kcal: 42 }, servings: [], searchKey: 'milk' },
  ]);
});
test('per-portion nutrients and logging portions', async () => {
  const r = await saveRecipe({ name: 'Papas', items: [{ foodRef: 'usda:173904', grams: 80 }, { foodRef: 'usda:171265', grams: 250 }], servings: 2 });
  expect((await recipeNutrientsPerPortion(r)).kcal).toBeCloseTo(204.1);
  const m = await createMeal('2026-11-16');
  const e = await logRecipe(m.id, r.id, 1.5);
  expect(e).toMatchObject({ nameSnapshot: 'Papas', unit: 'portion', amount: 1.5 });
  expect(e.nutrientsSnapshot.kcal).toBeCloseTo(306.15);
});
```
```ts
// src/db/templates.test.ts  (same beforeEach as recipes.test.ts)
test('save a meal as a template and repeat it on another day', async () => {
  const m = await createMeal('2026-11-16');
  await logFood(m.id, 'usda:173904', 80, 'g');
  await quickAdd(m.id, 'Coffee', { kcal: 5 });
  const t = await saveMealAsTemplate(m.id, 'Usual breakfast');
  expect(t.items).toEqual([
    { kind: 'food', foodRef: 'usda:173904', amount: 80, unit: 'g' },
    { kind: 'quick', name: 'Coffee', nutrients: { kcal: 5 } },
  ]);
  vi.setSystemTime(new Date('2026-11-17T07:40:00Z'));
  const copy = await applyTemplate(t.id, '2026-11-17');
  expect(copy).toMatchObject({ name: 'Usual breakfast', date: '2026-11-17', time: '07:40' });
  const day = await getDay('2026-11-17');
  expect(day.totals.kcal).toBeCloseTo(308.2);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- recipes templates`
Expected: FAIL

- [ ] **Step 3: Implement both files**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/db`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: recipes and saved meals"
```

---

### Task 7: Export, import and backup reminder

**Files:**
- Create: `src/db/backup.ts`, `src/domain/backup.ts`
- Test: `src/db/backup.test.ts`, `src/domain/backup.test.ts`

**Interfaces:**
- Consumes: Task 2 tables.
- Produces:
  - `EXPORT_FORMAT = 'fitness-app-export'`, `EXPORT_VERSION = 1`, `type ExportFile = { format: string; version: number; exportedAt: string; records: Record<RecordTable, BaseRecord[]> }`, `RECORD_TABLES = ['foods','foodUsage','recipes','meals','mealTemplates','days','logEntries','targets','settings'] as const`
  - `exportAll(): Promise<ExportFile>` (sets `settings.lastExportAt` first, includes soft-deleted records, never `tableFoods` or `meta`)
  - `class ImportError extends Error`
  - `importAll(file: unknown): Promise<{ added: number; updated: number; skipped: number }>` (per record: absent → add; incoming `updatedAt` newer → replace; else skip; one Dexie transaction)
  - `backupDue(lastExportAt: string | undefined, firstEntryAt: string | undefined, now: Date): boolean` (due when 14 days or more have passed since the last export, or, if never exported, since the first entry)
  - `exportFileName(now: Date): string` → `fitness-backup-YYYY-MM-DD.json` (local date)

- [ ] **Step 1: Write the failing tests**

```ts
// src/domain/backup.test.ts
const now = new Date('2026-11-16T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
test('backupDue', () => {
  expect(backupDue(undefined, undefined, now)).toBe(false);
  expect(backupDue(undefined, daysAgo(15), now)).toBe(true);
  expect(backupDue(daysAgo(13), daysAgo(40), now)).toBe(false);
  expect(backupDue(daysAgo(14), daysAgo(40), now)).toBe(true);
});
test('exportFileName', () => expect(exportFileName(now)).toBe('fitness-backup-2026-11-16.json'));
```
```ts
// src/db/backup.test.ts
beforeEach(() => resetDb());
async function seed() {
  const f = await saveFood({ name: 'Pão', basis: '100g', nutrients: { kcal: 250 }, servings: [] });
  const m = await createMeal('2026-11-16');
  await logFood(m.id, f.id, 50, 'g');
  await setTargets('2026-11-16', { kcal: 2200 });
  await setDayComplete('2026-11-16', true);
  const gone = await quickAdd(m.id, undefined, { kcal: 1 });
  await deleteEntry(gone.id);
}
test('export then import into an empty app gives back the same records', async () => {
  await seed();
  const file = await exportAll();
  expect(file).toMatchObject({ format: 'fitness-app-export', version: 1 });
  expect(file.records.logEntries).toHaveLength(2); // includes the deleted one
  await resetDb();
  expect(await importAll(JSON.parse(JSON.stringify(file)))).toMatchObject({ updated: 0, skipped: 0 });
  const again = await exportAll();
  for (const t of RECORD_TABLES.filter((t) => t !== 'settings')) expect(again.records[t]).toEqual(file.records[t]);
});
test('importing the same file twice changes nothing', async () => {
  await seed();
  const file = await exportAll();
  expect(await importAll(file)).toMatchObject({ added: 0, updated: 0 });
});
test('newer records win', async () => {
  await seed();
  const file = await exportAll();
  const f = (await listFoods())[0];
  vi.setSystemTime(new Date(Date.now() + 60_000));
  await saveFood({ ...f, name: 'Pão de forma' });
  await importAll(file);
  expect((await listFoods())[0].name).toBe('Pão de forma');
});
test('rejects other files and newer versions', async () => {
  await expect(importAll({ hello: 1 })).rejects.toThrow('Not a backup file from this app');
  await expect(importAll({ format: 'fitness-app-export', version: 2, exportedAt: '', records: {} }))
    .rejects.toThrow('This backup was made by a newer version of the app');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- backup`
Expected: FAIL

- [ ] **Step 3: Implement both files**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- backup`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: export, import and backup reminder"
```

---

### Task 8: Food tables (build script and first-launch loader)

**Files:**
- Create: `scripts/food-tables/usda.ts`, `scripts/food-tables/insa.ts`, `scripts/food-tables/insa-columns.ts`, `scripts/build-food-tables.ts`, fixtures under `scripts/food-tables/fixtures/usda/`
- Create: `src/data/tables.ts`
- Test: `scripts/food-tables/usda.test.ts`, `scripts/food-tables/insa.test.ts`, `src/data/tables.test.ts`
- Modify: `package.json` (`"tables": "tsx scripts/build-food-tables.ts"`), `.gitignore` (`data-raw/`)

**Interfaces:**
- Consumes: Task 1 `NUTRIENT_KEYS`; Task 5 `normalize`; Task 2 `db`.
- Produces:
  - `type TableFoodRow = [id: string, name: string, basis: Basis, values: (number | null)[], servings: [label: string, grams: number][]]` (values in `NUTRIENT_KEYS` order)
  - `type TableFile = { version: string; source: 'usda' | 'insa'; foods: TableFoodRow[] }`
  - `convertUsda(dir: string): TableFile`
  - `convertInsa(xlsxPath: string, columns: InsaColumns): Promise<TableFile>`, `type InsaColumns = { code: string; name: string } & Partial<Record<NutrientKey | 'sodiumMg', string>>` (values are header texts)
  - `TABLES_VERSION = '2026-11'`, `TABLE_FILES = ['food-tables/usda.json', 'food-tables/insa.json']`
  - `parseTableFile(file: TableFile): TableFood[]`
  - `ensureTablesLoaded(fetchFn?: typeof fetch): Promise<'loaded' | 'already'>` (compares `meta` key `tablesVersion`; clears and bulk-loads `tableFoods` when different; a missing file is skipped)

USDA mapping (nutrient ids; verify each against `nutrient.csv` before running): `kcal` 1008, else 2047, else 2048; `protein` 1003; `carbs` 1005; `fat` 1004; `fibre` 1079; `sugars` 2000, else 1063; `saturatedFat` 1258; sodium 1093 in mg → `salt = sodium × 2.5 / 1000`. Keep only `data_type` `foundation_food` and `sr_legacy_food`. Servings from `food_portion.csv`: label `"{amount} {modifier or measure unit name}"`, grams `gram_weight`; skip rows without `gram_weight`.

- [ ] **Step 1: Write the failing tests**

Fixture CSVs (same headers as the USDA download, a few rows): food 100 "Oats" (`sr_legacy_food`), food 200 "Branded thing" (`branded_food`); nutrients for 100: 1008 = 379, 1003 = 13.2, 1093 = 6; one portion for 100: amount 1, modifier "cup", gram_weight 81.
```ts
// scripts/food-tables/usda.test.ts
test('convertUsda keeps generic foods and maps nutrients', () => {
  const t = convertUsda(new URL('./fixtures/usda', import.meta.url).pathname);
  expect(t.source).toBe('usda');
  expect(t.foods).toHaveLength(1);
  const [id, name, basis, values, servings] = t.foods[0];
  expect([id, name, basis]).toEqual(['usda:100', 'Oats', '100g']);
  expect(values[0]).toBe(379);
  expect(values[1]).toBe(13.2);
  expect(values[2]).toBeNull();
  expect(values[7]).toBeCloseTo(0.015);
  expect(servings).toEqual([['1 cup', 81]]);
});
```
```ts
// scripts/food-tables/insa.test.ts — builds a small .xlsx with exceljs in a temp dir first
test('convertInsa maps configured columns and accepts comma decimals', async () => {
  // header row: Código | Nome | Energia (kcal) | Proteína (g) | Sódio (mg); one row: 'IS001', 'Arroz agulha, cru', '358', '7,2', '' 
  const t = await convertInsa(tmpFile, { code: 'Código', name: 'Nome', kcal: 'Energia (kcal)', protein: 'Proteína (g)', sodiumMg: 'Sódio (mg)' });
  expect(t.foods[0]).toEqual(['insa:IS001', 'Arroz agulha, cru', '100g', [358, 7.2, null, null, null, null, null, null], []]);
});
```
```ts
// src/data/tables.test.ts
beforeEach(() => resetDb());
const file: TableFile = { version: '2026-11', source: 'insa', foods: [['insa:IS001', 'Açúcar branco', '100g', [400, 0, 100, 0, 0, 100, 0, 0], []]] };
const fakeFetch = (async (url: string) =>
  url.endsWith('insa.json') ? new Response(JSON.stringify(file)) : new Response('', { status: 404 })) as typeof fetch;
test('loads once per version', async () => {
  expect(await ensureTablesLoaded(fakeFetch)).toBe('loaded');
  expect(await ensureTablesLoaded(fakeFetch)).toBe('already');
  expect(await db.tableFoods.get('insa:IS001')).toMatchObject({ searchKey: 'acucar branco', nutrients: { kcal: 400, protein: 0 } });
});
test('parseTableFile drops nulls instead of storing zeros', () =>
  expect(parseTableFile({ ...file, foods: [['usda:1', 'X', '100g', [10, null, null, null, null, null, null, null], []]] })[0].nutrients).toEqual({ kcal: 10 }));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tables usda insa`
Expected: FAIL

- [ ] **Step 3: Implement the converters, the loader and `scripts/build-food-tables.ts`**

The build script reads `data-raw/usda-sr-legacy/`, `data-raw/usda-foundation/` (merged into one `usda.json`) and `data-raw/insa.xlsx`, writes `public/food-tables/usda.json` and `insa.json`, prints each file's gzip size, and exits with an error if the gzip total is 5 MB or more.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tables usda insa`
Expected: PASS

- [ ] **Step 5: Check INSA terms, then build the real tables**

1. Read the terms of use on the PortFIR site (portfir-insa.min-saude.pt) for the Tabela da Composição de Alimentos. Note the result in `docs/superpowers/specs/2026-11-16-fitness-app-design.md` under Risks. If bundling is not allowed, skip `insa.json` and tell the user before continuing.
2. Download into `data-raw/` (gitignored): USDA FoodData Central "SR Legacy" and "Foundation Foods" CSV downloads, and the INSA Excel ("Composição de Alimentos > Descarregar Excel da TCA").
3. Open the INSA file, read its header row, and fill `scripts/food-tables/insa-columns.ts` with the exact header texts.
4. Run: `npm run tables`
   Expected: two files in `public/food-tables/`, gzip total under 5 MB, no error.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: bundled USDA and INSA food tables"
```

---

### Task 9: App shell, Today screen, Log food, meal screen, saved meals

**Files:**
- Create: `src/App.tsx`, `src/ui/screens/TodayScreen.tsx`, `src/ui/screens/LogFoodSheet.tsx`, `src/ui/screens/MealScreen.tsx`, `src/ui/screens/TemplatePicker.tsx`, `src/ui/components/TotalsCard.tsx`, `src/ui/components/ConfirmDialog.tsx`, `src/test/render.tsx` (`renderAt(hash: string)`: sets `window.location.hash`, renders `<App />`; each UI test file calls `resetDb()` in `beforeEach`, seeds data, then calls `renderAt`; tests share `const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`)
- Modify: `src/main.tsx` (render `App`, call `ensureTablesLoaded()` and `requestPersistence()` from Task 11 once it exists)
- Test: `src/ui/screens/today.test.tsx`, `src/ui/screens/meal.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–7 (`getDay`, `createMeal`, meal edits, `setDayComplete`, `getTargetsFor`, `remaining`, `listTemplates`, `applyTemplate`, `saveMealAsTemplate`, `backupDue`, `firstEntryAt`).
- Produces: routes in `App.tsx` (HashRouter), used by Tasks 10–11:
  - `/` → redirect to `/day/<today>`; `/day/:date`; `/day/:date/log`; `/day/:date/templates`
  - `/meal/:mealId`; `/meal/:mealId/add`; `/meal/:mealId/add/:foodRef`; `/meal/:mealId/recipe/:recipeId`; `/meal/:mealId/quick`
  - `/foods/new`; `/foods/:id`; `/recipes`; `/recipes/:id` (`new` for a new one); `/settings`
  - `TotalsCard({ totals, targets }: { totals: Nutrients; targets: TargetValues | null })`: kcal line `"{total} / {target} kcal"` or `"{total} kcal"`; one `role="progressbar"` per set target with `aria-label` `Calories`, `Protein`, `Carbs`, `Fat`.

Screen content (from the spec's sketch): date with ‹ › arrows; totals card; meals in time order, each with name · time, kcal, and its entries; a "Log food" button; a "Day complete" checkbox; a backup banner "Last backup over 14 days ago — Export now" linking to Settings when `backupDue`. Log food sheet: "New meal", "Repeat a saved meal", then the day's meals. "New meal" creates the meal and opens its add-food screen. Meal screen: entries with tap-to-edit amount (quick adds edit their numbers), delete entry, rename (a text field with a `<datalist>` of `pastMealNames()`), change time, delete meal (in-app `ConfirmDialog`, never `window.confirm`), "Save as saved meal" (asks for a name, default the meal's name), "Add food". All screens use `useLiveQuery`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/screens/today.test.tsx — render <App/> at a hash route; fake time 2026-11-16T10:00:00Z
test('first launch: empty day, totals only, no bars', async () => {
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('Mon 16 Nov')).toBeInTheDocument();
  expect(screen.getByText('0 kcal')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('button', { name: 'Log food' })).toBeInTheDocument();
});
test('with a calorie target only, one bar and "x / y kcal"', async () => {
  await setTargets('2026-11-01', { kcal: 2300 });
  const m = await createMeal('2026-11-16');
  await quickAdd(m.id, undefined, { kcal: 1640 });
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText('1640 / 2300 kcal')).toBeInTheDocument();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);
});
test('Log food → New meal creates "Meal 1" and opens food search', async () => {
  renderAt('#/day/2026-11-16');
  await user.click(await screen.findByRole('button', { name: 'Log food' }));
  await user.click(screen.getByRole('button', { name: 'New meal' }));
  expect(await screen.findByPlaceholderText('Search foods')).toBeInTheDocument();
  expect((await getDay('2026-11-16')).meals[0].meal.name).toBe('Meal 1');
});
test('arrows change the day and Day complete persists', async () => {
  renderAt('#/day/2026-11-16');
  await user.click(await screen.findByRole('button', { name: 'Previous day' }));
  expect(await screen.findByText('Sun 15 Nov')).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Day complete' }));
  expect((await getDay('2026-11-15')).complete).toBe(true);
});
test('backup banner appears when a backup is due', async () => {
  vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
  await quickAdd((await createMeal('2026-10-01')).id, undefined, { kcal: 1 });
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
  renderAt('#/day/2026-11-16');
  expect(await screen.findByText(/Last backup over 14 days ago/)).toBeInTheDocument();
});
```
```tsx
// src/ui/screens/meal.test.tsx
test('rename, retime, save as saved meal, repeat it', async () => { /* rename to "Pre-workout", set time 17:30,
  save as "Snack", then on 2026-11-17 Log food → Repeat a saved meal → "Snack"; expect a meal "Snack" on 2026-11-17 */ });
test('deleting a meal asks first and removes it', async () => { /* click "Delete meal", then "Delete" in the dialog;
  expect getDay(...).meals toEqual [] */ });
```
Write the two meal tests out in full, following the comments.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/ui`
Expected: FAIL

- [ ] **Step 3: Implement the screens, `TotalsCard`, `ConfirmDialog` and routes**

Mobile-first layout with Tailwind: one column, large tap targets (min 44 px), "Log food" fixed at the bottom above the safe-area inset.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Today, Log food and meal screens"
```

---

### Task 10: Add food, amount screen, quick add, food editor

**Files:**
- Create: `src/ui/screens/AddFoodScreen.tsx`, `src/ui/screens/AmountScreen.tsx`, `src/ui/screens/RecipePortionScreen.tsx`, `src/ui/screens/QuickAddScreen.tsx`, `src/ui/screens/FoodEditorScreen.tsx`
- Test: `src/ui/screens/addfood.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–6 and the routes from Task 9.
- Produces: no new exports beyond the screens.

Behaviour:
- **Add food** (`/meal/:mealId/add`): input with placeholder `Search foods`; with an empty query, tabs Recent / Favourites / Recipes; typing shows `searchAll` results with `detail`; buttons "Quick add" and "New food". A food result opens the amount screen; a recipe opens the portion screen.
- **Amount** (`/meal/:mealId/add/:foodRef`): amount input pre-filled with `getUsage(ref).lastAmount` and its unit when `lastAmount > 0`, else the first serving at 1, else 100 in `g`/`ml` by basis; a unit picker (`g` or `ml`, plus serving labels); this amount's kcal, protein, carbs, fat with `formatNutrient` (`–` for missing); when the day has targets, a line `Left after this: {kcal} kcal · {protein} g protein · …` listing only set targets; a favourite star; "Add" logs and returns to the meal; an invalid amount shows `Enter an amount` and does not log. Table foods show "Duplicate to edit"; saved foods show "Edit food".
- **Recipe portions** (`/meal/:mealId/recipe/:recipeId`): portions input (default last used, else 1), per-portion nutrients, "Left after this" as above, "Add".
- **Quick add** (`/meal/:mealId/quick`): optional name; kcal, protein, carbs, fat inputs parsed with `allowZero`; at least one value required (`Enter calories or a macro`).
- **Food editor** (`/foods/new`, `/foods/:id`): name (required, `Enter a name`), brand, "per 100 g" / "per 100 ml", the eight nutrients (kcal required, others optional, blank = missing), servings (label + grams, add/remove), Save, Delete (soft, with `ConfirmDialog`). Arriving with `?meal=<id>` returns to that meal's amount screen for the new food after saving.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/screens/addfood.test.tsx — fixtures: tables with Oats (kcal 379, protein 13.2, no fibre); a meal on 2026-11-16
test('search, pick, amount pre-filled from last time, add', async () => {
  await logFood(meal.id, 'usda:173904', 80, 'g');
  renderAt(`#/meal/${meal.id}/add`);
  await user.type(await screen.findByPlaceholderText('Search foods'), 'oat');
  await user.click(await screen.findByText('Oats'));
  expect(await screen.findByLabelText('Amount')).toHaveValue('80');
  expect(screen.getByText('303 kcal')).toBeInTheDocument();
  expect(screen.getByTestId('nutrient-fibre')).toHaveTextContent('–');
});
test('comma decimals are accepted', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173904`);
  const input = await screen.findByLabelText('Amount');
  await user.clear(input); await user.type(input, '80,5');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  expect((await getDay('2026-11-16')).meals[0].entries.at(-1)!.amount).toBe(80.5);
});
test('"Left after this" only with targets, only for set ones', async () => {
  renderAt(`#/meal/${meal.id}/add/usda:173904`); // never logged before → default 100 g → 379 kcal
  expect(await screen.findByLabelText('Amount')).toHaveValue('100');
  expect(screen.queryByText(/Left after this/)).toBeNull();
  await setTargets('2026-11-01', { kcal: 2300 });
  expect(await screen.findByText('Left after this: 1921 kcal')).toBeInTheDocument();
});
test('empty amount shows an error and logs nothing', async () => { /* clear input, click Add, expect "Enter an amount", no new entry */ });
test('quick add with only kcal', async () => { /* name blank, kcal 650 → entry "Quick add" 650 kcal */ });
test('new food from the add screen returns to its amount screen', async () => { /* New food → fill name + kcal → Save →
  amount screen for the new food */ });
test('table foods offer Duplicate to edit', async () => { /* on Oats amount screen, click "Duplicate to edit" → food editor
  with name "Oats"; saving creates a custom food and leaves the table food unchanged */ });
```
Write the commented tests out in full.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- addfood`
Expected: FAIL

- [ ] **Step 3: Implement the five screens**

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add food, amounts, quick add and food editor"
```

---

### Task 11: Recipes and Settings screens, Home Screen app, deploy

**Files:**
- Create: `src/ui/screens/RecipesScreen.tsx`, `src/ui/screens/RecipeEditorScreen.tsx`, `src/ui/screens/SettingsScreen.tsx`, `src/pwa/storage.ts`, `public/icon.svg`, `scripts/make-icons.mjs`, `.github/workflows/deploy.yml`
- Modify: `vite.config.ts` (VitePWA), `index.html` (`apple-touch-icon`, `apple-mobile-web-app-capable`, theme colour), `src/main.tsx`
- Test: `src/ui/screens/settings.test.tsx`, `src/ui/screens/recipes.test.tsx`

**Interfaces:**
- Consumes: Tasks 4, 6, 7, 8, 9.
- Produces: `src/pwa/storage.ts`: `isStandalone(): boolean` (`matchMedia('(display-mode: standalone)')` or `navigator.standalone`), `requestPersistence(): Promise<boolean>`, `storageStatus(): Promise<{ persisted: boolean; usedMB: number | null }>`.

Behaviour:
- **Recipes**: list (name, kcal per portion) and editor: name, number of portions, ingredients (search with `searchAll`, foods only, grams each), live per-portion kcal and macros, Save, Delete.
- **Settings**: targets form with four optional inputs (blank = not set, decimal comma accepted) and "Save — applies from today" calling `setTargets(localDate(new Date()), values)`; "Export backup" (builds `exportAll()`, shares the file with `navigator.share({ files })` when `navigator.canShare` allows it, else downloads it as `exportFileName(now)`); "Import backup" (file input, `.json`; shows `Imported: {added} added, {updated} updated, {skipped} unchanged` or the `ImportError` message); storage line (`Saved permanently: yes/no · {usedMB} MB used`); when not standalone, the Home Screen instructions: "Open in Safari, tap Share, then Add to Home Screen. Your data is only kept safely when you use the app from the Home Screen icon."
- **PWA**: `registerType: 'autoUpdate'`; manifest `name: 'Fitness log'`, `short_name: 'Fitness'`, `display: 'standalone'`, `start_url: './'`, `scope: './'`, icons 192 and 512; workbox `globPatterns: ['**/*.{js,css,html,svg,png,json}']`, `maximumFileSizeToCacheInBytes: 10 * 1024 * 1024` so the food tables work offline. `vite.config.ts` `base: './'`.
- **Icons**: `scripts/make-icons.mjs` renders `public/icon.svg` with sharp to `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (180).
- **Deploy**: GitHub Actions on push to `main`: `npm ci`, `npm test`, `npm run build`, upload `dist` with `actions/upload-pages-artifact`, deploy with `actions/deploy-pages`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/screens/settings.test.tsx
test('saving targets applies from today, blanks mean not set', async () => {
  renderAt('#/settings');
  await user.type(await screen.findByLabelText('Calories (kcal)'), '2300');
  await user.type(screen.getByLabelText('Protein (g)'), '160,5');
  await user.click(screen.getByRole('button', { name: /Save/ }));
  expect(await getTargetsFor('2026-11-16')).toEqual({ kcal: 2300, protein: 160.5 });
});
test('import shows a summary or the error', async () => {
  renderAt('#/settings');
  const good = new File([JSON.stringify(await exportAll())], 'b.json', { type: 'application/json' });
  await user.upload(await screen.findByLabelText('Import backup'), good);
  expect(await screen.findByText(/^Imported: \d+ added, \d+ updated, \d+ unchanged$/)).toBeInTheDocument();
  await user.upload(screen.getByLabelText('Import backup'), new File(['{"x":1}'], 'bad.json', { type: 'application/json' }));
  expect(await screen.findByText('Not a backup file from this app')).toBeInTheDocument();
});
```
```tsx
// src/ui/screens/recipes.test.tsx
test('create a recipe and see kcal per portion', async () => { /* name "Papas", portions 2, add Oats 80 g and Milk 250 g
  → "204 kcal per portion"; listRecipes() has one recipe with those items */ });
```
Write the recipe test out in full.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- settings recipes`
Expected: FAIL

- [ ] **Step 3: Implement screens, `storage.ts`, PWA config, icons and the deploy workflow**

- [ ] **Step 4: Run the full suite and a production build**

Run: `npm test && npm run build`
Expected: all tests PASS; `dist/` contains `manifest.webmanifest`, `sw.js`, `food-tables/*.json`.

- [ ] **Step 5: Check on the iPhone**

1. Push to a GitHub repository with Pages enabled (source: GitHub Actions); wait for the deploy job.
2. Open the Pages URL in Safari on the iPhone, Share → Add to Home Screen, open from the icon.
3. Check: the app opens full screen; Settings says "Saved permanently: yes"; search "arroz" finds INSA foods and "rice" finds USDA foods; log a meal; turn on Airplane mode, close and reopen the app, the meal is still there and search still works; export a backup to Files; import it again and see `0 added`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: recipes, settings, Home Screen app and deploy"
```
