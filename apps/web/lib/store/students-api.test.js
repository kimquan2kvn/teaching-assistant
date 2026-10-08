import { makeStore } from './store';
import { studentsApi } from './students-api';

function jsonResponse(status, body) {
  const text = JSON.stringify(body);
  return Promise.resolve({
    status,
    text: () => Promise.resolve(text),
    clone() {
      return { text: () => Promise.resolve(text) };
    },
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

test('getStudents gọi đúng GET /classes/:classId/students?status=', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  const store = makeStore();
  await store.dispatch(studentsApi.endpoints.getStudents.initiate({ classId: 'c1', status: 'ACTIVE' }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('GET');
  expect(request.url).toContain('/classes/c1/students');
  expect(request.url).toContain('status=ACTIVE');
});

test('createStudent gọi đúng POST /classes/:classId/students kèm body', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(201, { _id: 's1', fullName: 'Nguyễn Văn A' }));
  const store = makeStore();
  await store.dispatch(
    studentsApi.endpoints.createStudent.initiate({ classId: 'c1', fullName: 'Nguyễn Văn A', dob: '2015-01-01' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/classes/c1/students');
  expect(request.url).not.toContain('/students/');
  expect(JSON.parse(request.body)).toEqual({ fullName: 'Nguyễn Văn A', dob: '2015-01-01' });
});

test('updateStudent gọi đúng PATCH /classes/:classId/students/:studentId kèm body', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(200, { _id: 's1', fullName: 'Nguyễn Văn B' }));
  const store = makeStore();
  await store.dispatch(
    studentsApi.endpoints.updateStudent.initiate({ classId: 'c1', studentId: 's1', fullName: 'Nguyễn Văn B' }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('PATCH');
  expect(request.url).toContain('/classes/c1/students/s1');
  expect(JSON.parse(request.body)).toEqual({ fullName: 'Nguyễn Văn B' });
});

test('transferStudent gọi đúng POST /classes/:classId/students/:studentId/transfer kèm body', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(201, { _id: 's1', status: 'TRANSFERRED' }));
  const store = makeStore();
  await store.dispatch(
    studentsApi.endpoints.transferStudent.initiate({
      classId: 'c1',
      studentId: 's1',
      transferDate: '2026-01-15',
      transferReason: 'Chuyển trường',
    }),
  );
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/classes/c1/students/s1/transfer');
  expect(JSON.parse(request.body)).toEqual({ transferDate: '2026-01-15', transferReason: 'Chuyển trường' });
});

test('importPreview gửi body là FormData (không phải JSON) kèm field file', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(201, { rows: [] }));
  const store = makeStore();
  const file = new File(['a,b'], 'hoc-sinh.xlsx');
  await store.dispatch(studentsApi.endpoints.importPreview.initiate({ classId: 'c1', file }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/classes/c1/students/import-preview');
  expect(request.body).toBeInstanceOf(FormData);
  expect(request.body.get('file')).toBe(file);
});

test('importConfirm gọi đúng POST /classes/:classId/students/import-confirm kèm rows', async () => {
  global.fetch.mockReturnValueOnce(jsonResponse(201, { count: 1 }));
  const store = makeStore();
  const rows = [{ fullName: 'Nguyễn Văn A', dob: '2015-01-01' }];
  await store.dispatch(studentsApi.endpoints.importConfirm.initiate({ classId: 'c1', rows }));
  const request = global.fetch.mock.calls[0][0];
  expect(request.method).toBe('POST');
  expect(request.url).toContain('/classes/c1/students/import-confirm');
  expect(JSON.parse(request.body)).toEqual({ rows });
});

test('createStudent thành công invalidate đúng Students của classId, làm getStudents tự refetch', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(studentsApi.endpoints.getStudents.initiate({ classId: 'c1', status: 'ACTIVE' }));

  global.fetch.mockReturnValueOnce(jsonResponse(201, { _id: 's1', fullName: 'Nguyễn Văn A' }));
  global.fetch.mockReturnValueOnce(jsonResponse(200, [{ _id: 's1', fullName: 'Nguyễn Văn A' }]));

  await store.dispatch(
    studentsApi.endpoints.createStudent.initiate({ classId: 'c1', fullName: 'Nguyễn Văn A', dob: '2015-01-01' }),
  );

  const studentListCalls = global.fetch.mock.calls.filter(
    (c) => c[0].url.includes('/classes/c1/students') && c[0].method === 'GET',
  );
  expect(studentListCalls).toHaveLength(2);
});

test('createStudent không ảnh hưởng cache Students của lớp khác (tag theo đúng classId)', async () => {
  const store = makeStore();

  global.fetch.mockReturnValueOnce(jsonResponse(200, []));
  await store.dispatch(studentsApi.endpoints.getStudents.initiate({ classId: 'c2', status: 'ACTIVE' }));

  global.fetch.mockReturnValueOnce(jsonResponse(201, { _id: 's1', fullName: 'Nguyễn Văn A' }));

  await store.dispatch(
    studentsApi.endpoints.createStudent.initiate({ classId: 'c1', fullName: 'Nguyễn Văn A', dob: '2015-01-01' }),
  );

  const c2Calls = global.fetch.mock.calls.filter((c) => c[0].url.includes('/classes/c2/students'));
  expect(c2Calls).toHaveLength(1);
});
