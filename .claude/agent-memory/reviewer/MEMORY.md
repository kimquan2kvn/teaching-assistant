# Memory Index

- [FE "today" timezone bug class](pattern_frontend_today_timezone.md) — `toISOString().slice(0,10)` yields *yesterday* in Vietnam before 07:00; grep every new date picker.
- [Conduct catalog isActive gap](project_conduct_catalog_isactive_gap.md) — BE `list()` hardcodes `isActive:true`; unhide is unreachable and hidden items break label lookups. Deferred, don't re-raise.
