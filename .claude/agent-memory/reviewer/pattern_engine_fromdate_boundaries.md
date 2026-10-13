---
name: pattern-engine-fromdate-boundaries
description: Lesson-schedule engine (Phase 3) review heuristic — always probe a recalc whose fromDate falls INSIDE a multi-period PPCT item, and mid-year first-placement order (TKB-first vs PPCT-first)
metadata:
  type: project
---

`apps/api/src/lesson-logs/engine/lesson-schedule.ts` + `lesson-log-engine.service.ts` recalc "from fromDate".
Two boundary classes found at the Phase 3 backend final review (2026-10-11), both missed by the plan's own
≥19 engine scenarios because every scenario recalculated from the start of the year:

1. **Straddle**: a kept log with `date < fromDate` and `periodCount > 1` still needs cells `>= fromDate`, but
   `computeLessonSchedule` only reserves kept logs with `date >= fromDate`. A PPCT title edit (fromDate = today)
   or a holiday on the 2nd period silently moves the next lesson onto the 2-period lesson's 2nd period.
   Probe: items `[1, 2(periodCount 2), 3]`, Mon+Thu slots, recalc from a day between the item's two cells.
2. **First placement**: `recalculateWithDefaultFrom` uses year start only when the position has NO logs, so
   TKB-first + PPCT typed one item at a time mid-year puts item 1 in the past and items 2..N from today
   (permanent hole). The app launches mid-school-year (2026-10), so this is the real onboarding path.

**Why:** the engine is the brief's most-tested core rule; results must not depend on which fromDate a write
happened to use (recalc from year start vs from today must agree for the past-consistent state).
**How to apply:** on any later engine change, write a scratch test comparing "recalc from year start" with
"recalc from a mid-span fromDate" on the same state — they must produce identical dates. Related:
[[pattern-frontend-today-timezone]].
