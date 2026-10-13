---
name: pattern-bulk-json-body-limit
description: apps/api has Nest's default 100kb JSON body limit and MongoExceptionFilter turns body-parser's 413 into a generic Vietnamese 500 — any bulk JSON endpoint (import commit) breaks silently
metadata:
  type: project
---

`apps/api/src/main.ts` calls `NestFactory.create(AppModule)` with no body-size config → express json limit
100kb. body-parser's `PayloadTooLargeError` is not an `HttpException`, so `MongoExceptionFilter` falls through
to `500 "Đã có lỗi xảy ra, vui lòng thử lại sau"`. Verified 2026-10-11: PPCT `import/commit` with 500 short
rows (~139KB) → 500, although zod allows 500 rows × 1000-char requirement.

The e2e test apps (`apps/api/test/phase3-test-app.ts` etc.) build their own Nest app and do NOT share main.ts
setup, so a fix placed only in main.ts is untested — needs a shared `configureApp(app)`.

**Why:** preview→commit is the main import flow; a full-year PPCT with real "Yêu cầu cần đạt" text is ~100KB+.
**How to apply:** whenever a review adds an endpoint whose zod schema accepts arrays (rows, bulk create), compute
max payload = max rows × max field lengths and compare with 100kb; also check multer errors (`File too large`)
which surface in English. Related: [[pattern-shared-schema-field-dropped]].
