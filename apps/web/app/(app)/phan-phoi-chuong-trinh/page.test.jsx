import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import authReducer from '@/lib/store/auth-slice';
import { getSubjectColor } from '@/components/schedule/subject-colors';
import { makeMyPosition } from '@/lib/test-fixtures/phase3';
import PhanPhoiChuongTrinhPage from './page';

const useGetMyPositionsQueryMock = jest.fn();
jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useGetMyPositionsQuery: (...args) => useGetMyPositionsQueryMock(...args),
}));

const DENIED_TEXT = 'Bạn không có quyền xem trang này';
const NO_SUBJECT_TEXT = 'Bạn chưa giữ môn nào';
const LOAD_ERROR_FALLBACK = 'Không tải được danh sách môn, vui lòng thử lại';
const HOMEROOM_HINT =
  'Để xem PPCT các môn trong lớp chủ nhiệm, mở Lớp học, chọn lớp rồi vào thẻ "Phân phối chương trình".';
const ADMIN_GUIDE =
  'Quản trị viên mở PPCT của từng môn từ trang chi tiết lớp (Quản lý giáo viên → chọn giáo viên → Xem lớp).';

// makeMyPosition mặc định: môn Toán, lớp 11A4 (class-1), vị trí p-toan.
const TOAN = makeMyPosition();
const NGU_VAN = makeMyPosition({
  id: 'p-van',
  subject: 'Ngữ văn',
  class: { id: 'class-2', code: '11A5-K3ZP', name: '11A5' },
});
// Vị trí HOMEROOM thật không có key `subject` (backend không gán — xem CLASS_DETAIL trong fixture).
const HOMEROOM = makeMyPosition({
  id: 'p-hr',
  type: 'HOMEROOM',
  subject: undefined,
  class: { id: 'class-3', code: '11A1-Q9WD', name: '11A1' },
});

function renderPage(role) {
  const store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { user: role ? { id: 'u1', role } : null, accessToken: role ? 'token' : null } },
  });
  return render(
    <Provider store={store}>
      <PhanPhoiChuongTrinhPage />
    </Provider>,
  );
}

function mockPositions(data) {
  useGetMyPositionsQueryMock.mockReturnValue({ data, isLoading: false, error: undefined });
}

// Câu có link lồng bên trong bị tách thành nhiều node text nên so khớp theo textContent của cả thẻ <p>.
const isParagraphWithText = (text) => (_, element) => element?.tagName === 'P' && element.textContent === text;

function expectCardLinks(card, { classId, positionId }) {
  expect(within(card).getAllByRole('link')).toHaveLength(3);
  expect(within(card).getByRole('link', { name: 'Phân phối chương trình' })).toHaveAttribute(
    'href',
    `/lop-hoc/${classId}/ppct?positionId=${positionId}`,
  );
  expect(within(card).getByRole('link', { name: 'Khai báo tiết' })).toHaveAttribute(
    'href',
    `/lop-hoc/${classId}/thoi-khoa-bieu?positionId=${positionId}`,
  );
  expect(within(card).getByRole('link', { name: 'Sổ báo giảng' })).toHaveAttribute(
    'href',
    `/lop-hoc/${classId}/so-bao-giang?positionId=${positionId}`,
  );
}

beforeEach(() => {
  useGetMyPositionsQueryMock.mockReset();
});

describe('TEACHER giữ vị trí môn', () => {
  test('mỗi vị trí SUBJECT một thẻ (bỏ HOMEROOM), mỗi thẻ 3 link tới trang theo lớp kèm positionId', () => {
    mockPositions([TOAN, HOMEROOM, NGU_VAN]);
    renderPage('TEACHER');

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);

    const [toanCard, vanCard] = cards;
    expect(within(toanCard).getByRole('heading', { name: '11A4' })).toBeInTheDocument();
    expect(within(toanCard).getByText('Toán')).toBeInTheDocument();
    expectCardLinks(toanCard, { classId: 'class-1', positionId: 'p-toan' });

    expect(within(vanCard).getByRole('heading', { name: '11A5' })).toBeInTheDocument();
    expect(within(vanCard).getByText('Ngữ văn')).toBeInTheDocument();
    expectCardLinks(vanCard, { classId: 'class-2', positionId: 'p-van' });

    // Lớp chủ nhiệm không có thẻ (HOMEROOM không có PPCT/TKB để sửa) nên tên lớp đó không hiện ở đâu cả.
    expect(screen.queryByText('11A1')).not.toBeInTheDocument();
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByText(ADMIN_GUIDE)).not.toBeInTheDocument();
  });

  test('giữ 2 môn trong cùng một lớp: 2 thẻ riêng, mỗi thẻ mang positionId của chính nó (không gộp theo lớp)', () => {
    const tinHoc = makeMyPosition({ id: 'p-tin', subject: 'Tin học' });
    mockPositions([TOAN, tinHoc]);
    renderPage('TEACHER');

    const [toanCard, tinCard] = screen.getAllByRole('listitem');
    expect(within(toanCard).getByText('Toán')).toBeInTheDocument();
    expectCardLinks(toanCard, { classId: 'class-1', positionId: 'p-toan' });
    expect(within(tinCard).getByText('Tin học')).toBeInTheDocument();
    expectCardLinks(tinCard, { classId: 'class-1', positionId: 'p-tin' });
  });

  test('chấm màu của thẻ theo môn (getSubjectColor)', () => {
    mockPositions([TOAN, NGU_VAN]);
    renderPage('TEACHER');

    const [toanCard, vanCard] = screen.getAllByRole('listitem');
    expect(within(toanCard).getByText('Toán').previousElementSibling).toHaveClass(getSubjectColor('Toán').dot);
    expect(within(vanCard).getByText('Ngữ văn').previousElementSibling).toHaveClass(
      getSubjectColor('Ngữ văn').dot,
    );
  });
});

