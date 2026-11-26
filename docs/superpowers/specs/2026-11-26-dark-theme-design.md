# Dark theme — design

Proposed 2026-11-26. This is a small change across the whole app, done before step 5 part 2.

## Intent

The app is mostly white with green accents. The user wants it **always dark**: a gray base with a **blue** accent. He chose blue from four mockups (green, blue, amber, violet) on the same gray base. The colours change and nothing else does: layout, sizes, copy and behaviour stay as they are.

## Goals

- **Every screen is dark**, including dialogs, the bottom bars and the settings forms.
- **Blue** marks what you act on and what fills up:
  - primary buttons
  - progress bars
  - a ticked set's ✓
  - the selected RPE
  - focus rings
  - checkboxes
  - links
  - the weight chart's average line
- **Colours that carry meaning keep it:**
  - amber for warnings and over-target bars
  - red for delete, errors and ▼ in the recap
  - green only for "better" and "saved" (▲ in the recap, "Saved" messages)
- **iPhone parts match:**
  - the strip behind the clock (status bar) and the colour shown while the app opens are dark
  - native controls (date pickers, selects, keyboard) use their dark look, via `color-scheme: dark`
- **Text is readable:**
  - body text at least 7:1 against cards
  - muted text at least 4.5:1
  - text on blue buttons at least 4.5:1, so it's near-black on blue, as in the chosen mockup

## Non-goals

- A light mode, or following the iPhone's Light/Dark setting (the user chose always dark).
- A theme switch in Settings.
- Changing layout, spacing, copy or behaviour.
- The camera screen. It's already black, with white text over the video.

## Approaches

| Approach | Verdict |
|---|---|
| **Named theme colours**, defined once in the stylesheet (page, card, raised, border, text, muted, accent, on-accent, warning, danger, success) and used by every screen | **Chosen**: one place to tweak, and names that say what they mean |
| Redefine Tailwind's white, grays and emerald as dark and blue | Rejected: the code would say "white" and "green" where it means dark and blue, and true white on the camera view needs exceptions |
| Replace each colour by hand with dark values | Rejected: the next tweak means hunting through every file again |

## The palette (Claude's calls from the chosen mockup)

| Role | Colour |
|---|---|
| Page | `#18181b` |
| Card | `#27272a` |
| Raised: secondary buttons, inputs, empty bar tracks | `#3f3f46` |
| Border, hairlines | `#3f3f46`, stronger `#52525b` |
| Text | `#f4f4f5` |
| Muted text | `#a1a1aa` |
| Faint: placeholders, chart dots | `#71717a` |
| Accent (blue) | `#3b82f6`, with lighter `#60a5fa` for text, lines and links on dark |
| Text on accent | `#09090b` |
| Warning | text `#fbbf24` on an amber tint |
| Danger | text `#f87171` on a red tint |
| Success | text `#4ade80` |

**Finish / Done buttons**, which are dark today so they aren't mistaken for the green action buttons, become **light**: `#f4f4f5` with dark text. That keeps them distinct from the blue action buttons.

**iPhone details:**
- `theme-color` and the manifest's `theme_color` and `background_color` become `#18181b`.
- `apple-mobile-web-app-status-bar-style` is set to `black`, so the clock shows white on dark.

**App icon:** a new icon file, dark gray with blue bars, goes in the app. iPhone only picks up a new Home Screen icon when the app is added to the Home Screen again, and deleting the old icon deletes its data. So the current green icon stays until the user chooses to reinstall (Export first, then Import into the new one), or forever.

## Left to the builder

- The exact token names, and how each screen's colours map onto them.
- The tints used for warning and danger backgrounds.
- Fine-tuning for contrast, within the palette above.
