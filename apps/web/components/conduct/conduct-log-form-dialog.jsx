'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { MAX_VIOLATION_POINTS, MAX_MERIT_POINTS } from '@so-chu-nhiem/shared';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { SearchBox } from '@/components/layout/search-box';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useGetStudentsQuery } from '@/lib/store/students-api';
import { useGetConductCatalogQuery } from '@/lib/store/conduct-catalog-api';
import { useCreateConductLogMutation } from '@/lib/store/conduct-log-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { cn, formatDate, getMyPositionsInClass } from '@/lib/utils';

function positionLabel(position) {
  return position.type === 'HOMEROOM' ? 'Chủ nhiệm' : position.subject;
}

// Dùng chung cho component dùng chung mount từ trang "vi-pham": tự fetch mọi dữ liệu nó cần (chi tiết lớp,
// roster đang học, danh mục) thay vì nhận qua props, để trang gọi nó chỉ cần truyền đúng classId.
export function ConductLogFormDialog({ open, onOpenChange, classId }) {
  const currentUser = useSelector(selectCurrentUser);
  const { data: classDetail } = useGetClassDetailQuery(classId);
  const { data: students } = useGetStudentsQuery({ classId, status: 'ACTIVE' });
  const { data: catalog } = useGetConductCatalogQuery();
  const [createConductLog] = useCreateConductLogMutation();

  const myPositions = useMemo(
    () => getMyPositionsInClass(classDetail?.positions, currentUser),
    [classDetail, currentUser],
  );

  const [tab, setTab] = useState('catalog');
  const [studentId, setStudentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [search, setSearch] = useState('');
  const [catalogItemId, setCatalogItemId] = useState('');
  const [note, setNote] = useState('');
  const [kind, setKind] = useState('VIOLATION');
  const [points, setPoints] = useState('');
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Reset toàn bộ state mỗi khi dialog MỞ — tránh giữ lại dữ liệu/lựa chọn của lần mở trước khi dialog được
  // tái dùng (y hệt lý do student-form-dialog.jsx đồng bộ lại state theo `open`).
  useEffect(() => {
    if (!open) return;
    setTab('catalog');
    setStudentId('');
    setSearch('');
    setCatalogItemId('');
    setNote('');
    setKind('VIOLATION');
    setPoints('');
    setError(null);
    setResult(null);
  }, [open]);

  // Mặc định vị trí ghi là HOMEROOM nếu có trong các vị trí mình giữ, khớp đúng logic Bước 2 (điểm danh).
  useEffect(() => {
    if (!open) return;
    if (myPositions.length === 0) return;
    const homeroom = myPositions.find((p) => p.type === 'HOMEROOM');
    setPositionId((homeroom ?? myPositions[0]).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, myPositions.length]);

  const filteredCatalog = useMemo(() => {
    const list = catalog ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter((item) => item.label.toLowerCase().includes(query));
  }, [catalog, search]);

  const maxPoints = kind === 'VIOLATION' ? MAX_VIOLATION_POINTS : MAX_MERIT_POINTS;
  const pointsNum = Number(points);
  const pointsExceeded = tab === 'custom' && points !== '' && pointsNum > maxPoints;

  const canSubmit =
    Boolean(studentId) &&
    Boolean(positionId) &&
    (tab === 'catalog'
      ? Boolean(catalogItemId)
      : Boolean(points) && pointsNum > 0 && !pointsExceeded && Boolean(note.trim()));

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    const body =
      tab === 'catalog'
        ? { studentId, catalogItemId, ...(note.trim() ? { note: note.trim() } : {}) }
        : { studentId, kind, points: pointsNum, note };
    try {
      const response = await createConductLog({ positionId, classId, ...body }).unwrap();
      if (response.punishments?.length > 0) {
        setResult(response);
      } else {
        onOpenChange?.(false);
      }
    } catch (err) {
      setError(err?.data?.message ?? 'Ghi nhận thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ghi nhận vi phạm / điểm cộng</DialogTitle>
        </DialogHeader>

        {result ? (
          <div>
            <Alert variant="destructive" role="status">
              <AlertDescription>
                <p className="font-medium">Đã tự tạo {result.punishments.length} chép phạt</p>
                <ul className="mt-1 list-disc pl-4">
                  {result.punishments.map((p) => (
                    <li key={p._id}>
                      {p.lines} dòng — hạn nộp {formatDate(p.dueDate)}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange?.(false)}>
                Đóng
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <Label htmlFor="conduct-log-student">Học sinh</Label>
              <NativeSelect
                id="conduct-log-student"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                required
              >
                <option value="">-- Chọn học sinh --</option>
                {(students ?? []).map((student) => (
                  <option key={student._id} value={student._id}>
                    {student.fullName}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {myPositions.length > 1 && (
              <div className="mb-4">
                <Label htmlFor="conduct-log-position">Vị trí ghi</Label>
                <NativeSelect
                  id="conduct-log-position"
                  value={positionId}
                  onChange={(event) => setPositionId(event.target.value)}
                >
                  {myPositions.map((position) => (
                    <option key={position.id} value={position.id}>
                      {positionLabel(position)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            <div className="mb-4 flex gap-2">
              <Button
                type="button"
                variant={tab === 'catalog' ? 'default' : 'outline'}
                aria-pressed={tab === 'catalog'}
                onClick={() => setTab('catalog')}
              >
                Từ danh mục
              </Button>
              <Button
                type="button"
                variant={tab === 'custom' ? 'default' : 'outline'}
                aria-pressed={tab === 'custom'}
                onClick={() => setTab('custom')}
              >
                Khác
              </Button>
            </div>

            {tab === 'catalog' ? (
              <div className="mb-4">
                <SearchBox
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Tìm trong danh mục..."
                />
                <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
                  {filteredCatalog.map((item) => (
                    <li key={item._id}>
                      <button
                        type="button"
                        aria-pressed={catalogItemId === item._id}
                        onClick={() => setCatalogItemId(item._id)}
                        className={cn(
                          'w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-black/5',
                          catalogItemId === item._id && 'border-brand bg-brand-soft',
                        )}
                      >
                        {item.label} ({item.kind === 'VIOLATION' ? '-' : '+'}
                        {item.points})
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <Label htmlFor="conduct-log-catalog-note">Ghi chú (tuỳ chọn)</Label>
                  <Textarea
                    id="conduct-log-catalog-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="mb-4 flex flex-col gap-4">
                <div>
                  <Label htmlFor="conduct-log-kind">Loại</Label>
                  <NativeSelect id="conduct-log-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
                    <option value="VIOLATION">Vi phạm</option>
                    <option value="MERIT">Điểm cộng</option>
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor="conduct-log-points">Điểm</Label>
                  <Input
                    id="conduct-log-points"
                    type="number"
                    min="1"
                    value={points}
                    onChange={(event) => setPoints(event.target.value)}
                    required
                  />
                  {pointsExceeded && (
                    <p className="mt-1 text-sm text-danger">
                      Điểm vượt quá giới hạn cho phép ({kind === 'VIOLATION' ? 'vi phạm' : 'điểm cộng'} tối đa{' '}
                      {maxPoints})
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="conduct-log-custom-note">Ghi chú</Label>
                  <Textarea
                    id="conduct-log-custom-note"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Huỷ
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!canSubmit}>
                Ghi nhận
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
