# Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan a barcode on the Add food screen; a saved product opens its amount screen, a new one is looked up in Open Food Facts and checked in the food editor before saving.

**Architecture:** Pure barcode rules in `src/domain/barcode.ts`; the Open Food Facts call and its mapping to a food draft in `src/data/openFoodFacts.ts`; "saved food first, then Open Food Facts" in `src/scan/resolve.ts`; the camera loop in `src/scan/scanner.ts` (dependencies injectable, so it is tested without a camera); a new Scan screen, and the existing food editor gains a review mode. No changes to the data model: `Food.barcode`, `source: 'off'` and `sourceId` already exist.

**Tech Stack:** React 19 + TypeScript + Vite 8, Dexie, React Router 7 (HashRouter), Vitest + jsdom + fake-indexeddb, `barcode-detector` 3.x (ZXing as WebAssembly, MIT).

**Spec:** `docs/superpowers/specs/2026-11-20-barcode-scanning-design.md` (and the app design `docs/superpowers/specs/2026-11-16-fitness-app-design.md`).

## Global Constraints

- Formats read: EAN-13, EAN-8, UPC-A, UPC-E.
- The reader's `.wasm` is served by the app and precached by the service worker; never fetched from a CDN.
- Open Food Facts: `GET https://world.openfoodfacts.org/api/v3/product/{code}` with `fields=code,product_name,product_name_pt,brands,quantity,product_quantity_unit,serving_quantity,serving_size,nutriments`, header `X-User-Agent: FitnessLog/1.0 (https://simpolho.github.io/Personal-App/)`, gives up after 8 s. No personal data is sent.
- At most 15 Open Food Facts lookups a minute: one lookup per scan, never a lookup while typing.
- A missing value stays blank, never 0 (as in step 1).
- Nothing from Open Food Facts is saved until the user taps Save in the editor.
- The camera stops when the Scan screen closes, after a read, and when the app goes to the background.
- Credit line (Settings → Food data): `Product data from Open Food Facts (openfoodfacts.org), under the Open Database License (ODbL).`
- Commits end with the attribution lines given in the session.

## Review Focus

1. **Patchy Open Food Facts data:** energy only in kJ, numbers sent as strings, or no nutrients at all. kcal is computed from kJ, strings become numbers, and missing values stay blank. Test: Task 2.
2. **Drinks:** a quantity in ml, cl or l gives a food per 100 ml. Test: Task 2.
3. **The same product read differently:** 12-digit UPC-A against a stored 13-digit EAN, or a typed barcode with spaces, still finds the saved food. A typed barcode with a wrong check digit is refused. Tests: Tasks 1 and 5.
4. **No connection, slow server or rate limit:** no endless spinner. New food opens with the barcode attached and nothing is saved. Tests: Tasks 2 and 5.
5. **The camera left on, or one barcode handled twice:** leaving the screen or going to the background stops every track, and a second read of the same frame does not navigate twice. Tests: Tasks 3 and 5.

---

### Task 1: Barcode rules and finding a saved food by barcode

**Files:**
- Create: `src/domain/barcode.ts`, `src/domain/barcode.test.ts`
- Modify: `src/db/foods.ts`, `src/db/foods.test.ts`

**Interfaces:**
- Produces: `normalizeBarcode(input: string): string | null`; `findFoodByBarcode(code: string): Promise<Food | undefined>`.

- [ ] **Step 1: Write the failing tests** in `src/domain/barcode.test.ts`:

```ts
test('normalizeBarcode keeps valid EAN-13 and EAN-8', () => {
  expect(normalizeBarcode('3017624010701')).toBe('3017624010701');
  expect(normalizeBarcode('96385074')).toBe('96385074');
});
test('normalizeBarcode puts UPC-A and GTIN-14 in 13-digit form and ignores spaces and dashes', () => {
  expect(normalizeBarcode('049000050103')).toBe('0049000050103');
  expect(normalizeBarcode('00049000050103')).toBe('0049000050103');
  expect(normalizeBarcode(' 3017624 010701 ')).toBe('3017624010701');
  expect(normalizeBarcode('3017-6240-10701')).toBe('3017624010701');
});
test('normalizeBarcode refuses wrong check digits, letters and other lengths', () => {
  for (const bad of ['3017624010702', 'ABC', '', '12345', '30176240107011234']) expect(normalizeBarcode(bad)).toBeNull();
});
```

