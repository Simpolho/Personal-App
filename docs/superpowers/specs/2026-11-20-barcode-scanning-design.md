# Barcode scanning — design (step 2)

Proposed 2026-11-20. Builds on the app design (`2026-11-16-fitness-app-design.md`), build step 2.

## Intent

Log a packaged food as quickly as in Cronometer: scan its barcode instead of searching for it or typing its label.

## Goals

- **Scan** on the Add food screen reads a barcode with the camera.
- A product logged or saved before goes straight to its amount screen, with the amount used last time.
- A new product is looked up in Open Food Facts and shown for checking before it's saved. Saving opens its amount screen; from then on, a scan finds it on the phone.
- Not found, or no connection: New food opens with the barcode attached; once saved, scanning finds it.
- Products already saved can be scanned offline.

## Non-goals

- Adding or correcting products in Open Food Facts.
- Searching Open Food Facts by name (barcode only, as the main design says).
- Reading the nutrition table from a photo (that's step 7).
- A Scan button anywhere other than the Add food screen.

## Anti-goals (would make it a failure even if it works)

- A value from Open Food Facts saved without the user having seen it.
- Scanning a product logged before taking more taps than searching for it.
- The camera staying on after leaving the scanner.

## Constraints

- Safari on iPhone has no built-in barcode reader (the API exists but is switched off by default), so the app carries its own.
- In Home Screen apps, iOS forgets the camera permission when the app changes screen, so it will probably ask "Allow camera?" on each scan. Accepted (approach 1 below).
- The camera needs HTTPS (GitHub Pages provides it) and the rear camera.
- Open Food Facts: free; reading a product needs no account; at most 15 product lookups a minute per connection; asks apps to identify themselves; API v3 is the current one (v2 is deprecated); it allows calls from web pages (checked: `Access-Control-Allow-Origin: *`); data is under the ODbL licence and needs a credit; values are user-contributed with no guarantee. It also asks API users to fill in a usage form, which only the user can do (optional).

## Approaches

| Approach | Camera prompts | Cost | Verdict |
|---|---|---|---|
| 1. Live camera, accept the prompt | Probably one "Allow" per scan | Only the scanner is new | **Chosen.** Cheapest; the real behaviour gets checked on the phone first |
| 2. Live camera, screens change without changing the app's address | Probably one "Allow" each time the app is opened | Reworks navigation across the whole app; the app always reopens on Today | Later, if approach 1's prompts are annoying. The scanner, lookup and review screen stay the same |
| 3. Take a photo of the barcode | None | Shutter + "Use Photo" on every scan; a blurry photo means taking it again | Rejected by the user |

## Decided with the user

- Approach 1.
- From the main design: Open Food Facts by barcode only; a review screen before saving; only foods actually used are saved.

## Builder's calls (Claude's proposals, open to correction)

- **Reader:** the `barcode-detector` package (MIT; ZXing compiled to WebAssembly), reader-only build, about 0.95 MB. It's served by the app itself and kept for offline use, never fetched from a CDN. A browser's own reader is used where one exists. Formats: EAN-13, EAN-8, UPC-A, UPC-E.
- **Scanner screen:** full-screen rear camera with a guide box and Cancel. A **Type the barcode** option covers a camera that won't start or a barcode that won't read. The camera stops when the screen closes or the app goes to the background. If camera access is refused, the screen says how to allow it and offers typing the barcode.
- **Barcodes are compared in one form:** digits only, UPC-A padded to 13 digits, so the same product matches whichever way it was read.
- **Lookup order:** saved foods with that barcode (the most recently changed, if more than one), then Open Food Facts.
- **Open Food Facts call:** `GET https://world.openfoodfacts.org/api/v3/product/{code}` asking only for the fields used. The app identifies itself with an `X-User-Agent` header, which their server accepts from web pages; no personal email is sent. It gives up after about 8 seconds.
- **Mapping:**
  - **Name:** the Portuguese name if there is one, otherwise the default name.
  - **Brand:** the first listed brand.
  - **Values:** per 100 g from the `*_100g` fields (energy-kcal, proteins, carbohydrates, fat, fiber, sugars, saturated-fat, salt).
  - **Drinks:** per 100 ml when the product's quantity is in ml, cl or l.
  - **Serving:** one serving when the product states its size in grams or ml.
  - **Missing values** stay blank, never 0.
- **Review screen:** the existing food editor, pre-filled, titled "Check the label", with a note that the values come from Open Food Facts and should be checked against the package. Save stores the food (source `off`, the barcode, and Open Food Facts' code as `sourceId`) and opens its amount screen. Backing out saves nothing. Calories are still required, so a product listed without them asks for them.
- **New food from a scan** carries the barcode and shows it on the editor.
- **Credit:** Settings → Food data gets an Open Food Facts line (ODbL).
- **Tests:**
  - Barcode normalising, the Open Food Facts → food mapping (from saved sample responses), lookup order, and the scan → review → amount and scan → amount flows, with a stand-in for the camera.
  - The camera itself can only be checked on the phone.

## Left to the builder

Scanner layout details, how often frames are read, file layout.

## Risks

- The "Allow camera?" prompt may come on every scan (accepted; approach 2 if it annoys).
- Some iPhones occasionally fail to start the camera in Home Screen apps until restarted (a known WebKit bug). Typing the barcode covers that.
- Open Food Facts doesn't have every Portuguese product, and its values can be wrong. The review screen handles both.
- The app grows by about 1 MB, downloaded once and kept for offline use.
