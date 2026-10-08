# Phase 0 — Khởi tạo nền tảng (Sổ Chủ Nhiệm)

Ngày: 2026-10-08
Trạng thái: Approved (chờ review spec trước khi viết implementation plan — đã được người dùng duyệt phạm vi trong chat)

## Bối cảnh & mục tiêu

"Sổ Chủ Nhiệm" là web app (PWA) quản lý lớp học cho giáo viên/học sinh/admin THPT Việt Nam, kiến trúc API-first
(backend NestJS độc lập, web Next.js chỉ gọi REST, để tái sử dụng cho app React Native sau này).

Phase 0 dựng khung kỹ thuật cho toàn bộ dự án: monorepo, hạ tầng DB, schema nền tảng, CI, và layout/theme web.
**Không có nghiệp vụ thật nào được triển khai ở phase này** — các phase 1-7 sẽ lần lượt thêm nghiệp vụ lên trên khung này.

Toàn bộ yêu cầu nghiệp vụ, mô hình dữ liệu đầy đủ, và breakdown 8 phase đã được người dùng cung cấp đầy đủ trong
yêu cầu gốc của dự án (xem lịch sử trò chuyện / sẽ được giữ lại trong `docs/PROJECT_BRIEF.md`). Spec này chỉ
mô tả riêng phần Phase 0.

## Phạm vi Phase 0

1. Monorepo pnpm workspaces: `apps/api`, `apps/web`, `packages/shared`.
2. `docker-compose.yml`: MongoDB 1-node replica set (bắt buộc cho transaction).
3. Schema Mongoose nền tảng: `User, SchoolYear, Semester, Class, Position, Student`.
4. CI cơ bản (GitHub Actions): install → lint → typecheck → build.
5. Layout + theme shadcn/ui cho `apps/web` theo bảng màu Binance-trên-nền-trắng.

Ngoài phạm vi: auth thật, bất kỳ API nghiệp vụ nào, PWA, test nghiệp vụ (vì chưa có nghiệp vụ để test).

## Kiến trúc

### Cấu trúc thư mục

```
teaching_assistant/
├── apps/
│   ├── api/                 # NestJS
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── health/      # GET /health
│   │   │   └── database/    # Mongoose connection module + schemas
│   │   └── test/
│   └── web/                  # Next.js (JavaScript, không TS cho app web theo yêu cầu)
│       ├── app/               # Next.js App Router
│       ├── components/        # shadcn/ui components
│       ├── lib/
│       └── public/
├── packages/
│   └── shared/                # TS build ra JS — zod schemas & hằng số dùng chung
│       └── src/
├── docs/
│   ├── ASSUMPTIONS.md
│   └── superpowers/specs/
├── docker-compose.yml
├── pnpm-workspace.yaml
├── package.json               # root scripts (lint, build, dev)
├── .github/workflows/ci.yml
└── .editorconfig / .eslintrc / .prettierrc
```

### `apps/api` (NestJS)

- Module gốc `AppModule` import `DatabaseModule` (kết nối Mongoose tới Mongo qua `MONGODB_URI` env) và `HealthModule`.
- `HealthModule`: `GET /health` trả `{ status: 'ok', db: 'connected' | 'disconnected' }` — dùng để CI/docker-compose
  xác minh backend lên được và Mongo kết nối ổn.
- Schema Mongoose đặt trong `apps/api/src/database/schemas/`, export qua Mongoose `Schema` + `model`, mỗi schema
  một file (`user.schema.ts`, `school-year.schema.ts`, `semester.schema.ts`, `class.schema.ts`, `position.schema.ts`,
  `student.schema.ts`).
- Index: `Position` có unique compound index theo (`classId`, `type`, `subject`) khi `type=SUBJECT` và theo
  (`classId`, `type`) khi `type=HOMEROOM` — đúng yêu cầu "mỗi vị trí tối đa 1 người giữ theo lớp+môn / lớp+HOMEROOM".
  `Student` có index theo `classId` và `status`.
- Chưa có guard/auth — Phase 1 sẽ thêm.

### `apps/web` (Next.js + Tailwind + shadcn/ui)

- Next.js App Router, JavaScript (không TypeScript, theo đúng tech stack yêu cầu).
- Tailwind cấu hình CSS variables trong `app/globals.css` theo bảng màu:
  - `--brand: #F0B90B` (vàng, nút chính/mục đang chọn), `--brand-hover: #D0980B`
  - `--sidebar-bg: #1E2329`, `--sidebar-fg: #B7BDC6`, `--sidebar-active-fg: #F0B90B`
  - `--border: #EAECEF`, `--fg: #1E2329`, `--fg-muted: #848E9C`
  - `--success: #0ECB81` (có mặt/điểm cộng), `--danger: #F6465D` (vi phạm/vắng)