describe('TEACHER chưa giữ môn nào', () => {
  test('chỉ giữ HOMEROOM: thông báo + link tham gia lớp + câu hướng dẫn GVCN có link tới Lớp học', () => {
    mockPositions([HOMEROOM]);
    renderPage('TEACHER');

    expect(screen.getByText(NO_SUBJECT_TEXT)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Tham gia bằng mã lớp' })).toHaveAttribute(
      'href',
      '/lop-hoc/tham-gia',
    );
    expect(screen.getByText(isParagraphWithText(HOMEROOM_HINT))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lớp học' })).toHaveAttribute('href', '/lop-hoc');
  });

  test('không giữ vị trí nào: có link tham gia lớp, KHÔNG hiện câu hướng dẫn dành cho GVCN', () => {
    mockPositions([]);
    renderPage('TEACHER');

    expect(screen.getByText(NO_SUBJECT_TEXT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tham gia bằng mã lớp' })).toHaveAttribute(
      'href',
      '/lop-hoc/tham-gia',
    );
    expect(screen.queryByText(isParagraphWithText(HOMEROOM_HINT))).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lớp học' })).not.toBeInTheDocument();
  });
});

describe('tải danh sách vị trí', () => {
  test('đang tải: skeleton dạng role=status, chưa có thẻ, thông báo rỗng hay lỗi', () => {
    useGetMyPositionsQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: undefined });
    renderPage('TEACHER');

    expect(screen.getByRole('status', { name: 'Đang tải danh sách môn' })).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each([
    ['không kèm message (lỗi mạng...) → câu mặc định của trang', {}, LOAD_ERROR_FALLBACK],
    [
      '500 của backend → nguyên văn message',
      { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } },
      'Đã có lỗi xảy ra, vui lòng thử lại sau',
    ],
    [
      '403 do guard (message tiếng Anh) → câu cố định tiếng Việt',
      { status: 403, data: { message: 'Forbidden resource' } },
      'Bạn không có quyền thực hiện thao tác này',
    ],
  ])('lỗi tải: %s', (_, error, expectedMessage) => {
    useGetMyPositionsQueryMock.mockReturnValue({ data: undefined, isLoading: false, error });
    renderPage('TEACHER');

    expect(screen.getByRole('alert')).toHaveTextContent(expectedMessage);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
  });
});

describe('phân quyền hiển thị', () => {
  test('ADMIN: chỉ hiện hướng dẫn mở PPCT từ trang chi tiết lớp, KHÔNG gọi /positions/mine (ADMIN không giữ vị trí)', () => {
    // Nếu hook lỡ được gọi thì dữ liệu này sẽ làm lộ thẻ môn ra màn hình.
    mockPositions([TOAN]);
    renderPage('ADMIN');

    expect(screen.getByText(ADMIN_GUIDE)).toBeInTheDocument();
    expect(useGetMyPositionsQueryMock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(NO_SUBJECT_TEXT)).not.toBeInTheDocument();
  });

  test('STUDENT: câu từ chối, không gọi hook, không hiện nội dung của giáo viên/admin', () => {
    mockPositions([TOAN]);
    renderPage('STUDENT');

    expect(screen.getByText(DENIED_TEXT)).toBeInTheDocument();
    expect(useGetMyPositionsQueryMock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByText(ADMIN_GUIDE)).not.toBeInTheDocument();
  });

  test('user chưa tải xong (Providers khôi phục phiên bất đồng bộ): chỉ "Đang tải...", hook chưa được gọi', () => {
    mockPositions([TOAN]);
    renderPage(null);

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải...');
    expect(useGetMyPositionsQueryMock).not.toHaveBeenCalled();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});

describe('dùng component shadcn/ui', () => {
  test('thẻ môn là Card đặt trong <li>; lỗi tải là Alert destructive; khối chờ là Skeleton', () => {
    mockPositions([TOAN]);
    const { unmount } = renderPage('TEACHER');
    const item = screen.getByRole('listitem');
    expect(item.firstElementChild).toHaveClass('bg-card', 'rounded-[10px]');
    unmount();

    useGetMyPositionsQueryMock.mockReturnValue({ data: undefined, isLoading: false, error: { status: 500 } });
    const { unmount: unmountError } = renderPage('TEACHER');
    expect(screen.getByRole('alert')).toHaveClass('border-destructive/40');
    unmountError();

    useGetMyPositionsQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: undefined });
    renderPage('TEACHER');
    const loading = screen.getByRole('status', { name: 'Đang tải danh sách môn' });
    expect(loading.children).toHaveLength(2);
    expect(loading.firstElementChild).toHaveClass('animate-pulse', 'bg-muted');
  });
});
