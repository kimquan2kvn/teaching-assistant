import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Sidebar } from './sidebar';
import { NAV_GROUPS } from './nav-data';
import authReducer from '@/lib/store/auth-slice';

// Tên biến phải bắt đầu bằng "mock" thì jest.mock (được hoist lên đầu file) mới cho phép factory tham chiếu.
let mockPathname = '/';
jest.mock('next/navigation', () => ({ usePathname: () => mockPathname }));

beforeEach(() => {
  mockPathname = '/';
});

// Sidebar giờ đọc user hiện tại qua useSelector(selectCurrentUser) (Task 7) nên mọi render
// đều cần bọc Provider Redux, kể cả 3 test có sẵn bên dưới — nếu không, useSelector sẽ throw
// "could not find react-redux context value". renderWithRole(null) ~ trạng thái auth mặc định
// (initialState: user=null), nội dung/assertion của 3 test cũ giữ nguyên không đổi.
function renderWithRole(role) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: role ? { id: '1', role } : null, accessToken: role ? 'x' : null } },
  });
  return render(
    <Provider store={store}>
      <Sidebar />
    </Provider>,
  );
}

test('render đủ 6 nhóm điều hướng với đúng nhãn', () => {
  // ADMIN thấy mọi mục (kể cả mục đã gate role) nên là role duy nhất khiến cả 6 nhóm có ít
  // nhất 1 mục hiển thị — Sidebar ẩn hẳn 1 nhóm nếu lọc role làm nhóm đó rỗng (xem sidebar.jsx).
  renderWithRole('ADMIN');
  ['Tổng quan', 'Nền tảng', 'Kế hoạch dạy học', 'Lớp học hằng ngày', 'Học tập', 'Khác'].forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

test('mục ứng với pathname hiện tại có style active (chữ vàng)', () => {
  renderWithRole(null);
  const active = screen.getByText('Bảng điều khiển');
  expect(active.closest('a')).toHaveClass('text-sidebar-active-fg');
});

test('mỗi mục điều hướng có icon SVG thật, không emoji/icon font', () => {
  renderWithRole(null);
  const links = screen.getAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  links.forEach((link) => {
    const icon = link.querySelector('svg');
    expect(icon).not.toBeNull();
  });
});

test('mục có roles=["ADMIN"] ẨN với role TEACHER', () => {
  renderWithRole('TEACHER');
  expect(screen.queryByText('Quản lý giáo viên')).not.toBeInTheDocument();
});

test('mục có roles=["ADMIN"] HIỆN với role ADMIN', () => {
  renderWithRole('ADMIN');
  expect(screen.getByText('Quản lý giáo viên')).toBeInTheDocument();
});

test('mục có roles=["ADMIN"] ẨN khi chưa biết role (user=null, chưa khôi phục phiên xong)', () => {
  renderWithRole(null);
  expect(screen.queryByText('Quản lý giáo viên')).not.toBeInTheDocument();
});

test('mục "Lớp học" và "Học sinh" ẨN với role STUDENT', () => {
  renderWithRole('STUDENT');
  expect(screen.queryByText('Lớp học')).not.toBeInTheDocument();
  expect(screen.queryByText('Học sinh')).not.toBeInTheDocument();
});

test('mục "Điểm danh"/"Vi phạm & điểm cộng" và 3 mục mới (Xếp loại rèn luyện/Chép phạt/Danh mục vi phạm) ẨN với role STUDENT', () => {
  renderWithRole('STUDENT');
  ['Điểm danh', 'Vi phạm & điểm cộng', 'Xếp loại rèn luyện', 'Chép phạt', 'Danh mục vi phạm'].forEach((label) => {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });
});

test('mục "Danh mục vi phạm" (roles=["ADMIN"]) ẨN với role TEACHER dù các mục TEACHER khác trong nhóm vẫn hiện', () => {
  renderWithRole('TEACHER');
  expect(screen.queryByText('Danh mục vi phạm')).not.toBeInTheDocument();
  ['Điểm danh', 'Vi phạm & điểm cộng', 'Xếp loại rèn luyện', 'Chép phạt'].forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

// 4 mục nhóm "Kế hoạch dạy học" của Phase 3. Test điều hướng chỉ khẳng định href/quyền hiển thị, không render trang đích.
const PHASE3_NAV = [
  { label: 'Lịch năm học', href: '/lich-nam-hoc' },
  { label: 'Phân phối chương trình', href: '/phan-phoi-chuong-trinh' },
  { label: 'Thời khóa biểu', href: '/thoi-khoa-bieu' },
  { label: 'Sổ báo giảng', href: '/so-bao-giang' },
];

test('TEACHER thấy đủ 4 mục kế hoạch dạy học, mỗi mục trỏ đúng trang Phase 3 và có icon SVG', () => {
  renderWithRole('TEACHER');
  PHASE3_NAV.forEach(({ label, href }) => {
    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', href);
    expect(link.querySelector('svg')).not.toBeNull();
  });
});

test('ADMIN thấy "Lịch năm học" và "Phân phối chương trình" nhưng KHÔNG thấy "Thời khóa biểu", "Sổ báo giảng" (chỉ-giáo-viên)', () => {
  renderWithRole('ADMIN');
  expect(screen.getByRole('link', { name: 'Lịch năm học' })).toHaveAttribute('href', '/lich-nam-hoc');
  expect(screen.getByRole('link', { name: 'Phân phối chương trình' })).toHaveAttribute(
    'href',
    '/phan-phoi-chuong-trinh',
  );
  expect(screen.queryByRole('link', { name: 'Thời khóa biểu' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Sổ báo giảng' })).not.toBeInTheDocument();
});

test('STUDENT không thấy mục nào trong 4 mục kế hoạch dạy học', () => {
  renderWithRole('STUDENT');
  PHASE3_NAV.forEach(({ label }) => {
    expect(screen.queryByText(label)).not.toBeInTheDocument();
  });
});

test('4 mục kế hoạch dạy học có href khác nhau và không trùng /lop-hoc (tránh nhiều mục cùng sáng active)', () => {
  const items = NAV_GROUPS.flatMap((group) => group.items);
  const hrefs = PHASE3_NAV.map(({ label }) => items.find((item) => item.label === label)?.href);

  expect(hrefs).toEqual(PHASE3_NAV.map(({ href }) => href));
  expect(new Set(hrefs).size).toBe(PHASE3_NAV.length);
  expect(hrefs).not.toContain('/lop-hoc');
});

test('đang ở /thoi-khoa-bieu thì chỉ đúng mục "Thời khóa biểu" sáng active', () => {
  mockPathname = '/thoi-khoa-bieu';
  renderWithRole('TEACHER');

  const activeLabels = screen
    .getAllByRole('link')
    .filter((link) => link.classList.contains('text-sidebar-active-fg'))
    .map((link) => link.textContent);
  expect(activeLabels).toEqual(['Thời khóa biểu']);
});
