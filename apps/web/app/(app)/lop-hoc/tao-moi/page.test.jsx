import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import TaoLopPage from './page';

const createClassMock = jest.fn();
jest.mock('@/lib/store/classes-api', () => ({
  ...jest.requireActual('@/lib/store/classes-api'),
  useCreateClassMutation: () => [createClassMock, { isLoading: false }],
}));

// jsdom không có ResizeObserver; Radix Checkbox đặt trong <form> dùng nó để đo input ẩn.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  createClassMock.mockClear();
});

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <TaoLopPage />
    </Provider>,
  );
}

test('submit form gọi đúng createClass({name, claimHomeroom})', async () => {
  createClassMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        class: { _id: 'class-1', code: '11B1-ABCDE', name: '11B1' },
        positions: [],
      }),
  });
  renderPage();

  await userEvent.type(screen.getByPlaceholderText('Tên lớp'), '11B1');
  const checkbox = screen.getByRole('checkbox', { name: 'Bạn có phải GVCN lớp này không?' });
  expect(checkbox).not.toBeChecked();
  await userEvent.click(checkbox);
  expect(checkbox).toBeChecked();
  await userEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

  expect(createClassMock).toHaveBeenCalledWith({ name: '11B1', claimHomeroom: true });
});

test('thành công hiện đúng mã lớp trả về từ backend (không phải mã tự sinh phía client), có nút sao chép và nút xem lớp', async () => {
  createClassMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        class: { _id: 'class-xyz', code: '11B1-Z9Q2K', name: '11B1' },
        positions: [],
      }),
  });
  renderPage();

  await userEvent.type(screen.getByPlaceholderText('Tên lớp'), '11B1');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

  expect(await screen.findByText('Đã tạo lớp')).toBeInTheDocument();
  expect(screen.getByText('11B1-Z9Q2K')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('Tên lớp')).not.toBeInTheDocument();

  const xemLopLink = screen.getByRole('link', { name: 'Xem lớp' });
  expect(xemLopLink).toHaveAttribute('href', '/lop-hoc/class-xyz');
});

test('nút sao chép gọi navigator.clipboard.writeText với đúng mã lớp', async () => {
  createClassMock.mockReturnValue({
    unwrap: () =>
      Promise.resolve({
        class: { _id: 'class-xyz', code: '11B1-Z9Q2K', name: '11B1' },
        positions: [],
      }),
  });
  const writeText = jest.fn();
  Object.assign(navigator, { clipboard: { writeText } });
  renderPage();

  await userEvent.type(screen.getByPlaceholderText('Tên lớp'), '11B1');
  await userEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));
  await screen.findByText('Đã tạo lớp');

  await userEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
  expect(writeText).toHaveBeenCalledWith('11B1-Z9Q2K');
});

test('lỗi từ backend (vd tên rỗng bị zod chặn) hiện đúng error.data.message nguyên văn', async () => {
  createClassMock.mockReturnValue({
    unwrap: () => Promise.reject({ data: { message: 'Tên lớp không được để trống' } }),
  });
  renderPage();

  await userEvent.click(screen.getByRole('button', { name: 'Tạo lớp' }));

  expect(await screen.findByText('Tên lớp không được để trống')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Tên lớp không được để trống');
});