- shadcn/ui: cài qua CLI, theme map vào các CSS variables trên (không tự tạo biến mới ngoài hệ thống shadcn).
- Font: `next/font` — Inter (thân), IBM Plex Sans (tiêu đề), IBM Plex Mono (số liệu).
- Layout gốc `app/layout.jsx`: sidebar trái cố định trên desktop (thu thành `Sheet`/drawer của shadcn trên mobile),
  6 nhóm mục điều hướng (Tổng quan / Nền tảng / Kế hoạch dạy học / Lớp học hằng ngày / Học tập / Khác) — Phase 0
  chỉ cần placeholder items với icon line (dùng `lucide-react`, không dùng emoji) và route trỏ tới trang
  "Đang phát triển" dùng chung, trừ "Tổng quan" trỏ tới 1 trang dashboard placeholder thật.
- Ô tìm kiếm trong sidebar/header: `<input>` trong `relative` wrapper, icon kính lúp SVG inline tuyệt đối hoá bên
  trái (không dùng icon font/emoji).
- Redux Toolkit: cấu hình store với `authSlice` (state rỗng, chưa có logic — Phase 1 điền) và `apiSlice` (RTK Query,
  `baseUrl` từ `NEXT_PUBLIC_API_URL`, chưa có endpoint thật, chỉ setup `createApi` + tagTypes rỗng để Phase 1 nối vào).
- Không làm PWA (manifest/service worker) ở phase này.

### `packages/shared`

- TypeScript, build bằng `tsc` ra `dist/` (CJS + types), `package.json` với `main`/`types` trỏ `dist`.
- Phase 0: chỉ dựng khung build + 1 hằng số ví dụ (`export const APP_NAME = 'So Chu Nhiem'`) để xác nhận pipeline
  build/publish nội bộ (workspace `"shared": "workspace:*"`) hoạt động. Zod schema nghiệp vụ thật sẽ thêm dần theo
  từng phase khi nghiệp vụ đó được cài.

### Docker Compose

- Service `mongo`: image `mongo:7`, command bật `--replSet rs0`, volume persist data, healthcheck.
- Service `mongo-init`: chạy 1 lần (`depends_on: mongo` với healthcheck condition), gọi
  `mongosh --eval "rs.initiate(...)"`, thoát sau khi xong (không phải long-running service).
- `apps/api` không chạy trong compose ở Phase 0 (dev chạy trực tiếp bằng `pnpm --filter api dev`, chỉ Mongo cần
  container hoá vì cần replica set). Có thể thêm service `api`/`web` vào compose ở phase sau nếu cần.

### CI (GitHub Actions)

- Trigger: `push` và `pull_request` vào `main`.
- Job `build`: setup Node 20 + pnpm (cache), `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r build`.
- Chưa chạy `pnpm -r test` ở Phase 0 (chưa có test nghiệp vụ nào — test suite thật bắt đầu từ Phase 1 với
  mongodb-memory-server replica set).

## Kiểm thử (Phase 0)

- `apps/api`: 1 e2e test nhỏ xác nhận `GET /health` trả 200 (dùng Nest `TestingModule`, không cần Mongo thật —
  mock kết nối hoặc test riêng phần không phụ thuộc DB).
- `apps/web`: không cần Playwright ở Phase 0 (chưa có luồng nghiệp vụ để test theo đúng yêu cầu gốc "Playwright
  cho vài luồng chính" — luồng chính bắt đầu từ Phase 1 đăng nhập).
- Lint: ESLint cấu hình chung cho cả 3 package (có thể khác rule nhẹ giữa TS và JS).

## Rủi ro / điểm cần lưu ý

- Theme/layout web làm theo mô tả chữ, không có demo thật để đối chiếu pixel-perfect (xem `docs/ASSUMPTIONS.md`) —
  có thể cần chỉnh lại khi người dùng cung cấp demo.
- Unique index cho `Position` cần transaction + index đúng mới tránh race condition khi 2 giáo viên nhận vị trí
  cùng lúc — Phase 0 chỉ tạo index, logic nhận vị trí (transaction) sẽ viết ở Phase 1, nhưng index phải đúng từ
  đầu để Phase 1 không phải migrate lại.

## Ngoài phạm vi (để phase sau)

- Toàn bộ nghiệp vụ Phase 1-7 theo đúng breakdown gốc.
- PWA, export Excel/PDF, backup, rate limit, audit log (Phase 7).
- Payment/subscription (Phase 6).
