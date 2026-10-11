---
name: project-conduct-catalog-isactive-gap
description: Known deferred backend gap — ConductCatalogService.list() hardcodes isActive:true, so hidden items vanish from both the admin screen and every FE label lookup
metadata:
  type: project
---

`ConductCatalogService.list()` (`apps/api/src/conduct-catalog/conduct-catalog.service.ts`) hardcodes
`find({ isActive: true })`. There is no way to list hidden items.

Two downstream consequences any FE review of this area must check:
1. `/danh-muc-vi-pham`'s "Hiện" (unhide) button is correct code but **permanently unreachable** — a hidden
   item never comes back in the list. Same for the "Đã ẩn" badge.
2. Every page that maps `ConductLog.catalogItemId` → label from `GET /conduct-catalog` loses the reason text
   for **historical** logs once an admin hides that catalog item. The FE should fall back to `log.note` rather
   than rendering a bare "—".

**Why:** deliberately deferred out of the Phase 2 UI sub-project (frontend-only scope); tracked separately.
Deferred, not unknown — do not re-raise it as a new backend finding, but do flag any FE that silently papers
over it or that newly makes the hiding path reachable.

**How to apply:** the fix shape is a `status`/`includeInactive` query param on `GET /conduct-catalog`
(admin screen asks for all, the write dialog keeps asking for active only). Related:
[[pattern-frontend-today-timezone]].
