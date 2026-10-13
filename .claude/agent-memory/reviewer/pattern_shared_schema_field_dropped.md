---
name: pattern-shared-schema-field-dropped
description: A field added to a shared zod update schema is silently dropped when the NestJS service copies fields by hand (SchoolConfigService.update); e2e tests that set the field via model.updateOne mask it
metadata:
  type: project
---

Found at Phase 3 backend review (2026-10-11): `saturdayIsSchoolDay` was added to `updateSchoolConfigSchema`
and to the Mongoose schema, but `SchoolConfigService.update` assigns fields one by one and never got the new
line → `PATCH /school-config {saturdayIsSchoolDay:true}` returns 200 with `false`. The holidays e2e test flips
the flag with `models.schoolConfig.updateOne(...)`, so the suite stayed green.

**Why:** zod validation passing ≠ the write path persisting it; the "configurable" business rule becomes
unreachable through the API.
**How to apply:** when a diff adds a field to any `update*Schema` in `packages/shared`, grep the consuming
service for an explicit field whitelist and require an HTTP-level test (PATCH then GET/effect), not a direct
model write. Related: [[pattern-bulk-json-body-limit]].
