---
name: UXP panel file-head (title + version select) layout
description: Why the file-head uses a flex ROW with min-width:0 title + pinned select, after two earlier layouts broke in UXP.
---

The Premiere panel's `.file-head` holds the filename title + the version `<select>`.
Current layout: a flex **row** — `display:flex; align-items:center; flex-wrap:wrap`,
title `flex:1 1 auto; min-width:0; word-break:break-word`, select `flex:0 0 auto`.

**Why:** the header otherwise reads as a tall, mostly-empty block (user complaint).
Two earlier attempts failed in UXP:
- A naive horizontal row let a long filename wrap and visually overlap the native
  `<select>` (the title had no `min-width:0`, so it pushed/over-rode the select).
- Switching `.file-head` to a flex **column** collapsed it to ~0 height in UXP
  (auto flex-basis on a non-growing column), spilling the select under the player.

**How to apply:** keep it a flex ROW (the column collapse bug is row-vs-column
specific). Always give the growing text child `min-width:0` so it shrinks/wraps in
its own track instead of overlapping siblings, and pin fixed-width controls with
`flex:0 0 auto`. `flex-wrap` lets a very narrow docked panel drop the select to its
own line rather than squashing the title. UXP renders the native `<select>` at its
own intrinsic width — don't assume it honors width constraints.