and in `src/db/foods.test.ts`:

```ts
test('findFoodByBarcode finds the live food, the most recently changed one, in any barcode form', async () => {
  const old = await saveFood({ name: 'Old', barcode: '0049000050103', basis: '100g', nutrients: {}, servings: [] });
  vi.setSystemTime(new Date(Date.now() + 1000));
  const newer = await saveFood({ name: 'Newer', barcode: '0049000050103', basis: '100g', nutrients: {}, servings: [] });
  expect((await findFoodByBarcode('049000050103'))?.id).toBe(newer.id);
  await deleteFood(newer.id);
  expect((await findFoodByBarcode('0049000050103'))?.id).toBe(old.id);
  expect(await findFoodByBarcode('3017624010701')).toBeUndefined();
  expect(await findFoodByBarcode('not a code')).toBeUndefined();
});
```

- [ ] **Step 2: Run** `npm test -- barcode foods` → Expected: FAIL (`normalizeBarcode` and `findFoodByBarcode` not exported).
- [ ] **Step 3: Implement `normalizeBarcode` in `src/domain/barcode.ts`.** Strip spaces and dashes; anything else that isn't a digit → null. Length 12 → prefix `0`; length 14 starting with `0` → drop it; then only lengths 8 and 13 are accepted. Check the GS1 check digit (weights 3,1,3… from the right, excluding the check digit) → null if wrong. **Implement `findFoodByBarcode` in `src/db/foods.ts`:** normalize (null → undefined), query `db.foods.where('barcode').equals(code)`, keep live ones, return the greatest `updatedAt`.
- [ ] **Step 4: Run** `npm test -- barcode foods` → Expected: PASS.
- [ ] **Step 5: Commit** `feat: barcode rules and finding a saved food by barcode`.

---

### Task 2: Open Food Facts lookup and "saved food first"

**Files:**
- Create: `src/data/openFoodFacts.ts`, `src/data/openFoodFacts.test.ts`, `src/data/fixtures/off-nutella.json`, `src/scan/resolve.ts`, `src/scan/resolve.test.ts`

**Interfaces:**
- Consumes: `normalizeBarcode`, `findFoodByBarcode` (Task 1); `Basis`, `Nutrients`, `Serving` (`src/domain/nutrients.ts`).
- Produces:
  - `type FoodDraft = { name: string; brand?: string; basis: Basis; nutrients: Nutrients; servings: Serving[]; barcode: string; sourceId: string }`
  - `offProductToDraft(product: Record<string, unknown>, code: string): FoodDraft`
  - `type LookupResult = { kind: 'found'; draft: FoodDraft } | { kind: 'not-found' } | { kind: 'offline' } | { kind: 'error' }`
  - `lookupOpenFoodFacts(code: string, fetchFn?: typeof fetch, timeoutMs?: number): Promise<LookupResult>`
  - `OFF_APP_ID = 'FitnessLog/1.0 (https://simpolho.github.io/Personal-App/)'`
  - in `src/scan/resolve.ts`: `type ScanOutcome = { kind: 'saved'; food: Food } | LookupResult` and `resolveBarcode(code: string, fetchFn?: typeof fetch): Promise<ScanOutcome>`.

