# Nền tảng Frontend — Đăng nhập/Đăng ký, Route bảo vệ, Kết nối API thật

Ngày: 2026-10-08
Trạng thái: Approved (người dùng duyệt thiết kế trong chat trước khi viết plan)

## Bối cảnh & mục tiêu

Đây là sub-project đầu tiên trong 5 sub-project được quyết định khi lên kế hoạch "Phase 3" (xem
`docs/superpowers/specs/2026-10-08-phase2-attendance-conduct-design.md` cho bối cảnh backend Phase 2; Phase 3
gốc theo yêu cầu đầu dự án gồm lịch năm học/PPCT/TKB/engine khớp tiết/sổ báo giảng). Khi brainstorm, phát hiện
`apps/web` hiện tại (từ Phase 0) chỉ có khung layout/sidebar/theme — **không có đăng nhập thật, không có route
nào được bảo vệ, RTK Query đã dựng khung nhưng chưa có endpoint nào** (`apps/web/lib/store/api-slice.js`:
`endpoints: () => ({})`). Người dùng quyết định: thay vì chỉ làm UI cho 3 tính năng mới của Phase 3, sẽ làm lại
toàn bộ frontend theo đúng trình tự — bắt đầu từ nền tảng này, rồi lần lượt UI cho Phase 1, Phase 2, rồi mới
tới backend + UI của Phase 3 gốc. 5 sub-project, mỗi cái có spec/plan/code riêng:

1. **Nền tảng frontend** (spec này) — đăng nhập/đăng ký, giữ phiên đăng nhập, route bảo vệ, kết nối API thật.
2. UI cho Phase 1 (lớp, vị trí, học sinh, quản lý giáo viên).
3. UI cho Phase 2 (điểm danh, vi phạm/điểm cộng, xếp loại rèn luyện, chép phạt, dashboard).
4. Backend Phase 3 gốc (lịch năm học, PPCT, TKB, engine khớp tiết, sổ báo giảng).
5. UI cho Phase 3 gốc.

Spec này **chỉ** phạm vi sub-project 1.

## Phạm vi

