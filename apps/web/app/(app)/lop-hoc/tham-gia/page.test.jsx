import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import ThamGiaLopPage from './page';

const lookupClassByCodeMock = jest.fn();
const joinPositionMock = jest.fn();
const pushMock = jest.fn();

jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useLazyGetClassByCodeQuery: () => [lookupClassByCodeMock, { isFetching: false }],
}));

jest.mock('@/lib/store/positions-api', () => ({
  ...jest.requireActual('@/lib/store/positions-api'),
  useJoinPositionMutation: () => [joinPositionMock, { isLoading: false }],
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const CLASS_INFO = {
  class: { _id: 'class-1', code: '11B1-ABCDE', name: '11B1' },
  positions: [
    { type: 'HOMEROOM', taken: false },
    { type: 'SUBJECT', subject: 'Toán', taken: true },
    { type: 'SUBJECT', subject: 'Ngữ văn', taken: false },
    { type: 'SUBJECT', subject: 'Tiếng Anh', taken: false },
    { type: 'SUBJECT', subject: 'Vật lý', taken: false },
    { type: 'SUBJECT', subject: 'Hóa học', taken: false },
    { type: 'SUBJECT', subject: 'Sinh học', taken: false },
    { type: 'SUBJECT', subject: 'Lịch sử', taken: false },
    { type: 'SUBJECT', subject: 'Địa lý', taken: false },
    { type: 'SUBJECT', subject: 'GDCD', taken: false },
    { type: 'SUBJECT', subject: 'Tin học', taken: false },
    { type: 'SUBJECT', subject: 'Công nghệ', taken: false },
    { type: 'SUBJECT', subject: 'Thể dục', taken: false },
    { type: 'SUBJECT', subject: 'GDQP-AN', taken: false },
  ],
};

function mockLookupResolvedOnce(value) {
  lookupClassByCodeMock.mockReturnValueOnce({ unwrap: () => Promise.resolve(value) });
}

beforeEach(() => {
  lookupClassByCodeMock.mockClear();
  joinPositionMock.mockClear();
  pushMock.mockClear();
});

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <ThamGiaLopPage />
    </Provider>,
  );
}

async function lookupCode(code = '11B1-ABCDE') {
  await userEvent.type(screen.getByPlaceholderText('Mã lớp'), code);
  await userEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));
}

test('tra cứu mã lớp gọi đúng getClassByCode và hiện tên lớp', async () => {
  mockLookupResolvedOnce(CLASS_INFO);
  renderPage();

  await lookupCode();

  expect(lookupClassByCodeMock).toHaveBeenCalledWith('11B1-ABCDE');
  expect(await screen.findByText('11B1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Làm GVCN' })).toBeEnabled();
});

test('môn đã taken: true không bấm chọn được (disabled), môn trống vẫn chọn được', async () => {
  mockLookupResolvedOnce(CLASS_INFO);
  renderPage();
  await lookupCode();
  await screen.findByText('11B1');

  const takenButton = screen.getByRole('button', { name: /Toán/ });
  expect(takenButton).toBeDisabled();
  expect(takenButton).toHaveTextContent('Đã có người giữ');

  const availableButton = screen.getByRole('button', { name: 'Ngữ văn' });
  expect(availableButton).toBeEnabled();
});

test('vị trí HOMEROOM đã taken: true thì nút "Làm GVCN" bị disabled', async () => {
  mockLookupResolvedOnce({
    ...CLASS_INFO,
    positions: CLASS_INFO.positions.map((p) => (p.type === 'HOMEROOM' ? { ...p, taken: true } : p)),
  });
  renderPage();
  await lookupCode();
  await screen.findByText('11B1');

  expect(screen.getByRole('button', { name: 'Làm GVCN' })).toBeDisabled();
});

test('chọn "Làm GVCN" rồi submit gọi đúng joinPosition({code, type: "HOMEROOM"})', async () => {
  mockLookupResolvedOnce(CLASS_INFO);
  joinPositionMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({ _id: 'pos-1', classId: 'class-1', type: 'HOMEROOM', holderId: 'teacher-1' }),
  });
  renderPage();
  await lookupCode();
  await screen.findByText('11B1');

  await userEvent.click(screen.getByRole('button', { name: 'Làm GVCN' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tham gia' }));

  expect(joinPositionMock).toHaveBeenCalledWith({ code: '11B1-ABCDE', type: 'HOMEROOM' });
  expect(await screen.findByText('11B1')).toBeInTheDocument();
  expect(pushMock).toHaveBeenCalledWith('/lop-hoc/class-1');
});

test('chọn 1 môn trống rồi submit gọi đúng joinPosition({code, type: "SUBJECT", subject})', async () => {
  mockLookupResolvedOnce(CLASS_INFO);
  joinPositionMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        _id: 'pos-2',
        classId: 'class-1',
        type: 'SUBJECT',
        subject: 'Ngữ văn',
        holderId: 'teacher-1',
      }),
  });
  renderPage();
  await lookupCode();
  await screen.findByText('11B1');

  await userEvent.click(screen.getByRole('button', { name: 'Ngữ văn' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tham gia' }));

  expect(joinPositionMock).toHaveBeenCalledWith({
    code: '11B1-ABCDE',
    type: 'SUBJECT',
    subject: 'Ngữ văn',
  });
  expect(pushMock).toHaveBeenCalledWith('/lop-hoc/class-1');
});

test('409 khi tham gia hiện đúng message backend và tự gọi lại getClassByCode để refresh', async () => {
  mockLookupResolvedOnce(CLASS_INFO);
  joinPositionMock.mockReturnValue({
    unwrap: () =>
      Promise.reject({ status: 409, data: { message: 'Vị trí này đã có người giữ hoặc không tồn tại' } }),
  });
  renderPage();
  await lookupCode();
  await screen.findByText('11B1');

  mockLookupResolvedOnce({
    ...CLASS_INFO,
    positions: CLASS_INFO.positions.map((p) =>
      p.type === 'SUBJECT' && p.subject === 'Ngữ văn' ? { ...p, taken: true } : p,
    ),
  });

  await userEvent.click(screen.getByRole('button', { name: 'Ngữ văn' }));
  await userEvent.click(screen.getByRole('button', { name: 'Tham gia' }));

  expect(
    await screen.findByText('Vị trí này đã có người giữ hoặc không tồn tại'),
  ).toBeInTheDocument();
  expect(lookupClassByCodeMock).toHaveBeenCalledTimes(2);
  expect(pushMock).not.toHaveBeenCalled();

  expect(await screen.findByRole('button', { name: /Ngữ văn/ })).toBeDisabled();
});
