---
name: pattern-cross-feature-tag-invalidation
description: New per-user aggregate RTK tags (e.g. Phase 3 'TeacherWeek') are not invalidated by older Phase 1 mutations that change which positions the user holds (join/release), so a cached week survives up to keepUnusedDataFor=60s
metadata:
  type: project
---

Found at Phase 3 UI review (2026-10-11): `GET /timetable/me` and `GET /lesson-logs/week` (tag `'TeacherWeek'`) depend
on the positions the teacher holds, but `positions-api.js` `joinPosition`/`releasePosition` only invalidate
`MyPositions` + `ClassDetail`. Probe: subscribe week → unmount → `joinPosition` → remount ⇒ 1 fetch total, old data.
Onboarding path: `/thoi-khoa-bieu` empty state links to `/lop-hoc/tham-gia`; returning within 60 s shows the stale
empty grid + "Tuần này chưa có tiết nào" while the "Khai báo tiết" panel (fed by MyPositions) shows inherited slots.

RTK detail that matters: invalidating a tag whose cache entry has NO subscribers removes the entry (fresh fetch on
next mount), so adding the tag to the old mutation is sufficient — no refetch cost while away.
**Why:** each sub-project only checks invalidation between its own slices (phase3-cache.test.js covers 4 Phase 3
slices, not Phase 1 mutations).
**How to apply:** when a diff adds a tag for data derived from "who holds what" (positions, class membership,
subscriptions), grep every mutation that changes that membership and check its `invalidatesTags`.
Related: [[pattern-rtk-data-vs-currentdata-shared-panel]].
