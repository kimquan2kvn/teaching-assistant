'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import {
  useGetPositionAttendanceQuery,
  useGetClassAttendanceSummaryQuery,
  useMarkAttendanceMutation,
} from '@/lib/store/attendance-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { getMyPositionsInClass, todayDateOnly, cn } from '@/lib/utils';
import { Badge, badgeVariants } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

// 4 trạng thái điểm danh đúng nguyên văn CLAUDE.md #6, màu theo quy ước Binance (xanh = có mặt, đỏ = vắng
// không phép, xám = phép/muộn — không phải vi phạm nhưng cũng không phải "đạt chuẩn").
const STATUS_OPTIONS = [
  { value: 'PRESENT', label: 'Có mặt', variant: 'success' },
  { value: 'EXCUSED', label: 'Phép', variant: 'muted' },
  { value: 'LATE', label: 'Muộn', variant: 'muted' },
  { value: 'UNEXCUSED', label: 'Không phép', variant: 'danger' },
];
const STATUS_BY_VALUE = new Map(STATUS_OPTIONS.map((opt) => [opt.value, opt]));

// Cộng/trừ ngày trên chuỗi yyyy-mm-dd bằng mốc UTC-midnight thay vì `new Date(dateStr)` + setDate theo giờ
// địa phương — tránh lệch ngày khi múi giờ trình duyệt âm so với UTC, cùng lý do formatDate() ở utils.js dùng
// timeZone: 'UTC'.
function shiftDate(dateStr, deltaDays) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

// HOMEROOM không có subject (chỉ 1 vị trí/lớp) nên hiện nhãn cố định "Chủ nhiệm"; SUBJECT hiện thẳng tên môn.
function positionLabel(position) {
  return position.type === 'HOMEROOM' ? 'Chủ nhiệm' : position.subject;
}

