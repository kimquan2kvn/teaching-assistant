'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useDeletePpctItemMutation, useGetPositionPpctQuery } from '@/lib/store/ppct-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { PpctItemDialog } from '@/components/schedule/ppct-item-dialog';
import { useSelectedPosition } from '@/components/schedule/use-selected-position';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { getPeriodKind } from '@/lib/ppct';
import { apiErrorMessage, canEditPosition, cn, getReadableSubjectPositions } from '@/lib/utils';

// Yêu cầu cần đạt và Ghi chú dài nên ẩn dưới md (điện thoại); người sửa được vẫn xem/sửa đủ qua hộp thoại.
const LONG_COLUMN = 'hidden md:table-cell';

const DELETE_WARNING = 'Xóa mục PPCT sẽ xóa luôn buổi báo giảng tương ứng (kể cả buổi đã tích "Đã thực hiện").';

function classErrorTitle(error) {
  if (error?.status === 403) return 'Bạn không có quyền xem lớp này';
  if (error?.status === 404) return 'Không tìm thấy lớp';
  return apiErrorMessage(error, 'Không tải được thông tin lớp, vui lòng thử lại');
}

function PeriodLabel({ label }) {
  const kind = getPeriodKind(label);
  return (
    <span className="inline-flex items-center gap-2">
      {kind && <Badge>{kind}</Badge>}
      <span className="font-mono">{label}</span>
    </span>
  );
}

function PpctTable({ items, canEdit, onEdit, onDelete }) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-fg-muted">
            <th className="py-2 pr-4">Tuần</th>
            <th className="py-2 pr-4">Bài học</th>
            <th className="py-2 pr-4">Số tiết</th>
            <th className="py-2 pr-4">Tiết thứ</th>
            <th className={cn('py-2 pr-4', LONG_COLUMN)}>Yêu cầu cần đạt</th>
            <th className={cn('py-2 pr-4', LONG_COLUMN)}>Ghi chú</th>
            {canEdit && <th className="py-2 pr-4">Hành động</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item._id} className="border-t border-border align-top">
              <td className="py-2 pr-4 font-mono">{item.week}</td>
              <td className="py-2 pr-4">{item.title}</td>
              <td className="py-2 pr-4 font-mono">{item.periodCount}</td>
              <td className="py-2 pr-4">
                <PeriodLabel label={item.periodLabel} />
              </td>
              <td className={cn('whitespace-pre-line py-2 pr-4', LONG_COLUMN)}>{item.requirement}</td>
              <td className={cn('whitespace-pre-line py-2 pr-4', LONG_COLUMN)}>{item.note}</td>
              {canEdit && (
                <td className="py-2 pr-4">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => onEdit(item)}>
                      Sửa
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-danger"
                      onClick={() => onDelete(item)}
                    >
                      Xóa
                    </Button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Lỗi tải PPCT thay thế hẳn bảng: bảng rỗng hay "Chưa có mục PPCT nào" lúc đang lỗi dễ bị hiểu nhầm là chưa có dữ liệu.
function PpctContent({ items, isError, error, canEdit, onEdit, onDelete }) {
  if (isError) {
    return (
      <p role="alert" className="mt-4 text-sm text-danger">
        {apiErrorMessage(error, 'Không tải được PPCT, vui lòng thử lại')}
      </p>
    );
  }
  if (items === undefined) {
    return <p className="mt-4 text-sm text-fg-muted">Đang tải...</p>;
  }
  if (items.length === 0) {
    return <p className="mt-4 text-sm text-fg-muted">Chưa có mục PPCT nào</p>;
  }
  return <PpctTable items={items} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} />;
}

function DeletePpctItemDialog({ positionId, item, onClose }) {
  const [deletePpctItem] = useDeletePpctItemMutation();
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setIsDeleting(true);
    try {
      await deletePpctItem({ positionId, itemId: item._id }).unwrap();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, 'Xóa mục PPCT thất bại, vui lòng thử lại'));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle>Xóa mục PPCT?</DialogTitle>
        <p className="mt-2 text-sm">
          Mục: <span className="font-medium">{item.title}</span>
        </p>
        <p className="mt-2 text-sm text-fg-muted">{DELETE_WARNING}</p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Huỷ
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirm} disabled={isDeleting}>
            Xác nhận xóa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PpctPage({ params, searchParams }) {
  const { classId } = params;
  const currentUser = useSelector(selectCurrentUser);
  // null = đóng; { item } = sửa mục đó; {} = thêm mới.
  const [formDialog, setFormDialog] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);

  const { data: detail, isLoading, isError, error } = useGetClassDetailQuery(classId);
  const positions = useMemo(
    () => getReadableSubjectPositions(detail?.positions, currentUser),
    [detail, currentUser],
  );
  const { positionId, position, setPositionId } = useSelectedPosition({
    positions,
    currentUser,
    initialId: searchParams?.positionId,
  });
  // currentData (không phải data): trong lúc tải môn mới, RTK Query vẫn giữ `data` của môn cũ — hiện nó sẽ bày PPCT
  // môn này dưới tên môn kia, kèm nút Sửa/Xóa gửi nhầm positionId.
  const {
    currentData: items,
    isError: ppctIsError,
    error: ppctError,
  } = useGetPositionPpctQuery(positionId, { skip: !positionId });

  if (isError) {
    return (
      <div className="p-6">
        <h1 className="font-heading text-xl font-semibold">{classErrorTitle(error)}</h1>
      </div>
    );
  }

  // currentUser rỗng = Providers đang khôi phục phiên (chưa biết, không phải "chưa giữ môn nào").
  if (isLoading || !detail || !currentUser) {
    return <div className="p-6 text-fg-muted">Đang tải...</div>;
  }

  const canEdit = canEditPosition(position, currentUser);

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Phân phối chương trình</h1>
          <p className="text-sm text-fg-muted">Lớp {detail.class.name}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => setFormDialog({})}>
              Thêm mục PPCT
            </Button>
            <Link
              href={`/lop-hoc/${classId}/ppct/nhap-excel?positionId=${positionId}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Nhập từ Excel
            </Link>
          </div>
        )}
      </div>

      {positions.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">Bạn chưa giữ môn nào trong lớp này</p>
      ) : (
        <>
          <div className="mt-4 max-w-xs">
            {positions.length > 1 ? (
              <>
                <Label htmlFor="ppct-position">Môn</Label>
                <Select id="ppct-position" value={positionId} onChange={(event) => setPositionId(event.target.value)}>
                  {positions.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.subject}
                    </option>
                  ))}
                </Select>
              </>
            ) : (
              <p className="text-sm">
                <span className="text-fg-muted">Môn: </span>
                <span className="font-medium">{position.subject}</span>
              </p>
            )}
          </div>

          {canEdit && <p className="mt-2 text-sm text-fg-muted">Mục mới luôn được thêm vào cuối PPCT.</p>}

          <PpctContent
            items={items}
            isError={ppctIsError}
            error={ppctError}
            canEdit={canEdit}
            onEdit={(item) => setFormDialog({ item })}
            onDelete={setItemToDelete}
          />
        </>
      )}

      {formDialog && (
        <PpctItemDialog
          open
          onOpenChange={(open) => !open && setFormDialog(null)}
          positionId={positionId}
          item={formDialog.item}
        />
      )}
      {itemToDelete && (
        <DeletePpctItemDialog positionId={positionId} item={itemToDelete} onClose={() => setItemToDelete(null)} />
      )}
    </div>
  );
}
