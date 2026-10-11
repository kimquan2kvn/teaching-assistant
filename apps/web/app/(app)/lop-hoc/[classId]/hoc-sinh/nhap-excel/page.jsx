'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useImportPreviewMutation, useImportConfirmMutation } from '@/lib/store/students-api';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';

export default function NhapExcelPage({ params }) {
  const { classId } = params;
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [importedCount, setImportedCount] = useState(null);
  const [importPreview, { isLoading: isPreviewing }] = useImportPreviewMutation();
  const [importConfirm, { isLoading: isConfirming }] = useImportConfirmMutation();

  // Chưa có preview thì coi như "còn lỗi" để nút Xác nhận không thể bấm trước khi có dữ liệu.
  const hasErrorRows = rows ? rows.some((row) => row.errors.length > 0) : true;

  async function handlePreviewSubmit(e) {
    e.preventDefault();
    if (!file) return;
    setPreviewError(null);
    setConfirmError(null);
    try {
      const result = await importPreview({ classId, file }).unwrap();
      setRows(result.rows);
    } catch (err) {
      setRows(null);
      setPreviewError(err?.data?.message ?? 'Đọc file thất bại, vui lòng thử lại');
    }
  }

  async function handleConfirm() {
    setConfirmError(null);
    try {
      const result = await importConfirm({
        classId,
        rows: rows.map((row) => ({ fullName: row.fullName, dob: row.dob })),
      }).unwrap();
      setImportedCount(result.length);
    } catch (err) {
      // KHÔNG setRows(null) ở đây: dữ liệu đã sửa đổi giữa lúc preview và confirm (hiếm, race condition) khiến
      // confirm bị từ chối, nhưng người dùng vẫn cần thấy lại bảng preview để biết dòng nào đã nhập để sửa tiếp,
      // thay vì phải chọn lại file từ đầu.
      setConfirmError(err?.data?.message ?? 'Xác nhận nhập thất bại, vui lòng thử lại');
    }
  }

  // Không có hệ thống toast trong dự án này. Thay vì điều hướng ngay (mất thông báo "đã nhập bao nhiêu học
  // sinh") hoặc tự chế cơ chế hẹn giờ rồi điều hướng (thêm độ phức tạp + dễ flaky trong test), màn này hiện
  // màn hình thành công tại chỗ kèm link sang roster — giống đúng khuôn mẫu `/lop-hoc/tao-moi` đã làm (hiện kết
  // quả + nút "Xem lớp" thay vì tự động điều hướng).
  if (importedCount !== null) {
    return (
      <div className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <h1 className="font-heading text-xl font-semibold">Đã nhập {importedCount} học sinh</h1>
        <Link href={`/lop-hoc/${classId}/hoc-sinh`} className={buttonVariants({})}>
          Xem danh sách học sinh
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-heading text-xl font-semibold">Nhập học sinh từ Excel</h1>

      <form onSubmit={handlePreviewSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="import-file">Chọn file Excel</Label>
          <input
            id="import-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button type="submit" disabled={!file || isPreviewing}>
          Xem trước
        </Button>
      </form>

      {previewError && <p className="mt-2 text-sm text-danger">{previewError}</p>}

      {rows && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-fg-muted">
                <th className="py-2 font-medium">Dòng</th>
                <th className="py-2 font-medium">Họ tên</th>
                <th className="py-2 font-medium">Ngày sinh</th>
                <th className="py-2 font-medium">Lỗi</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowHasErrors = row.errors.length > 0;
                return (
                  <tr
                    key={row.rowNumber}
                    className={rowHasErrors ? 'border-b border-border bg-danger-soft' : 'border-b border-border'}
                  >
                    <td className="py-2">{row.rowNumber}</td>
                    <td className="py-2">{row.fullName}</td>
                    <td className="py-2">{formatDate(row.dob) || '—'}</td>
                    <td className="py-2">
                      {rowHasErrors && (
                        <ul className="text-danger">
                          {row.errors.map((message) => (
                            <li key={message}>{message}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {confirmError && <p className="mt-2 text-sm text-danger">{confirmError}</p>}

          <Button type="button" className="mt-4" disabled={hasErrorRows || isConfirming} onClick={handleConfirm}>
            Xác nhận nhập
          </Button>
        </div>
      )}
    </div>
  );
}
