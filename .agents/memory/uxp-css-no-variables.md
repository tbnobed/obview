---
name: UXP panel CSS — no custom properties
description: Why the Premiere UXP panel stylesheet must avoid var(--x) and what symptoms its silent failure produces.
---

# UXP CSS does not reliably resolve CSS custom properties

In `obviu-premiere-panel/styles.css` (the Adobe Premiere UXP panel), do NOT use
CSS custom properties (`var(--foo)`). UXP's CSS engine silently ignores them.

**Why:** A `var()`-based stylesheet renders with every property that referenced a
variable dropped. Symptoms seen in the panel: buttons stuck at UXP's default
(large) size no matter what `min-height`/`height` value the variable held, and
the primary button showing grey instead of blue because `background: var(--accent)`
never resolved. Editing the variable's value changed nothing on screen — the
tell that the property is being thrown out, not mis-set.

**How to apply:** Use literal values (hex colours, px sizes) directly in every
rule. Also prefer explicit `height` + `line-height` on buttons rather than only
`min-height`. The panel is only verifiable inside Premiere, so a wrong
assumption here costs a full user round-trip.

**Native form controls look bad too:** `<input type="checkbox">` / `type="radio"`
render with ugly default UXP chrome that can't be CSS-restyled (no reliable
`appearance: none`, no `::before`/`::after` on inputs — same root cause as the
`<button>` chrome problem). Fix = built-in Spectrum widgets `<sp-checkbox>` and
`<sp-radio>`/`<sp-radio-group>` (available in Premiere UXP without imports). They
still expose `.checked`, so existing JS reads keep working; `sp-radio-group` also
exposes `.selected` (the radio's `value`). When resetting a group programmatically
set the group's `.selected` AND each radio's `.checked`, since setting one radio's
`.checked` directly may not propagate to siblings.

**Text inputs clip glyphs at the top:** UXP does NOT reliably vertically-center
single-line `<input>`/`<select>` text via top/bottom padding — the top of the
glyphs gets cropped. Fix: give single-line fields an explicit `height` + matching
`line-height` (e.g. `height: 34px; line-height: 32px; padding: 0 10px;`) so
line-height does the centering; keep vertical padding at 0. `textarea` is the
exception — it needs real vertical padding + `line-height: 1.4` + `min-height`.

**Action-button width:** The user wants the `.actions` button row to fill the
full panel width with spacing between buttons — use `flex: 1 1 0` so they share
width equally, and let labels wrap (`white-space: normal`,
`height: auto`/`min-height`) so the longest label ("Pull comments to markers")
doesn't clip. (Earlier guidance to keep them `flex: 0 0 auto`/content-width was
explicitly overridden by the user.)

**Flex `gap` is IGNORED by UXP.** Setting `gap` on a flex container does nothing
on screen (same silent-drop behaviour as `var()`). To space flex children, use
margins on the items instead — e.g. `.actions .btn + .btn { margin-left: 12px; }`.
Symptom: bumping the `gap` value changes nothing between buttons no matter how
large.