export default function DiemDanhPage() {
  const { classId } = useParams();
  const currentUser = useSelector(selectCurrentUser);

  const [date, setDate] = useState(todayDateOnly);
  // '' nghĩa là "chưa tự chọn, dùng mặc định suy ra từ myPositions" — không dùng thẳng defaultWritingPositionId
  // làm initial state vì nó phụ thuộc dữ liệu fetch về sau (classDetail), rỗng lúc mount.
  const [writingPositionId, setWritingPositionId] = useState('');
  const [viewPositionId, setViewPositionId] = useState('');
  // Chỉ lưu các thay đổi NGƯỜI DÙNG tự bấm (khác với bản ghi đã fetch) — không đồng bộ 2 chiều với
  // attendanceRecords bằng useEffect phụ thuộc vào chính mảng đó: RTK Query trả về reference mới mỗi lần
  // refetch (và test mock luôn trả object literal mới mỗi render), effect kiểu đó dễ gây vòng lặp render vô
  // hạn. Dùng useMemo (thuần, không setState) để suy ra trạng thái gốc, rồi reset "overrides" bằng effect chỉ
  // phụ thuộc 2 giá trị nguyên thuỷ (vị trí + ngày đang xem).
  const [overrides, setOverrides] = useState({});
  const [error, setError] = useState(null);

  const { data: detail } = useGetClassDetailQuery(classId);
  const positions = useMemo(() => detail?.positions ?? [], [detail]);
  const myPositions = useMemo(() => getMyPositionsInClass(positions, currentUser), [positions, currentUser]);

  // Nếu chỉ giữ đúng 1 vị trí và không phải ADMIN thì dùng thẳng, không hiện bộ chọn. ADMIN hoặc giữ nhiều vị
  // trí (vd vừa HOMEROOM vừa SUBJECT của cùng lớp — hiếm nhưng schema không cấm) BẮT BUỘC hiện bộ chọn, không
  // tự ý chọn mặc định rồi giấu đi (xem "Edge case" của plan: tránh ghi nhầm vị trí mà không biết).
  const needsPositionPicker = myPositions.length > 1 || currentUser?.role === 'ADMIN';
  const defaultWritingPositionId = useMemo(() => {
    const homeroom = myPositions.find((p) => p.type === 'HOMEROOM');
    return homeroom?.id ?? myPositions[0]?.id ?? '';
  }, [myPositions]);
  const effectiveWritingPositionId = writingPositionId || defaultWritingPositionId;

  // GVCN (giữ HOMEROOM) hoặc ADMIN mới được GET vị trí khác (SELF_OR_HOMEROOM ở BE) — GVBM thuần không hiện
  // bộ chọn này, vì gọi GET vị trí khác sẽ bị 403, dẫn người dùng tới ngõ cụt.
  const isHomeroomHolder = positions.some((p) => p.type === 'HOMEROOM' && p.holder?.id === currentUser?.id);
  const canViewOtherPositions = isHomeroomHolder || currentUser?.role === 'ADMIN';
  const viewablePositions = positions.filter(
    (p) => p.type === 'SUBJECT' && p.id !== effectiveWritingPositionId,
  );

  const isReadOnlyView = Boolean(viewPositionId);
  const activePositionId = isReadOnlyView ? viewPositionId : effectiveWritingPositionId;

  const {
    data: students,
    isLoading: studentsLoading,
    isError: studentsIsError,
    error: studentsError,
  } = useGetStudentsQuery({ classId, status: 'ACTIVE' });
  const roster = students ?? [];
  const {
    data: attendanceRecords,
    isError: attendanceIsError,
    error: attendanceError,
  } = useGetPositionAttendanceQuery({ positionId: activePositionId, date }, { skip: !activePositionId });
  // LUÔN tính theo HOMEROOM bất kể đang xem/ghi vị trí nào (AttendanceService.getClassSummary) — đây là thống
  // kê "chính thức" của lớp, không phải thống kê của vị trí đang thao tác.
  const { data: summary } = useGetClassAttendanceSummaryQuery({ classId, date });
  const [markAttendance, { isLoading: isSaving }] = useMarkAttendanceMutation();

  // Trạng thái gốc suy từ bản ghi đã fetch (học sinh không có bản ghi ngoại lệ mặc định "Có mặt").
  const baseStatusByStudentId = useMemo(() => {
    const map = {};
    for (const record of attendanceRecords ?? []) {
      map[String(record.studentId)] = record.status;
    }
    return map;
  }, [attendanceRecords]);

  // Đổi vị trí đang xem/ghi hoặc đổi ngày → bỏ hết các chỉnh sửa tay chưa lưu của lượt xem trước, nạp lại từ
  // bản ghi mới. Phụ thuộc 2 giá trị nguyên thuỷ (không phải mảng attendanceRecords) để không chạy lại mỗi khi
  // RTK Query trả về 1 reference mới của CÙNG dữ liệu.
  useEffect(() => {
    setOverrides({});
  }, [activePositionId, date]);

  function statusOf(studentId) {
    return overrides[studentId] ?? baseStatusByStudentId[studentId] ?? 'PRESENT';
  }

  // GET .../students có PositionGuard — không giữ vị trí nào của lớp này (vd gõ nhầm URL) phải hiện đúng
  // "không có quyền", KHÔNG render khung trang + bảng rỗng (bảng rỗng trông giống "lớp chưa có học sinh").
  if (studentsIsError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">
          {studentsError?.status === 403 ? 'Bạn không có quyền xem lớp này' : 'Không tìm thấy lớp'}
        </h1>
      </div>
    );
  }

  function handleStatusChange(studentId, status) {
    setOverrides((prev) => ({ ...prev, [studentId]: status }));
  }

  // PUT thay thế toàn bộ bản ghi ngoại lệ: chỉ gửi học sinh KHÁC "Có mặt". Học sinh đổi ngược lại "Có mặt"
  // phải bị loại khỏi entries, không gửi status: 'PRESENT' (tạo thừa document không cần thiết). Duyệt theo
  // TOÀN BỘ roster (không chỉ các studentId có trong `overrides`) vì 1 học sinh có thể đang LATE từ bản ghi đã
  // fetch (chưa hề bị sửa tay) nhưng vẫn phải có mặt trong entries khi lưu.
  async function handleSave() {
    setError(null);
    const rosterEntries = roster
      .map((student) => ({ studentId: student._id, status: statusOf(student._id) }))
      .filter((entry) => entry.status !== 'PRESENT');
    // Roster chỉ gồm học sinh ACTIVE — học sinh đã chuyển lớp vẫn có thể có bản ghi ngoại lệ của ngày này
    // (vd LATE trước khi chuyển đi). PUT là "thay thế toàn bộ" nên nếu không mang theo, backend sẽ hiểu là
    // "xoá ngoại lệ của học sinh đó" và xoá mất lịch sử thật (CLAUDE.md: "giữ lịch sử" khi học sinh chuyển đi).
    const rosterIds = new Set(roster.map((student) => String(student._id)));
    const carriedOverEntries = (attendanceRecords ?? [])
      .filter((record) => !rosterIds.has(String(record.studentId)))
      .map((record) => ({ studentId: String(record.studentId), status: record.status }));
    const entries = [...rosterEntries, ...carriedOverEntries];
    try {
      await markAttendance({ positionId: effectiveWritingPositionId, classId, date, entries }).unwrap();
    } catch (err) {
      setError(err?.data?.message ?? 'Lưu điểm danh thất bại, vui lòng thử lại');
    }
  }

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Điểm danh</h1>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="diem-danh-date">Ngày</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDate((d) => shiftDate(d, -1))}>
              Lùi 1 ngày
            </Button>
            <Input
              id="diem-danh-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="w-auto"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => setDate((d) => shiftDate(d, 1))}>
              Tiến 1 ngày
            </Button>
          </div>
        </div>

        {needsPositionPicker && !isReadOnlyView && (
          <div>
            <Label htmlFor="diem-danh-writing-position">Đang thao tác với vị trí</Label>
            <NativeSelect
              id="diem-danh-writing-position"
              value={effectiveWritingPositionId}
              onChange={(event) => setWritingPositionId(event.target.value)}
            >
              {myPositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {positionLabel(p)}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}

        {canViewOtherPositions && (
          <div>
            <Label htmlFor="diem-danh-view-position">Xem vị trí khác</Label>
            <NativeSelect
              id="diem-danh-view-position"
              value={viewPositionId}
              onChange={(event) => setViewPositionId(event.target.value)}
            >
              <option value="">Vị trí của tôi</option>
              {viewablePositions.map((p) => (
                <option key={p.id} value={p.id}>
                  {positionLabel(p)}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </div>

      <Card className="mt-4 flex flex-wrap gap-4 p-4">
        <span className="w-full text-sm font-medium text-fg-muted">Điểm danh chính thức của lớp (GVCN)</span>
        {STATUS_OPTIONS.map((opt) => (
          <span key={opt.value} className="text-sm">
            {opt.label}: <span className="font-mono">{summary?.[opt.value] ?? 0}</span>
          </span>
        ))}
      </Card>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {attendanceIsError && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>
            {attendanceError?.data?.message ?? 'Không tải được dữ liệu điểm danh'}
          </AlertDescription>
        </Alert>
      )}

      {studentsLoading ? (
        <p className="mt-4 text-sm text-fg-muted">Đang tải...</p>
      ) : (
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>STT</TableHead>
                <TableHead>Họ tên</TableHead>
                <TableHead>Trạng thái</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roster.map((student, index) => {
                const status = statusOf(student._id);
                const activeOption = STATUS_BY_VALUE.get(status);
                return (
                  <TableRow key={student._id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{student.fullName}</TableCell>
                    <TableCell>
                      {isReadOnlyView ? (
                        <Badge variant={activeOption?.variant}>{activeOption?.label}</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {STATUS_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              aria-pressed={status === opt.value}
                              onClick={() => handleStatusChange(student._id, opt.value)}
                              className={cn(
                                badgeVariants({ variant: opt.variant }),
                                status === opt.value ? 'ring-2 ring-offset-1' : 'opacity-40',
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {!isReadOnlyView && !attendanceIsError && (
        <div className="mt-4">
          <Button type="button" onClick={handleSave} disabled={isSaving}>
            Lưu điểm danh
          </Button>
        </div>
      )}
    </div>
  );
}
