---
name: pattern-shadcn-yellow-primary-and-footer
description: Swapping hand-written primitives for stock shadcn (new-york v3) in this repo silently changes spacing/contrast — check DialogFooter margins, Alert success text, border-primary/ring-ring on yellow
metadata:
  type: feedback
---

Stock shadcn assumes a dark `--primary`; this project's primary is Binance yellow #F0B90B (1.8:1 on white). Found in the
2026-10-13 shadcn migration review (feat/shadcn-migration @ a6b4a19):
- `Checkbox` `border-primary` and every `focus-visible:ring-ring` (no ring-offset) become near-invisible yellow-on-white.
- Alert `success` variant = `text-success` on `bg-success-soft` ≈ 2:1 — the old banner used default dark text.
- Old project `DialogFooter` was `mt-6 flex justify-end gap-2`; stock one has no margin and no gap in mobile column mode,
  so footers inside a `<form>` without `gap-*` butt against the last field/Alert, and phone buttons stack touching.

**Why:** "behaviour and text unchanged" migrations pass all jsdom tests while the visual/a11y contract shifts.
**How to apply:** on any future `shadcn add`/primitive swap, diff old vs new primitive classes (margins, gap, colors,
focus) and grep every consumer whose layout relied on the old defaults; compute contrast for any `*-primary` border/ring.