1. **Đăng nhập** (`/dang-nhap`): form username/password, gọi `POST /auth/login`. Thành công → lưu
   `accessToken`/`user` vào Redux, điều hướng `/`. Sai → hiển thị đúng message backend trả (vd "Sai tên đăng
   nhập hoặc mật khẩu"), không tự dịch/đổi chữ.
2. **Đăng ký** (`/dang-ky`): form username/password/fullName, gọi `POST /auth/register`. Backend coi đăng ký
   thành công tương đương đăng nhập luôn (trả sẵn `accessToken`) — sau khi đăng ký xong điều hướng thẳng `/`,
   không bắt đăng nhập lại lần nữa.
3. **Giữ phiên qua reload**: lúc app khởi động (`Providers`), gọi thử `POST /auth/refresh` một lần (cookie
   `refresh_token` tự động gửi kèm nếu tồn tại). **Lưu ý**: `/auth/refresh` chỉ trả về token, KHÔNG trả `user`
   (`AuthService.refresh()` trả `Omit<AuthResult, 'user'>`) — refresh thành công thì gọi tiếp `GET /auth/me`
   (kèm `accessToken` vừa nhận) để lấy lại thông tin `user`, rồi mới `setCredentials({user, accessToken})`. Cho
   phép F5 không bị văng về trang đăng nhập trong lúc cookie còn hạn (30 ngày).
4. **Tự động refresh khi access token hết hạn giữa chừng** (15 phút): mọi request RTK Query gặp `401` tự gọi
   `/auth/refresh` đúng 1 lần, thử lại request gốc nếu refresh thành công; nếu refresh cũng thất bại thì xoá
   Redux state + điều hướng `/dang-nhap`.
5. **Đăng xuất**: nút ở header, gọi `POST /auth/logout` (thu hồi refresh token ở server + xoá cookie), xoá
   Redux state, điều hướng `/dang-nhap`.
6. **Route bảo vệ**: `middleware.js` ở edge — mọi route trừ danh sách công khai (`/dang-nhap`, `/dang-ky`) yêu
   cầu có cookie `refresh_token`; thiếu thì redirect `/dang-nhap`. Đây chỉ là chặn nhanh ở edge (không đọc được
   access token hết hạn hay chưa, vì access token không nằm trong cookie) — xác thực thật sự vẫn do luồng
   refresh-khi-401 ở mục 4 đảm nhiệm.
7. **Sidebar lọc theo role**: `nav-data.js` mỗi mục có thêm field `roles?: string[]` tuỳ chọn; `Sidebar` ẩn mục
   nào có `roles` mà không chứa role của user hiện tại (lấy từ Redux). Hiện chưa có mục nào cần giới hạn
   role — cơ chế này chuẩn bị sẵn cho sub-project 2 (vd mục "Quản lý giáo viên" chỉ ADMIN thấy).

Ngoài phạm vi (để sau): `mustChangePassword` (ép đổi mật khẩu lần đầu — chỉ áp dụng luồng tài khoản học sinh do
GVCN tạo sẵn mật khẩu tạm, thuộc Phase 5, giáo viên tự đăng ký chọn mật khẩu riêng nên không cần); màn hình đổi
mật khẩu chủ động (`POST /auth/change-password` đã có ở backend, chưa cần UI ngay); bất kỳ trang tính năng nào
khác ngoài khung đăng nhập/đăng xuất (thuộc sub-project 2-5).

## Kiến trúc & thành phần

### `apps/web/lib/store/api-slice.js` (sửa)

Thêm endpoint thật đầu tiên qua `apiSlice.injectEndpoints`:
- `login: builder.mutation({ query: (body) => ({ url: '/auth/login', method: 'POST', body }) })`
- `register: builder.mutation({ url: '/auth/register', method: 'POST' })`
- `refresh: builder.mutation({ url: '/auth/refresh', method: 'POST' })` (response chỉ có token, không có `user`)
- `me: builder.query({ url: '/auth/me' })` (lấy thông tin `user` — dùng ngay sau khi `refresh` thành công lúc
  khôi phục phiên, vì `refresh` không trả `user`)
- `logout: builder.mutation({ url: '/auth/logout', method: 'POST' })`

`fetchBaseQuery` thêm `credentials: 'include'` (bắt buộc để trình duyệt gửi/nhận cookie `refresh_token` cross-origin
dev — web chạy `:3000`, api chạy `:3001`) và interceptor `prepareHeaders` gắn `Authorization: Bearer
<accessToken>` từ Redux state nếu có.

Bọc `baseQuery` gốc bằng `baseQueryWithReauth`: nếu response lỗi `401`, gọi `refresh` mutation 1 lần (dùng 1 cờ
khoá để nhiều request 401 cùng lúc chỉ trigger refresh 1 lần, không gọi `/auth/refresh` nhiều lần song song),
thành công thì `dispatch(setCredentials(...))` rồi thử lại request gốc; thất bại thì
`dispatch(clearCredentials())` và điều hướng `/dang-nhap` (dùng `window.location.href` vì đây không phải React
component, không dùng được `useRouter`).

### `apps/web/lib/store/auth-slice.js` (sửa)

Thêm 2 reducer: `setCredentials(state, {payload: {user, accessToken}})`, `clearCredentials(state)` (reset về
`initialState`). Export 2 action creator này + 1 selector `selectCurrentUser`.

### `apps/web/app/dang-nhap/page.jsx`, `apps/web/app/dang-ky/page.jsx` (mới)

Form dùng `components/ui/input.jsx`/`button.jsx` đã có. Submit gọi mutation tương ứng, lỗi hiển thị
`error.data.message` (nguyên văn tiếng Việt từ backend) dưới form. Thành công → `router.push('/')`.

### `apps/web/middleware.js` (mới)

```js
export function middleware(request) {
  const hasSession = request.cookies.has('refresh_token');
  const isPublicPath = ['/dang-nhap', '/dang-ky'].includes(request.nextUrl.pathname);
  if (!hasSession && !isPublicPath) {
    return NextResponse.redirect(new URL('/dang-nhap', request.url));
  }
}
export const config = { matcher: ['/((?!_next|favicon.ico).*)'] };
```

### `apps/web/components/providers.jsx` (sửa)

Thêm 1 `useEffect` (client component, đã có `'use client'`): dispatch `refresh` mutation 1 lần lúc mount; không
chặn render (children vẫn hiển thị ngay, tự cập nhật lại khi refresh xong — tránh màn hình trắng chờ).

### `apps/web/components/layout/nav-data.js`, `sidebar.jsx` (sửa)

Thêm field `roles?` vào từng item (hiện để trống/không set = mọi role thấy). `Sidebar` nhận thêm
`currentUserRole` (đọc từ `useSelector(selectCurrentUser)?.role`), lọc `NAV_GROUPS` trước khi render.

### Header — nút đăng xuất (sửa layout hiện có)

Thêm vào khu vực header cạnh `SearchBox`: hiển thị `fullName` của user hiện tại + nút "Đăng xuất" gọi `logout`
mutation rồi điều hướng `/dang-nhap`.

## Kiểm thử

- `auth-slice`: `setCredentials` lưu đúng user/token; `clearCredentials` reset về initial.
- `api-slice` (`baseQueryWithReauth`): mock fetch trả 401 → gọi refresh → refresh thành công → thử lại request
  gốc thành công; refresh thất bại → dispatch `clearCredentials`. 2 request 401 cùng lúc chỉ gọi `/auth/refresh`
  đúng 1 lần (test cờ khoá).
- Khôi phục phiên lúc mount (`Providers`): refresh thành công → gọi tiếp `me` → `setCredentials` với đúng
  `user` lấy từ `me` (không phải từ response của `refresh`, response đó không có `user`); refresh thất bại →
  không gọi `me`, state giữ nguyên `null`.
- Trang đăng nhập: submit gọi đúng `login` mutation với đúng payload; sai mật khẩu hiển thị đúng message lỗi từ
  backend; thành công điều hướng `/`.
- Trang đăng ký: tương tự, thành công điều hướng thẳng `/` (không qua bước đăng nhập lại).
- `middleware`: có cookie → qua; không cookie + route không công khai → redirect `/dang-nhap`; không cookie +
  `/dang-nhap` → qua (không redirect vòng lặp).
- `Sidebar`: item có `roles: ['ADMIN']` ẩn với user role `TEACHER`, hiện với `ADMIN`; item không có `roles` luôn
  hiện.
- Đăng xuất: bấm nút gọi đúng `logout` mutation, xoá Redux state, điều hướng `/dang-nhap`.

## Rủi ro / điểm cần lưu ý

- `credentials: 'include'` trên `fetchBaseQuery` yêu cầu backend CORS cấu hình đúng `origin` cụ thể (không phải
  `*`) kèm `credentials: true` — đã có sẵn từ Phase 1 (`main.ts`: `app.enableCors({ origin:
  process.env.CORS_ORIGINS, credentials: true })`), chỉ cần xác nhận `CORS_ORIGINS` dev trỏ đúng
  `http://localhost:3000`.
- Access token chỉ sống trong Redux (bộ nhớ) — mất khi đóng tab/reload, nhưng bước "giữ phiên qua reload" (mục
  3) bù lại bằng 1 lần gọi `/auth/refresh` lúc mount nên trải nghiệm người dùng không bị ảnh hưởng.
- Nhiều tab cùng mở: mỗi tab có Redux store riêng (do `Providers` tạo store mới mỗi lần mount — xem
  `providers.jsx` hiện tại), nên đăng xuất ở 1 tab không tự đồng bộ sang tab khác ngay (tab kia chỉ nhận ra khi
  gọi API tiếp theo và refresh thất bại vì cookie đã bị xoá). Chấp nhận được ở v1, không trong yêu cầu gốc.

## Ngoài phạm vi (để sub-project sau)

- Toàn bộ UI tính năng (lớp, học sinh, điểm danh, vi phạm, PPCT, TKB, ...) — sub-project 2-5.
- Màn hình đổi mật khẩu chủ động, ép đổi mật khẩu lần đầu (`mustChangePassword`).
- Đồng bộ trạng thái đăng nhập/đăng xuất giữa nhiều tab (vd qua `BroadcastChannel`).
