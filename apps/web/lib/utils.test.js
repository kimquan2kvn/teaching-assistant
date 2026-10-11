import {
  buildIdNameMap,
  getMyPositionsInClass,
  formatSignedPoints,
  todayDateOnly,
  apiErrorMessage,
  canEditPosition,
  getReadableSubjectPositions,
} from './utils';
import { CLASS_DETAIL } from './test-fixtures/phase3';

describe('buildIdNameMap', () => {
  test('mảng rỗng → Map rỗng, không throw', () => {
    const map = buildIdNameMap([], 'fullName');
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(0);
  });

  test('ghép _id (ObjectId) → giá trị field tên được chỉ định', () => {
    const items = [
      { _id: 'a1', fullName: 'Nguyễn Văn A' },
      { _id: 'a2', fullName: 'Trần Thị B' },
    ];
    const map = buildIdNameMap(items, 'fullName');
    expect(map.get('a1')).toBe('Nguyễn Văn A');
    expect(map.get('a2')).toBe('Trần Thị B');
  });

  test('dùng được với field tên khác (vd label của danh mục vi phạm)', () => {
    const items = [{ _id: 'c1', label: 'Đi học muộn' }];
    const map = buildIdNameMap(items, 'label');
    expect(map.get('c1')).toBe('Đi học muộn');
  });

  test('ép _id không phải string (vd ObjectId) về string làm key', () => {
    const items = [{ _id: { toString: () => 'obj-id-1' }, fullName: 'X' }];
    const map = buildIdNameMap(items, 'fullName');
    expect(map.get('obj-id-1')).toBe('X');
  });
});

describe('getMyPositionsInClass', () => {
  const positions = [
    { id: 'p1', type: 'HOMEROOM', holder: { id: 'u1', fullName: 'GV A' } },
    { id: 'p2', type: 'SUBJECT', holder: { id: 'u2', fullName: 'GV B' } },
    { id: 'p3', type: 'SUBJECT', holder: null },
  ];

  test('ADMIN → trả nguyên mảng positions đầu vào', () => {
    const currentUser = { id: 'u9', role: 'ADMIN' };
    const result = getMyPositionsInClass(positions, currentUser);
    expect(result).toEqual(positions);
  });

  test('TEACHER giữ đúng 1 trong 3 vị trí → trả mảng có đúng 1 phần tử là vị trí đó', () => {
    const currentUser = { id: 'u1', role: 'TEACHER' };
    const result = getMyPositionsInClass(positions, currentUser);
    expect(result).toEqual([positions[0]]);
  });

  test('TEACHER không giữ vị trí nào trong lớp → trả mảng rỗng', () => {
    const currentUser = { id: 'u-khac', role: 'TEACHER' };
    const result = getMyPositionsInClass(positions, currentUser);
    expect(result).toEqual([]);
  });

  test('không có currentUser → trả mảng rỗng, không throw', () => {
    const result = getMyPositionsInClass(positions, null);
    expect(result).toEqual([]);
  });
});

describe('todayDateOnly', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('trả đúng ngày theo giờ ĐỊA PHƯƠNG, không lùi 1 ngày vào buổi sáng sớm (giờ VN UTC+7, lúc điểm danh)', () => {
    // 2026-10-08T23:30:00Z = 06:30 sáng 2026-10-09 giờ VN (UTC+7) — nếu dùng toISOString().slice(0,10) (UTC
    // thuần) sẽ trả nhầm "2026-10-08", đúng lúc giáo viên đang điểm danh đầu giờ sáng.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T23:30:00.000Z'));
    expect(todayDateOnly()).toBe('2026-10-09');
  });
});

describe('formatSignedPoints', () => {
  test('số dương → thêm dấu + phía trước', () => {
    expect(formatSignedPoints(10)).toBe('+10');
  });

  test('số âm → giữ nguyên dấu - có sẵn', () => {
    expect(formatSignedPoints(-5)).toBe('-5');
  });

  test('số 0 → "0", không thêm dấu +', () => {
    expect(formatSignedPoints(0)).toBe('0');
  });
});