- [ ] **Step 1: Save the fixture.** Fetch `https://world.openfoodfacts.org/api/v3/product/3017624010701?fields=<Global Constraints fields>` once and save the JSON as `src/data/fixtures/off-nutella.json`. It is the real response shape: `{ status, result: { id }, product: { … } }`.
- [ ] **Step 2: Write the failing tests** in `src/data/openFoodFacts.test.ts`. The tests call `offProductToDraft`:
  - **Nutella (the fixture):** `{ name: 'Nutella', brand: 'Ferrero', basis: '100g', barcode: '3017624010701', sourceId: '3017624010701', servings: [] }`, with `nutrients.kcal` 539, `protein` 6.3, `carbs` 57.5, `fat` 30.9, `sugars` 56.3, `saturatedFat` 10.6 and `salt` ≈ 0.108 (3 decimals). `fibre` is `undefined`.
  - **Portuguese name:** `product_name_pt: 'Iogurte natural'` wins over `product_name: 'Plain yoghurt'`.
  - **Brand:** `brands: 'Mimosa, Lactogal'` → `'Mimosa'`.
  - **Drinks:** `{ product_quantity_unit: 'ml' }`, `{ quantity: '33 cl' }` and `{ quantity: '1,5 L' }` each give basis `'100ml'`.
  - **Patchy numbers:** `nutriments: { energy_100g: 1000, proteins_100g: '7.5', fat_100g: '' }` gives `kcal` ≈ 239.006, `protein` 7.5 and no `fat` key.
  - **Sodium only:** `sodium_100g: 0.4` gives `salt` 1.
  - **Servings:** `serving_quantity: 30, serving_size: '30 g'` gives `servings: [{ label: '1 serving', grams: 30 }]`; `serving_quantity: '0'` gives none.
  - **No names:** `name` is `''`.

  Then, with a fake `fetchFn`, `lookupOpenFoodFacts('3017624010701', fakeFetch)`:
  - **The fixture** returns `{ kind: 'found' }`. The fake `fetchFn` records the request, so assert:
    - the URL starts with `https://world.openfoodfacts.org/api/v3/product/3017624010701?fields=code,product_name`
    - the `X-User-Agent` header equals `OFF_APP_ID`
  - **404** with `{ status: 'failure', result: { id: 'product_not_found' } }` → `{ kind: 'not-found' }`.
  - **A rejected promise (`TypeError`)** → `{ kind: 'offline' }`.
  - **A 429** → `{ kind: 'error' }`.
  - **Hangs:** a fetch that never resolves, with `timeoutMs` 20 → `{ kind: 'offline' }`, without hanging the test.
  - **Offline phone:** `navigator.onLine` stubbed to false → `{ kind: 'offline' }`, with `fetchFn` not called.

  In `src/scan/resolve.test.ts`:
  - **Saved food:** a food saved with barcode `'3017624010701'` → `{ kind: 'saved', food }`, and `fetchFn` is not called.
  - **Unknown barcode:** delegates to the lookup (fake fetch returns the fixture → `'found'`).
- [ ] **Step 3: Run** `npm test -- openFoodFacts resolve` → Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** `offProductToDraft`, `lookupOpenFoodFacts` and `resolveBarcode`.
  - **Numbers:** a string or number giving a finite value ≥ 0, rounded to 3 decimals; anything else is skipped.
  - **kcal:** `energy-kcal_100g`, else `energy_100g / 4.184`.
  - **salt:** `salt_100g`, else `sodium_100g × 2.5`.
  - **basis:** `'100ml'` when `product_quantity_unit` is ml, cl or l, or `quantity` matches `/\d\s*(ml|cl|l)\b/i`.
  - **Timeout:** `AbortController` plus `setTimeout(timeoutMs, default 8000)`; an abort counts as offline.
  - **Found:** HTTP 200 with a `product` object.
- [ ] **Step 5: Run** `npm test -- openFoodFacts resolve` → Expected: PASS.
- [ ] **Step 6: Commit** `feat: Open Food Facts lookup by barcode, saved foods first`.

---

### Task 3: Camera scanning loop and the bundled reader

**Files:**
- Create: `src/scan/scanner.ts`, `src/scan/scanner.test.ts`
- Modify: `package.json` (`npm i barcode-detector`), `vite.config.ts` (`globPatterns` add `wasm`)

**Interfaces:**
- Consumes: `normalizeBarcode` (Task 1).
- Produces:
  - `class CameraError extends Error { kind: 'denied' | 'unavailable' }`
  - `interface ScanDeps { getUserMedia(c: MediaStreamConstraints): Promise<MediaStream>; detect(video: HTMLVideoElement): Promise<string[]>; intervalMs?: number }`
  - `defaultScanDeps(): ScanDeps`
  - `startScanning(video: HTMLVideoElement, onCode: (code: string) => void, deps?: ScanDeps): Promise<() => void>`. The returned function stops scanning, can be called more than once, and stops every track.

- [ ] **Step 1: Write the failing tests** in `src/scan/scanner.test.ts`. Use fakes:
  - **Stream:** `getTracks()` returns tracks with `stop: vi.fn()`.
  - **Video:** `{ srcObject: null, readyState: 4, play: async () => {}, setAttribute() {} }` cast to `HTMLVideoElement`.
  - **Interval:** `intervalMs: 1`.

  The tests:
  - **Camera request:** asks for `{ video: { facingMode: { ideal: 'environment' } }, audio: false }`.
  - **Reads:** `detect` returns `['nope']`, then `['049000050103', '049000050103']`. `onCode` is called exactly once, with `'0049000050103'`, and every track is stopped.
  - **Stopping:** calling the returned stop before any read stops the tracks, `onCode` never fires, and a second stop call doesn't throw.
  - **Errors:** `getUserMedia` rejecting with `DOMException('x', 'NotAllowedError')` → `CameraError` with `kind: 'denied'`. Rejecting with `DOMException('x', 'NotReadableError')` → `'unavailable'`.
  - **Frame fails:** `detect` throwing on one frame doesn't stop the loop.
