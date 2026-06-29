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
`min-height`, and don't rely on flex-grow to size action buttons (full-width
stretched buttons read as "huge" in a narrow dock — use `flex: 0 0 auto` so they
size to their label). The panel is only verifiable inside Premiere, so a wrong
assumption here costs a full user round-trip.
