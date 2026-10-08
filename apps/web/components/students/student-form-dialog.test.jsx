import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeStore } from '@/lib/store/store';
import { StudentFormDialog } from './student-form-dialog';

const createStudentMock = jest.fn(() => ({ unwrap: () => Promise.resolve({ _id: 'new-1' }) }));
const updateStudentMock = jest.fn(() => ({ unwrap: () => Promise.resolve({ _id: 's1' }) }));

jest.mock('@/lib/store/students-api', () => ({
  ...jest.requireActual('@/lib/store/students-api'),
  useCreateStudentMutation: () => [createStudentMock, { isLoading: false }],
  useUpdateStudentMutation: () => [updateStudentMock, { isLoading: false }],
}));

beforeEach(() => {
  createStudentMock.mockClear();
  updateStudentMock.mockClear();
});

function renderDialog(props) {
  const store = makeStore();
  const onOpenChange = jest.fn();
  const utils = render(
    <Provider store={store}>
      <StudentFormDialog classId="c1" open onOpenChange={onOpenChange} {...props} />
    </Provider>,
  );
  return { ...utils, onOpenChange, store };
}

test('chế độ thêm: submit form gọi đúng payload createStudent, không đụng updateStudent', async () => {
  renderDialog({ student: null });

  await userEvent.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn A');
  await userEvent.type(screen.getByLabelText('Ngày sinh'), '2015-05-20');
  await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(createStudentMock).toHaveBeenCalledWith({ classId: 'c1', fullName: 'Nguyễn Văn A', dob: '2015-05-20' });
  expect(updateStudentMock).not.toHaveBeenCalled();
});

test('chế độ sửa: prefill đúng dữ liệu dòng đang chọn, submit gọi đúng payload updateStudent kèm studentId', async () => {
  renderDialog({ student: { _id: 's1', fullName: 'Nguyễn Văn B', dob: '2010-03-01T00:00:00.000Z' } });

  expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn B');
  expect(screen.getByLabelText('Ngày sinh')).toHaveValue('2010-03-01');

  await userEvent.clear(screen.getByLabelText('Họ và tên'));
  await userEvent.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn B2');
  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

  expect(updateStudentMock).toHaveBeenCalledWith({
    classId: 'c1',
    studentId: 's1',
    fullName: 'Nguyễn Văn B2',
    dob: '2010-03-01',
  });
  expect(createStudentMock).not.toHaveBeenCalled();
});

// Bug dễ gặp nhất với dialog dùng chung 1 state cho thêm/sửa: mở cho học sinh A rồi đóng lại, mở tiếp cho học
// sinh B — nếu component chỉ set state lúc mount (hoặc giữ studentId cũ trong state nội bộ không đồng bộ theo
// prop `student` mỗi lần mở), submit sẽ gửi nhầm studentId của A thay vì B.
test('mở lần lượt cho 2 học sinh khác nhau: submit gửi đúng studentId của dòng đang mở, không phải dòng trước đó', async () => {
  const store = makeStore();
  const onOpenChange = jest.fn();
  const studentA = { _id: 'student-a', fullName: 'Học sinh A', dob: '2011-01-01T00:00:00.000Z' };
  const studentB = { _id: 'student-b', fullName: 'Học sinh B', dob: '2012-02-02T00:00:00.000Z' };

  const { rerender } = render(
    <Provider store={store}>
      <StudentFormDialog classId="c1" open student={studentA} onOpenChange={onOpenChange} />
    </Provider>,
  );
  expect(screen.getByLabelText('Họ và tên')).toHaveValue('Học sinh A');

  rerender(
    <Provider store={store}>
      <StudentFormDialog classId="c1" open={false} student={studentA} onOpenChange={onOpenChange} />
    </Provider>,
  );
  rerender(
    <Provider store={store}>
      <StudentFormDialog classId="c1" open student={studentB} onOpenChange={onOpenChange} />
    </Provider>,
  );

  expect(screen.getByLabelText('Họ và tên')).toHaveValue('Học sinh B');

  await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));

  expect(updateStudentMock).toHaveBeenCalledWith({
    classId: 'c1',
    studentId: 'student-b',
    fullName: 'Học sinh B',
    dob: '2012-02-02',
  });
});

test('submit thành công gọi onOpenChange(false) để đóng dialog', async () => {
  const { onOpenChange } = renderDialog({ student: null });

  await userEvent.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn C');
  await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

test('submit thất bại hiện đúng error.data.message, KHÔNG đóng dialog (giữ nguyên để người dùng sửa lại)', async () => {
  createStudentMock.mockImplementationOnce(() => ({
    unwrap: () =>
      Promise.reject({ status: 404, data: { message: 'Không tìm thấy học sinh trong lớp này' } }),
  }));
  const { onOpenChange } = renderDialog({ student: null });

  await userEvent.type(screen.getByLabelText('Họ và tên'), 'Nguyễn Văn D');
  await userEvent.click(screen.getByRole('button', { name: 'Thêm' }));

  expect(await screen.findByText('Không tìm thấy học sinh trong lớp này')).toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});
