---
name: pattern-frontend-today-timezone
description: Recurring FE bug class in apps/web — "hôm nay" built from new Date().toISOString().slice(0,10) is yesterday in Vietnam between 00:00 and 07:00 local
metadata:
  type: project
---

Recurring defect class in `apps/web`: deriving the default `yyyy-mm-dd` for a date picker with
`new Date().toISOString().slice(0, 10)`. That is a **UTC** calendar date; Vietnam is UTC+7, so every day
between 00:00 and 07:00 local it returns **yesterday**. Vietnamese high-school homeroom attendance happens
inside that window (~06:45), so the attendance form defaults to the wrong day and writes wrong-day records.
On a Monday morning it also pushes the backend's `getIsoWeekStartVN` into the **previous** ISO week.

The correct form (already used in `apps/web/app/(app)/lop-hoc/[classId]/xep-loai/page.jsx`) reads local parts:
`now.getFullYear()` + `getMonth()+1` + `getDate()`, zero-padded.

**Why:** `apps/api/src/common/utils/date.ts` states the contract explicitly — a `yyyy-mm-dd` string from the
user is an unambiguous calendar date and must NOT be timezone-converted; only server "now" timestamps go
through `getIsoWeekStartVN`. So the FE must send the user's *local* calendar date.
Date **arithmetic** on an existing `yyyy-mm-dd` string (shift ±1 day) via `Date.UTC`/`setUTCDate` is correct
and should stay — only the initial "today" seed is the bug.

**How to apply:** on any review touching a new date picker in `apps/web`, grep the file for
`toISOString().slice(0, 10)` applied to `new Date()` with no argument. Found in this state at review time:
`lop-hoc/[classId]/diem-danh/page.jsx`, `lop-hoc/[classId]/bang-dieu-khien/page.jsx`, and (pre-existing,
sub-project 2) `components/students/transfer-dialog.jsx`. The fix belongs in `apps/web/lib/utils.js` as one
shared helper so parallel agents cannot each reinvent it differently — which is exactly how this split
happened. Related: [[project-conduct-catalog-isactive-gap]].
