'use client';

import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  useGetConductCatalogQuery,
  useCreateConductCatalogItemMutation,
  useUpdateConductCatalogItemMutation,
} from '@/lib/store/conduct-catalog-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';

const KIND_LABEL = { VIOLATION: 'Vi phạm', MERIT: 'Điểm cộng' };

function CreateItemDialog({ open, onOpenChange }) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState('VIOLATION');
  const [points, setPoints] = useState('');
  const [specialRule, setSpecialRule] = useState('');
  const [error, setError] = useState(null);
  const [createConductCatalogItem] = useCreateConductCatalogItemMutation();

  // Đồng bộ lại form mỗi khi dialog MỞ — không giữ dữ liệu của lần mở trước (đúng pattern
  // student-form-dialog.jsx đã dùng).
  useEffect(() => {
    if (!open) return;
    setLabel('');
    setKind('VIOLATION');
    setPoints('');
    setSpecialRule('');
    setError(null);
  }, [open]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    try {
      await createConductCatalogItem({
        label,
        kind,
        points: Number(points),
        ...(specialRule ? { specialRule } : {}),
      }).unwrap();
      onOpenChange?.(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Thêm mục danh mục thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Thêm mục danh mục</DialogTitle>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <Label htmlFor="catalog-item-label">Nhãn</Label>
            <Input id="catalog-item-label" value={label} onChange={(event) => setLabel(event.target.value)} required />
          </div>
          <div className="mb-4">
            <Label htmlFor="catalog-item-kind">Loại</Label>
            <Select id="catalog-item-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="VIOLATION">Vi phạm</option>
              <option value="MERIT">Điểm cộng</option>
            </Select>
          </div>
          <div className="mb-4">
            <Label htmlFor="catalog-item-points">Điểm</Label>
            <Input
              id="catalog-item-points"
              type="number"
              min="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="catalog-item-special-rule">Luật đặc biệt (tuỳ chọn)</Label>
            <Select
              id="catalog-item-special-rule"
              value={specialRule}
              onChange={(event) => setSpecialRule(event.target.value)}
            >
              <option value="">Không có</option>
              <option value="HOMEWORK_NOT_DONE">Không làm bài tập về nhà</option>
            </Select>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Huỷ
              </Button>
            </DialogClose>
            <Button type="submit">Lưu</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleActiveDialog({ item, onOpenChange }) {
  const [error, setError] = useState(null);
  const [updateConductCatalogItem] = useUpdateConductCatalogItemMutation();

  async function handleConfirm() {
    setError(null);
    try {
      await updateConductCatalogItem({ id: item._id, isActive: !item.isActive }).unwrap();
      onOpenChange?.(false);
    } catch (err) {
      setError(err?.data?.message ?? 'Thao tác thất bại, vui lòng thử lại');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{item.isActive ? 'Ẩn mục danh mục này?' : 'Hiện lại mục danh mục này?'}</DialogTitle>
        <p className="text-sm text-fg-muted">{item.label}</p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Huỷ
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleConfirm}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DanhMucViPhamPage() {
  const currentUser = useSelector(selectCurrentUser);
  const isAdmin = currentUser?.role === 'ADMIN';
  const { data: catalog, isLoading, isError } = useGetConductCatalogQuery();
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);

  if (isLoading) {
    return <p className="p-6 text-sm text-fg-muted">Đang tải...</p>;
  }

  if (isError) {
    return <p className="p-6 text-sm text-danger">Không tải được danh mục vi phạm/điểm cộng</p>;
  }

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-heading text-2xl font-semibold">Danh mục vi phạm & điểm cộng</h1>
        {isAdmin && (
          <Button type="button" onClick={() => setCreateFormOpen(true)}>
            Thêm mới
          </Button>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="py-2 pr-4">Nhãn</th>
              <th className="py-2 pr-4">Loại</th>
              <th className="py-2 pr-4">Điểm</th>
              <th className="py-2 pr-4">Trạng thái</th>
              {isAdmin && <th className="py-2 pr-4">Hành động</th>}
            </tr>
          </thead>
          <tbody>
            {(catalog ?? []).map((item) => (
              <tr key={item._id} className="border-t border-border">
                <td className="py-2 pr-4">{item.label}</td>
                <td className="py-2 pr-4">{KIND_LABEL[item.kind] ?? item.kind}</td>
                <td className="py-2 pr-4 font-mono">{item.points}</td>
                <td className="py-2 pr-4">
                  <Badge variant={item.isActive ? 'success' : 'danger'}>
                    {item.isActive ? 'Đang dùng' : 'Đã ẩn'}
                  </Badge>
                </td>
                {isAdmin && (
                  <td className="py-2 pr-4">
                    <Button type="button" size="sm" variant="outline" onClick={() => setToggleTarget(item)}>
                      {item.isActive ? 'Ẩn' : 'Hiện'}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createFormOpen && <CreateItemDialog open onOpenChange={setCreateFormOpen} />}
      {toggleTarget && (
        <ToggleActiveDialog item={toggleTarget} onOpenChange={(open) => !open && setToggleTarget(null)} />
      )}
    </div>
  );
}
