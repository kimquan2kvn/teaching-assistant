---
name: pattern-rtk-data-vs-currentdata-shared-panel
description: FE bug class — a shared component taking an id prop from a selector reads RTK Query `data` (not `currentData`), so after switching it shows the previous id's rows with edit buttons that hit the new id
metadata:
  type: project
---

Found at Phase 3 UI review (2026-10-11): `components/schedule/slot-panel.jsx` calls
`useGetPositionTimetableSlotsQuery(positionId)` and renders `data`. On a subject switch RTK Query keeps `data` of the
OLD arg (`isLoading` stays false, only `isFetching` flips), so the table shows the old subject's slots under the new
label, and Sửa/Xóa send `/positions/<new>/timetable-slots/<oldSlotId>` (backend 404 because `requireSlot` filters by
positionId — no corruption, but wrong data on screen). The PAGE-level PPCT/lich-nam-hoc code used `currentData`
correctly; the shared panel did not, and its tests mocked the hook wholesale (`{ data }`) so they could not see it.

**Why:** pages get reviewed for this; reusable panels embedded in several pages (per-class page + teacher page) slip.
**How to apply:** for every `use*Query(x)` where `x` comes from a select/URL/prop, check `data` vs `currentData`; if
the component is shared, probe with a real store + routed `fetch` whose second response is a pending promise
(scratch test via `jest --roots <scratch> --modulePaths apps/web/node_modules` keeps the worktree untouched).
Related: [[pattern-cross-feature-tag-invalidation]], [[pattern-frontend-today-timezone]].

Second variant (Phase 3 sổ báo giảng, 2026-10-12): RTK 2 default `invalidationBehavior: 'delayed'` holds a finished
mutation's invalidation while ANY other query/mutation is pending. "Keep optimistic value until list isFetching ends"
logic (use-lesson-log-actions.js) therefore drops back to stale data when writes overlap (tick during a move's
recalculation → checkbox un-ticks for seconds). Probe overlapping writes, not just a single write.
