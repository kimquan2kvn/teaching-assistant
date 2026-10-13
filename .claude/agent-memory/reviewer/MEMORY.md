# Memory Index

- [FE "today" timezone bug class](pattern_frontend_today_timezone.md) — `toISOString().slice(0,10)` yields *yesterday* in Vietnam before 07:00; grep every new date picker.
- [Conduct catalog isActive gap](project_conduct_catalog_isactive_gap.md) — BE `list()` hardcodes `isActive:true`; unhide is unreachable and hidden items break label lookups. Deferred, don't re-raise.
- [Engine fromDate boundaries](pattern_engine_fromdate_boundaries.md) — probe recalc with fromDate inside a multi-period item, and TKB-first vs PPCT-first mid-year.
- [Bulk JSON body limit](pattern_bulk_json_body_limit.md) — Nest default 100kb + filter turns 413 into generic 500; test apps don't share main.ts.
- [Shared schema field dropped](pattern_shared_schema_field_dropped.md) — new update-schema field ignored by hand-whitelisting service; DB-direct tests mask it.
- [RTK data vs currentData in shared panels](pattern_rtk_data_vs_currentdata_shared_panel.md) — stale rows after id switch; also delayed invalidation defeats "pending until refetch" when writes overlap.
- [Cross-feature tag invalidation](pattern_cross_feature_tag_invalidation.md) — 'TeacherWeek' not invalidated by join/release; grep membership-changing mutations for new aggregate tags.
- [Integration branch moves mid-review](project_integration_branch_moves_mid_review.md) — orchestrator merges into the shared worktree during review; pin and report the reviewed SHA.