- [ ] **Step 2: Run** `npm test -- scanner` → Expected: FAIL (module missing).
- [ ] **Step 3: Implement `startScanning`.**
  - **Video setup:** set `playsinline`, `muted` and `autoplay` on the video, set `srcObject`, then `await play()`.
  - **Loop:** with `setTimeout`, read only when `readyState >= 2`, and skip a tick while a read is still running. The first value that normalizes stops scanning and calls `onCode`.
  - **No camera:** a missing `navigator.mediaDevices` → `'unavailable'`.

  **Implement `defaultScanDeps`:**
  - Use `navigator.mediaDevices.getUserMedia`.
  - **Detector:** a native `globalThis.BarcodeDetector` when it lists `ean_13` in `getSupportedFormats()`. Otherwise use `BarcodeDetector` from `barcode-detector/ponyfill`, after `prepareZXingModule({ overrides: { locateFile: (path, prefix) => path.endsWith('.wasm') ? wasmUrl : prefix + path } })` with `import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'`.
  - Formats: `['ean_13', 'ean_8', 'upc_a', 'upc_e']`. `detect(video)` maps the results to `rawValue`.
  - **Service worker:** add `wasm` to `workbox.globPatterns`.
- [ ] **Step 4: Run** `npm test -- scanner` → Expected: PASS. Then run `npm run build && ls dist/assets | grep zxing_reader && grep -c zxing_reader dist/sw.js` → Expected: a `zxing_reader-*.wasm` file, and a count ≥ 1 (it's precached).
- [ ] **Step 5: Commit** `feat: camera scanning loop with the bundled barcode reader`.

---

### Task 4: Food editor review mode, barcode on new foods, credit

**Files:**
- Modify: `src/ui/screens/FoodEditorScreen.tsx`, `src/data/credits.ts`, `src/ui/screens/SettingsScreen.tsx`, `src/test/render.tsx`
- Test: `src/ui/screens/addfood.test.tsx`, `src/ui/screens/settings.test.tsx`

**Interfaces:**
- Consumes: `FoodDraft` (Task 2).
- Produces:
  - The route `/foods/new?meal=<mealId>&barcode=<code>[&reason=not-found|offline|error]`, with optional router state `{ draft: FoodDraft }`.
  - `renderAt(hash: string, state?: unknown)`: test helper; state is passed as `window.history.replaceState({ usr: state, key: 'test', idx: 0 }, '', hash)`.
  - `OFF_SOURCE` in `src/data/credits.ts`.

- [ ] **Step 1: Write the failing tests** in `src/ui/screens/addfood.test.tsx`.
  - **Opened with a draft** (Nutella from the fixture, via `offProductToDraft`) at `#/foods/new?meal=<id>&barcode=3017624010701`:
    - The heading is "Check the label", and a note contains "From Open Food Facts".
    - Name is `Nutella`, Brand is `Ferrero`, Calories (kcal) is `539`, Fibre (g) is empty, and the text `Barcode 3017624010701` is shown.
    - Save opens the amount screen.
    - The saved food matches `{ source: 'off', barcode: '3017624010701', sourceId: '3017624010701' }`.
    - Backing out instead (link "Back") saves nothing.
  - **`reason=not-found`, no draft:** the heading is "New food", the note contains "isn't in Open Food Facts", and the saved food has `barcode: '3017624010701'` and `source: 'custom'`.
  - **`reason=offline`:** the note contains "couldn't be looked up".

  In `settings.test.tsx`: Settings shows `/Open Food Facts/` and `/ODbL/`.
- [ ] **Step 2: Run** `npm test -- addfood settings` → Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `FoodEditorScreen` reads `useLocation().state?.draft` and the `barcode` and `reason` params. A draft fills the form the way `template` does.
  - **Title:** a draft → "Check the label"; an existing food → "Edit food"; else "New food".
  - **Note** (`role="note"`):
    - a draft → `From Open Food Facts. Anyone can edit it, so check the values against the package.`
    - `not-found` → `This barcode isn't in Open Food Facts. Type the label in once and the next scan will find it.`
    - `offline` or `error` → `This barcode couldn't be looked up right now. Type the label in, or scan it again later.`
  - **Barcode line:** shown whenever a barcode is known.
  - **Save** passes the `barcode` (`existing?.barcode ?? draft?.barcode ?? param`), plus `source: 'off'` and `sourceId` for a draft.
  - Settings shows `OFF_SOURCE` under Food data.
- [ ] **Step 4: Run** `npm test` → Expected: all pass.
- [ ] **Step 5: Commit** `feat: review screen for Open Food Facts products; barcode on new foods; credit`.

---

### Task 5: Scan screen

**Files:**
- Create: `src/ui/screens/ScanScreen.tsx`, `src/ui/screens/scan.test.tsx`
- Modify: `src/App.tsx` (route `/meal/:mealId/scan`), `src/ui/screens/AddFoodScreen.tsx` (a **Scan** link first in a 3-column row with Quick add and New food)

**Interfaces:**
- Consumes: `startScanning`, `CameraError` (Task 3); `resolveBarcode` (Task 2); `normalizeBarcode` (Task 1); the editor route and the state from Task 4.

- [ ] **Step 1: Write the failing tests** in `src/ui/screens/scan.test.tsx`.
  - **Mocking:** `vi.mock('../../scan/scanner', …)` with a `startScanning` whose behaviour each test sets: it calls `onCode` with a given code, or rejects with `new CameraError('denied')`, and returns a `stop` spy. Stub `fetch` with `vi.stubGlobal` where needed.
  - **From the Add food screen:** the `Scan` link opens `#/meal/<id>/scan`.
  - **Saved food:** scanning a saved food's barcode `'3017624010701'` opens its amount screen (Amount pre-filled), and fetch is not called.
  - **New product:** scanning `'3017624010701'` when it isn't saved, with fetch returning the fixture, shows the heading "Check the label" with Name `Nutella`.
  - **Not found** (fetch 404): the heading is "New food" and the text "isn't in Open Food Facts" shows.
  - **Camera refused:** the text `The camera isn't allowed` shows, along with a `Try again` button and the `Barcode` field.
  - **Typed barcode:** typing `' 3017624 010701 '` and tapping `Look up` resolves it like a scan (saved food → amount screen). Typing `3017624010702` shows `Check the number: it should be the 8 or 13 digits under the barcode.` and calls no fetch.
  - **Read twice:** `onCode` called twice with the same code navigates once and starts only one lookup (fetch called once).
  - **Camera stops:**
    - Tapping `Cancel` returns to Add food and has called `stop`.
    - Unmounting while scanning calls `stop`.
    - `document.visibilityState` stubbed to `'hidden'` plus a `visibilitychange` event calls `stop` and shows a `Start camera` button.
- [ ] **Step 2: Run** `npm test -- scan` → Expected: FAIL.
- [ ] **Step 3: Implement `ScanScreen`.**
  - **Layout:** a full-width rear-camera `<video>` with a guide box, `Cancel` back to `/meal/:mealId/add`, and the "Type the barcode" field (`label="Barcode"`, `inputMode="numeric"`) with `Look up`.
  - **States:** scanning; looking up (`Looking up <code>…`); camera refused or unavailable (message plus `Try again`); stopped (`Start camera`).
  - **One code only:** after the first code, a ref ignores any more.
  - **Where each result goes** (all with `replace: true`):
    - `saved` → `/meal/:mealId/add/<food.id>`
    - `found` → `/foods/new?meal=…&barcode=…` with state `{ draft }`
    - otherwise → `/foods/new?meal=…&barcode=…&reason=<kind>`
  - **Unavailable message:** `The camera couldn't start. Type the barcode below, or restart the phone if this keeps happening.`
- [ ] **Step 4: Run** `npm test && npx tsc -b && npm run build` → Expected: all pass, and the build succeeds.
- [ ] **Step 5: Commit** `feat: Scan screen on Add food`.

---

### After the tasks

Push `main`, wait for GitHub Pages to publish, and check the live app in a phone-sized browser:
- Add food shows Scan.
- The Scan screen opens. The browser has no camera, so the screen shows the unavailable message and accepts a typed barcode.
- Typing `3017624010701` reaches "Check the label".

Then the user checks the real camera on the iPhone, including how often "Allow camera?" appears.
