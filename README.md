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
