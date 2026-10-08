# Sổ Chủ Nhiệm

Web app (PWA) quản lý lớp học cho giáo viên/học sinh THPT Việt Nam. Xem bối cảnh nghiệp vụ đầy đủ ở
[docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) và tiến độ từng phase ở [docs/superpowers/specs](docs/superpowers/specs).

## Yêu cầu môi trường

- Node.js 20 (`nvm use 20` — xem `.nvmrc`)
- pnpm qua corepack (`corepack enable`)
- Docker (cho MongoDB replica set)

## Cài đặt

```bash
nvm use 20
corepack enable
pnpm install
```

## Biến môi trường (`apps/api`)

Sao chép `apps/api/.env.example` thành `apps/api/.env` và điền giá trị. Ở dev, các giá trị mặc định trong
`.env.example` đã đủ để chạy ngay. Khi `NODE_ENV=production`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` **bắt
buộc** phải được set (ứng dụng throw lỗi lúc khởi động nếu thiếu) — không bao giờ dùng giá trị mẫu trong
`.env.example` ở production.

| Biến | Bắt buộc khi | Mô tả |
|---|---|---|
| `MONGODB_URI` | luôn | Phải trỏ tới replica set (bắt buộc cho transaction) |
| `PORT` | không | Mặc định `3001` |
| `CORS_ORIGINS` | không | Danh sách origin cho phép, cách nhau bởi dấu phẩy |
| `JWT_ACCESS_SECRET` | `NODE_ENV=production` | Bí mật ký access token |
| `JWT_REFRESH_SECRET` | `NODE_ENV=production` | Bí mật ký refresh token (phải khác `JWT_ACCESS_SECRET`) |

## Chạy MongoDB (replica set 1 node)

```bash
docker compose up -d mongo mongo-init
```

## Chạy dev

```bash
pnpm run dev:api   # http://localhost:3001
pnpm run dev:web   # http://localhost:3000
```

## Seed dữ liệu dev (admin + giáo viên mẫu + 1 lớp)

```bash
pnpm --filter api run seed
```

Chỉ chạy ở môi trường dev — script sẽ **xoá sạch** dữ liệu `User`/`SchoolYear`/`Class`/`Position` hiện có
trước khi tạo lại. Sau khi chạy, xem console để lấy username/mật khẩu và mã lớp vừa tạo.

## Kiểm thử

```bash
pnpm run lint
pnpm run build
pnpm run test
```