describe('apiErrorMessage', () => {
  test('lỗi nghiệp vụ tiếng Việt từ backend (400) → giữ nguyên văn', () => {
    const err = { status: 400, data: { message: 'Ngày kết thúc không được trước ngày bắt đầu' } };
    expect(apiErrorMessage(err, 'x')).toBe('Ngày kết thúc không được trước ngày bắt đầu');
  });

  test('409 tiếng Việt từ service → giữ nguyên văn', () => {
    const err = { status: 409, data: { message: 'Bạn đã có tiết khác vào thời điểm này' } };
    expect(apiErrorMessage(err, 'x')).toBe('Bạn đã có tiết khác vào thời điểm này');
  });

  test('403 do guard trả tiếng Anh "Forbidden resource" → câu cố định tiếng Việt', () => {
    const err = { status: 403, data: { message: 'Forbidden resource' } };
    expect(apiErrorMessage(err, 'x')).toBe('Bạn không có quyền thực hiện thao tác này');
  });

  test('403 do service ném message tiếng Việt → giữ nguyên văn', () => {
    const err = { status: 403, data: { message: 'Bạn không giữ vị trí này' } };
    expect(apiErrorMessage(err, 'x')).toBe('Bạn không giữ vị trí này');
  });

  test('403 không có data hoặc không có message → vẫn là câu cố định tiếng Việt, không rơi về fallback', () => {
    expect(apiErrorMessage({ status: 403 }, 'x')).toBe('Bạn không có quyền thực hiện thao tác này');
    expect(apiErrorMessage({ status: 403, data: 'Forbidden' }, 'x')).toBe('Bạn không có quyền thực hiện thao tác này');
  });

  test('500 → message tiếng Việt của backend', () => {
    const err = { status: 500, data: { message: 'Đã có lỗi xảy ra, vui lòng thử lại sau' } };
    expect(apiErrorMessage(err, 'x')).toBe('Đã có lỗi xảy ra, vui lòng thử lại sau');
  });

  test('lỗi mạng (FETCH_ERROR, không có data) hoặc err undefined → fallback', () => {
    expect(apiErrorMessage({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' }, 'Lưu thất bại')).toBe(
      'Lưu thất bại',
    );
    expect(apiErrorMessage(undefined, 'Lưu thất bại')).toBe('Lưu thất bại');
  });

  test('mã khác 403 mà message rỗng / không phải chuỗi / không có → fallback (không hiện ô lỗi trống hay "[object Object]")', () => {
    expect(apiErrorMessage({ status: 400, data: { message: '' } }, 'Lưu thất bại')).toBe('Lưu thất bại');
    expect(apiErrorMessage({ status: 400, data: { message: ['a', 'b'] } }, 'Lưu thất bại')).toBe('Lưu thất bại');
    expect(apiErrorMessage({ status: 400, data: {} }, 'Lưu thất bại')).toBe('Lưu thất bại');
    expect(apiErrorMessage({ status: 400, data: null }, 'Lưu thất bại')).toBe('Lưu thất bại');
  });

  describe('upload file (multer trả message tiếng Anh)', () => {
    const FILE_TOO_LARGE = 'File quá lớn (tối đa 5MB)';
    const UNREADABLE_UPLOAD = 'Không đọc được file tải lên, vui lòng chọn lại file';

    test('413 do multer trả "File too large" (tiếng Anh) → câu cố định tiếng Việt', () => {
      const err = { status: 413, data: { message: 'File too large' } };
      expect(apiErrorMessage(err, 'x')).toBe(FILE_TOO_LARGE);
    });

    test('413 không có data hoặc không có message → vẫn là câu cố định, không rơi về fallback', () => {
      expect(apiErrorMessage({ status: 413 }, 'x')).toBe(FILE_TOO_LARGE);
      expect(apiErrorMessage({ status: 413, data: {} }, 'x')).toBe(FILE_TOO_LARGE);
    });

    test('413 do reverse proxy trả trang HTML (RTK Query báo PARSING_ERROR kèm originalStatus 413) → câu cố định', () => {
      const err = {
        status: 'PARSING_ERROR',
        originalStatus: 413,
        data: '<html><body>413 Request Entity Too Large</body></html>',
        error: 'SyntaxError: Unexpected token < in JSON at position 0',
      };
      expect(apiErrorMessage(err, 'x')).toBe(FILE_TOO_LARGE);
    });

    test('413 mà backend đã trả message tiếng Việt → giữ nguyên văn (không đè bằng câu cố định)', () => {
      const err = { status: 413, data: { message: 'Dữ liệu gửi lên quá lớn' } };
      expect(apiErrorMessage(err, 'x')).toBe('Dữ liệu gửi lên quá lớn');
    });

    test('message tiếng Anh bắt đầu bằng "Multipart" (multipart hỏng) → câu cố định tiếng Việt, bất kể mã 400 hay 500', () => {
      expect(apiErrorMessage({ status: 400, data: { message: 'Multipart: Boundary not found' } }, 'x')).toBe(
        UNREADABLE_UPLOAD,
      );
      expect(apiErrorMessage({ status: 500, data: { message: 'Multipart: Malformed part header' } }, 'x')).toBe(
        UNREADABLE_UPLOAD,
      );
    });

    test('chỉ thay message BẮT ĐẦU bằng "Multipart": message khác nhắc tới chữ này vẫn giữ nguyên văn', () => {
      const err = { status: 400, data: { message: 'Dữ liệu Multipart không hợp lệ' } };
      expect(apiErrorMessage(err, 'x')).toBe('Dữ liệu Multipart không hợp lệ');
    });
  });
});

describe('canEditPosition', () => {
  const subject = (holderId) => ({
    id: 'p-toan',
    type: 'SUBJECT',
    subject: 'Toán',
    holder: holderId ? { id: holderId, fullName: 'GV' } : null,
  });
  const teacher = { id: 'u1', role: 'TEACHER' };
  const admin = { id: 'u9', role: 'ADMIN' };

  test('GVBM giữ đúng vị trí SUBJECT → true', () => {
    expect(canEditPosition(subject('u1'), teacher)).toBe(true);
  });

  test('vị trí SUBJECT do người khác giữ → false', () => {
    expect(canEditPosition(subject('u2'), teacher)).toBe(false);
  });

  test('vị trí SUBJECT đang trống: TEACHER → false, ADMIN → true', () => {
    expect(canEditPosition(subject(null), teacher)).toBe(false);
    expect(canEditPosition(subject(null), admin)).toBe(true);
  });

  test('ADMIN sửa được vị trí SUBJECT bất kỳ', () => {
    expect(canEditPosition(subject('u2'), admin)).toBe(true);
  });

  test('HOMEROOM không có PPCT/TKB/sổ báo giảng để sửa → false với mọi người dùng, kể cả ADMIN và chính GVCN', () => {
    const homeroom = { id: 'p-hr', type: 'HOMEROOM', holder: { id: 'u1', fullName: 'GVCN' } };
    expect(canEditPosition(homeroom, teacher)).toBe(false);
    expect(canEditPosition(homeroom, admin)).toBe(false);
  });

  test('chưa có currentUser hoặc position → false, không throw', () => {
    expect(canEditPosition(subject('u1'), null)).toBe(false);
    expect(canEditPosition(subject('u1'), undefined)).toBe(false);
    expect(canEditPosition(null, teacher)).toBe(false);
    expect(canEditPosition(undefined, admin)).toBe(false);
  });

  test('thiếu id ở cả 2 phía không được tính là "trùng nhau" (undefined === undefined)', () => {
    const holderWithoutId = { id: 'p-toan', type: 'SUBJECT', holder: { fullName: 'GV' } };
    expect(canEditPosition(holderWithoutId, { role: 'TEACHER' })).toBe(false);
  });
});

describe('getReadableSubjectPositions', () => {
  const ids = (positions) => positions.map((p) => p.id);

  test('GVCN (giữ HOMEROOM) đọc được mọi vị trí SUBJECT của lớp, kể cả vị trí đang trống, đúng thứ tự gốc', () => {
    const result = getReadableSubjectPositions(CLASS_DETAIL.positions, { id: 'u-gvcn', role: 'TEACHER' });
    expect(ids(result)).toEqual(['p-toan', 'p-van', 'p-ly']);
  });

  test('GVBM chỉ đọc được vị trí môn mình giữ — môn khác không có trong danh sách', () => {
    const result = getReadableSubjectPositions(CLASS_DETAIL.positions, { id: 'u-van', role: 'TEACHER' });
    expect(ids(result)).toEqual(['p-van']);
  });

  test('GVBM giữ 2 môn trong cùng lớp → đọc được cả 2', () => {
    const positions = [
      { id: 'p-toan', type: 'SUBJECT', subject: 'Toán', holder: { id: 'u-a', fullName: 'A' } },
      { id: 'p-tin', type: 'SUBJECT', subject: 'Tin học', holder: { id: 'u-a', fullName: 'A' } },
      { id: 'p-van', type: 'SUBJECT', subject: 'Ngữ văn', holder: { id: 'u-b', fullName: 'B' } },
    ];
    const result = getReadableSubjectPositions(positions, { id: 'u-a', role: 'TEACHER' });
    expect(ids(result)).toEqual(['p-toan', 'p-tin']);
  });

  test('GVCN đồng thời dạy 1 môn vẫn đọc được mọi môn (quyền GVCN là tập lớn hơn)', () => {
    const positions = [
      { id: 'p-hr', type: 'HOMEROOM', holder: { id: 'u-a', fullName: 'A' } },
      { id: 'p-toan', type: 'SUBJECT', subject: 'Toán', holder: { id: 'u-a', fullName: 'A' } },
      { id: 'p-van', type: 'SUBJECT', subject: 'Ngữ văn', holder: { id: 'u-b', fullName: 'B' } },
    ];
    const result = getReadableSubjectPositions(positions, { id: 'u-a', role: 'TEACHER' });
    expect(ids(result)).toEqual(['p-toan', 'p-van']);
  });

  test('ADMIN đọc được mọi vị trí SUBJECT', () => {
    const result = getReadableSubjectPositions(CLASS_DETAIL.positions, { id: 'u-admin', role: 'ADMIN' });
    expect(ids(result)).toEqual(['p-toan', 'p-van', 'p-ly']);
  });

  test('giáo viên không giữ vị trí nào trong lớp → mảng rỗng', () => {
    const result = getReadableSubjectPositions(CLASS_DETAIL.positions, { id: 'u-khac', role: 'TEACHER' });
    expect(result).toEqual([]);
  });

  test('STUDENT, chưa đăng nhập hoặc chưa có danh sách vị trí → mảng rỗng, không throw', () => {
    expect(getReadableSubjectPositions(CLASS_DETAIL.positions, { id: 'u-hs', role: 'STUDENT' })).toEqual([]);
    expect(getReadableSubjectPositions(CLASS_DETAIL.positions, null)).toEqual([]);
    expect(getReadableSubjectPositions(undefined, { id: 'u-gvcn', role: 'TEACHER' })).toEqual([]);
  });

  test('không bao giờ trả vị trí HOMEROOM, với bất kỳ người dùng nào', () => {
    const users = [
      { id: 'u-gvcn', role: 'TEACHER' },
      { id: 'u-toan', role: 'TEACHER' },
      { id: 'u-admin', role: 'ADMIN' },
    ];
    for (const user of users) {
      const result = getReadableSubjectPositions(CLASS_DETAIL.positions, user);
      expect(result.every((position) => position.type === 'SUBJECT')).toBe(true);
    }
  });

  test('không làm thay đổi mảng đầu vào', () => {
    const before = JSON.parse(JSON.stringify(CLASS_DETAIL.positions));
    getReadableSubjectPositions(CLASS_DETAIL.positions, { id: 'u-gvcn', role: 'TEACHER' });
    expect(CLASS_DETAIL.positions).toEqual(before);
  });
});
