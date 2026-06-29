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

**A non-growing flex COLUMN collapses to ~0 height in UXP.** When a container is
a flex item that does NOT grow (no `flex-grow`, i.e. auto/`0 0 auto` basis) AND
is itself `display:flex; flex-direction:column`, UXP gives it ~0 main-size, so
its children overflow and get painted over by whatever native layer (e.g. the
`<webview>` player) sits below. This bit `.file-head` (version `<select>` spilled
under the player) and `.actions` (the second button row overlapped the first).
Fix: stack with plain `display:block` (sizes to content naturally); only keep
the inner button *pairs* as flex ROWS. A flex column that DOES grow
(`flex:1 1 auto` like `.tab-body`) is fine — flex-grow gives it a real height.
Same family as the known `<webview>` collapse (needs explicit `flex:0 0 320px`,
not auto basis). To keep a short/resized panel from clipping the controls below
the player, give the `<webview>` an explicit basis WITH a shrink factor
(`flex:0 1 320px` + a small `min-height`) so it yields height on a small panel
instead of pushing the buttons/composer off the bottom.

**A bottom input must be a pinned sibling, not nested in the scroll/flex body.**
To keep the comment composer (and its Comment button) visible on a short/docked
panel, the file view is one `flex:1 1 auto; min-height:0; overflow-y:auto`
scroll region (player → actions → tabs → comment list) with the composer as a
separate `flex:0 0 auto` sibling pinned below it. **Why:** when the input lived
inside the flexing tab body, a short panel shrank that body below the input's
height and the input overflowed past the view's `overflow:hidden` edge and got
clipped. **How to apply:** put scrollable content in ONE flex:1 scroll child and
make any always-visible footer/input a flex:0 0 sibling of the view — never the
last child of the shrinking scroll region.

**Action-button layout:** Five buttons in one `flex:1 1 0` row squish and
2-line-wrap on a real (narrow) Premiere panel. Current layout groups them:
Import full-width (`.btn.full`), then an Approve/Request `.action-row`, then a
Pull-markers/Copy-link `.action-row`. `.actions` is `display:block`; each
`.action-row` is `display:flex` with `flex:1 1 0` buttons + `margin-left` gaps.

**Flex `gap` is IGNORED by UXP.** Setting `gap` on a flex container does nothing
on screen (same silent-drop behaviour as `var()`). To space flex children, use
margins on the items instead — e.g. `.actions .btn + .btn { margin-left: 12px; }`
or `.list > * + * { margin-top: 6px; }` for stacked columns. Symptom: bumping the
`gap` value changes nothing no matter how large. This bit the comment list, the
Reply/Resolve action links (rendered as "ReplyResolve"), the `.card` sections,
and the reply box — all relied on `gap`.

**`height: 100%` doesn't resolve down the html→body chain.** Use `100vh`. With
`html, body { height: 100% }` the body had no definite pixel height, so a nested
`flex:1; min-height:0; overflow-y:auto` scroll region never got a bounded height —
the whole panel overflowed and the last list item was clipped at the panel edge
instead of scrolling. `html, body { height: 100vh }` ties body to the panel's
real height so the inner scroll region works.
