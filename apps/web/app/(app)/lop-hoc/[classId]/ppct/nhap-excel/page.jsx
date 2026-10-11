'use client';

import { memo, useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { Trash2 } from 'lucide-react';
import { PPCT_IMPORT_HEADERS } from '@so-chu-nhiem/shared';
import { useGetClassDetailQuery } from '@/lib/store/classes-api';
import { useImportPpctPreviewMutation, useImportPpctCommitMutation } from '@/lib/store/ppct-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { toCommitRow, validatePpctRow } from '@/lib/ppct';
import { apiErrorMessage, canEditPosition, cn } from '@/lib/utils';
import { RoleGate } from '@/components/layout/role-gate';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const [HEADER_WEEK, HEADER_TITLE, HEADER_PERIOD_COUNT, HEADER_PERIOD_LABEL, HEADER_REQUIREMENT, HEADER_NOTE] =
  PPCT_IMPORT_HEADERS;

// Thứ tự ô = thứ tự cột của file mẫu. Chuỗi class phải viết nguyên văn ở đây: Tailwind chỉ quét app/ và components/.
const CELLS = [
  { field: 'week', header: HEADER_WEEK, widthClass: 'w-20', isNumeric: true },
  { field: 'title', header: HEADER_TITLE, widthClass: 'min-w-[16rem]' },
  { field: 'periodCount', header: HEADER_PERIOD_COUNT, widthClass: 'w-24', isNumeric: true },
  { field: 'periodLabel', header: HEADER_PERIOD_LABEL, widthClass: 'w-28' },
  { field: 'requirement', header: HEADER_REQUIREMENT, widthClass: 'min-w-[16rem]' },
  { field: 'note', header: HEADER_NOTE, widthClass: 'min-w-[12rem]' },
];

// Kèm positionId để quay về đúng môn vừa nhập: người giữ nhiều môn trong lớp, hoặc ADMIN, không bị đưa sang môn khác.
function ppctPageHref(classId, positionId) {
  const base = `/lop-hoc/${classId}/ppct`;
  return positionId ? `${base}?positionId=${encodeURIComponent(positionId)}` : base;
}

// Ô nhập luôn là chuỗi: preview trả week/periodCount là số hoặc null (ô sai trong file), người dùng gõ vào là chuỗi.
function toEditableRow(previewRow) {
  const text = (value) => (value === null || value === undefined ? '' : String(value));
  return {
    rowNumber: previewRow.rowNumber,
    week: text(previewRow.week),
    title: text(previewRow.title),
    periodCount: text(previewRow.periodCount),
    periodLabel: text(previewRow.periodLabel),
    requirement: text(previewRow.requirement),
    note: text(previewRow.note),
    serverErrors: previewRow.errors ?? [],
  };
}

// Dòng chưa sửa: lỗi do backend báo (nguồn đúng). Dòng đã sửa: backend chưa thấy giá trị mới nên tiền kiểm ở client
// (validatePpctRow, cùng thông điệp với backend); commit vẫn bị backend kiểm lại.
function getRowErrors(row, isEdited) {
  return isEdited ? validatePpctRow(row) : row.serverErrors;
}

// memo + callback ổn định từ trang: gõ vào 1 ô chỉ vẽ lại đúng dòng đó (file tới 500 dòng x 6 ô).
const PreviewRow = memo(function PreviewRow({ row, isEdited, onCellChange, onDelete }) {
  const errors = getRowErrors(row, isEdited);
  const hasErrors = errors.length > 0;
  const errorsId = `ppct-row-${row.rowNumber}-errors`;

  return (
    <>
      <tr className={hasErrors ? 'bg-danger-soft' : 'border-b border-border'}>
        <td className="px-2 py-1 font-mono text-fg-muted">{row.rowNumber}</td>
        {CELLS.map(({ field, header, widthClass, isNumeric }) => (
          <td key={field} className={cn('px-1 py-1', widthClass)}>
            <Input
              aria-label={`${header} (dòng ${row.rowNumber})`}
              aria-describedby={hasErrors ? errorsId : undefined}
              inputMode={isNumeric ? 'numeric' : undefined}
              className={cn('h-9 px-2', isNumeric && 'font-mono')}
              value={row[field]}
              onChange={(event) => onCellChange(row.rowNumber, field, event.target.value)}
            />
          </td>
        ))}
        <td className="px-1 py-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(row.rowNumber)}>
            <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
            Xóa dòng
          </Button>
        </td>
      </tr>
      {hasErrors && (
        <tr className="border-b border-border bg-danger-soft">
          <td colSpan={CELLS.length + 2} className="px-2 pb-2">
            <ul id={errorsId} className="text-xs text-danger">
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
});

function ImportPpctWizard({ classId, positionId, subject, classLabel }) {
  const [file, setFile] = useState(null);
  // null = chưa xem trước. Mỗi dòng giữ số dòng trong file (rowNumber) làm khóa: xóa dòng không làm lệch dòng khác.
  const [rows, setRows] = useState(null);
  const [editedRowNumbers, setEditedRowNumbers] = useState(() => new Set());
  const [previewError, setPreviewError] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [importedCount, setImportedCount] = useState(null);
  const isCommittingRef = useRef(false);
  const [importPreview, { isLoading: isPreviewing }] = useImportPpctPreviewMutation();
  const [importCommit, { isLoading: isConfirming }] = useImportPpctCommitMutation();

  // Lỗi tính ở mỗi lần vẽ, không lưu state: tránh lệch với giá trị đang nhập.
  const errorRowCount = rows
    ? rows.filter((row) => getRowErrors(row, editedRowNumbers.has(row.rowNumber)).length > 0).length
    : 0;
  const canConfirm = rows !== null && rows.length > 0 && errorRowCount === 0 && !isConfirming;

  const handleCellChange = useCallback((rowNumber, field, value) => {
    setRows((current) => current.map((row) => (row.rowNumber === rowNumber ? { ...row, [field]: value } : row)));
    setEditedRowNumbers((current) => (current.has(rowNumber) ? current : new Set(current).add(rowNumber)));
  }, []);

  const handleDeleteRow = useCallback((rowNumber) => {
    setRows((current) => current.filter((row) => row.rowNumber !== rowNumber));
  }, []);

  async function handlePreviewSubmit(event) {
    event.preventDefault();
    if (!file) return;
    setPreviewError(null);
    setConfirmError(null);
    try {
      const result = await importPreview({ positionId, file }).unwrap();
      setRows(result.rows.map(toEditableRow));
      setEditedRowNumbers(new Set());
    } catch (err) {
      setRows(null);
      setPreviewError(apiErrorMessage(err, 'Đọc file thất bại, vui lòng thử lại'));
    }
  }

  async function handleConfirm() {
    // Chặn ngay trong handler: isLoading của hook chỉ cập nhật ở lần vẽ kế tiếp, mà commit lặp sẽ nhân đôi toàn bộ PPCT
    // (backend nối thêm vào cuối, không chống trùng nội dung).
    if (!canConfirm || isCommittingRef.current) return;
    isCommittingRef.current = true;
    setConfirmError(null);
    try {
      const created = await importCommit({ positionId, rows: rows.map((row) => toCommitRow(row)) }).unwrap();
      setImportedCount(created.length);
    } catch (err) {
      // Giữ nguyên bảng và các ô đã sửa: người dùng chỉnh tiếp hoặc thử lại, không phải chọn lại file.
      setConfirmError(apiErrorMessage(err, 'Xác nhận nhập thất bại, vui lòng thử lại'));
    } finally {
      isCommittingRef.current = false;
    }
  }

  if (importedCount !== null) {
    return (
      <div className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <h1 className="font-heading text-xl font-semibold">Đã nhập {importedCount} mục PPCT</h1>
        <Link href={ppctPageHref(classId, positionId)} className={buttonVariants({})}>
          Về trang PPCT
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-heading text-xl font-semibold">Nhập PPCT từ Excel</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Môn {subject} · Lớp {classLabel}
      </p>
      <p className="mt-4 text-sm text-fg-muted">Dòng 1 là tiêu đề. Các cột: {PPCT_IMPORT_HEADERS.join(', ')}</p>
      <p className="mt-1 text-sm text-fg-muted">Các dòng nhập sẽ được thêm vào cuối PPCT hiện có.</p>

      <form onSubmit={handlePreviewSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="ppct-import-file">Chọn file Excel</Label>
          <input
            id="ppct-import-file"
            type="file"
            accept=".xlsx"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="submit" disabled={!file || isPreviewing}>
          Xem trước
        </Button>
      </form>

      {previewError && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {previewError}
        </p>
      )}

      {rows && (
        <div className="mt-6">
          {rows.length === 0 ? (
            <p className="text-sm text-fg-muted">Không có dòng nào để nhập</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-fg-muted">
                    <th className="px-2 py-2 font-medium">Dòng</th>
                    {CELLS.map(({ field, header, widthClass }) => (
                      <th key={field} className={cn('px-2 py-2 font-medium', widthClass)}>
                        {header}
                      </th>
                    ))}
                    <th className="px-2 py-2">
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <PreviewRow
                      key={row.rowNumber}
                      row={row}
                      isEdited={editedRowNumbers.has(row.rowNumber)}
                      onCellChange={handleCellChange}
                      onDelete={handleDeleteRow}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errorRowCount > 0 && (
            <p className="mt-4 text-sm text-danger">Còn {errorRowCount} dòng lỗi, hãy sửa hoặc xóa trước khi nhập</p>
          )}
          {confirmError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {confirmError}
            </p>
          )}
          <Button type="button" className="mt-4" disabled={!canConfirm} onClick={handleConfirm}>
            Xác nhận nhập
          </Button>
        </div>
      )}
    </div>
  );
}

function BlockedView({ title, backHref }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      <Link href={backHref} className={buttonVariants({ variant: 'outline', className: 'mt-4' })}>
        Về trang PPCT
      </Link>
    </div>
  );
}

function ClassLoadError({ error }) {
  let message;
  if (error?.status === 403) message = 'Bạn không có quyền xem lớp này';
  else if (error?.status === 404) message = 'Không tìm thấy lớp';
  else message = apiErrorMessage(error, 'Không tải được thông tin lớp, vui lòng thử lại');

  return (
    <div className="p-6">
      <h1 className="font-heading text-xl font-semibold">{message}</h1>
    </div>
  );
}

// Quyền ở đây chỉ để ẩn/hiện giao diện; backend (PositionOwnerGuard SELF) vẫn là nơi chặn thật.
function ImportPpctAccess({ classId, positionId }) {
  const currentUser = useSelector(selectCurrentUser);
  // Chưa có positionId thì trang không làm được gì: bỏ qua query lớp thay vì gọi API vô ích.
  const { data: detail, isError, error } = useGetClassDetailQuery(classId, { skip: !positionId });

  if (!positionId) {
    return <BlockedView title="Chưa chọn môn để nhập PPCT" backHref={ppctPageHref(classId, '')} />;
  }
  // Chỉ báo lỗi khi chưa có dữ liệu nào: refetch lỗi vẫn giữ data cũ, mà thay cả trang bằng màn lỗi sẽ làm mất
  // bảng đang sửa.
  if (!detail) return isError ? <ClassLoadError error={error} /> : <p className="p-6 text-fg-muted">Đang tải...</p>;

  const position = detail.positions.find((candidate) => candidate.id === positionId);
  if (!canEditPosition(position, currentUser)) {
    return (
      <BlockedView
        title="Bạn không có quyền nhập PPCT cho môn này"
        backHref={ppctPageHref(classId, positionId)}
      />
    );
  }

  // key theo môn: đổi positionId trên URL phải bỏ bảng xem trước của môn cũ, vì commit luôn ghi vào môn đang chọn.
  return (
    <ImportPpctWizard
      key={positionId}
      classId={classId}
      positionId={positionId}
      subject={position.subject}
      classLabel={detail.class.name}
    />
  );
}

export default function ImportPpctPage({ params, searchParams }) {
  // Next trả mảng khi positionId lặp trên URL: coi như chưa chọn môn.
  const positionId = typeof searchParams?.positionId === 'string' ? searchParams.positionId : '';

  return (
    <RoleGate roles={['TEACHER', 'ADMIN']}>
      <ImportPpctAccess classId={params.classId} positionId={positionId} />
    </RoleGate>
  );
}
