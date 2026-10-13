'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useCreateClassMutation } from '@/lib/store/classes-api';
import { Input } from '@/components/ui/input';
import { Button, buttonVariants } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function TaoLopPage() {
  const [name, setName] = useState('');
  const [claimHomeroom, setClaimHomeroom] = useState(false);
  const [error, setError] = useState(null);
  const [createdClass, setCreatedClass] = useState(null);
  const [createClass, { isLoading }] = useCreateClassMutation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    try {
      const result = await createClass({ name, claimHomeroom }).unwrap();
      setCreatedClass(result.class);
    } catch (err) {
      setError(err?.data?.message ?? 'Tạo lớp thất bại, vui lòng thử lại');
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(createdClass.code);
  }

  if (createdClass) {
    return (
      <div className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <h1 className="font-heading text-xl font-semibold">Đã tạo lớp</h1>
        <p className="text-sm text-fg-muted">Mã lớp của bạn</p>
        <p className="text-4xl font-bold tracking-wide">{createdClass.code}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={handleCopy}>
            Sao chép
          </Button>
          <Link href={`/lop-hoc/${createdClass._id}`} className={buttonVariants({})}>
            Xem lớp
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto mt-24 flex max-w-sm flex-col gap-4 px-4">
      <h1 className="font-heading text-xl font-semibold">Tạo lớp mới</h1>
      <Input
        placeholder="Tên lớp"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id="claimHomeroom"
          checked={claimHomeroom}
          onCheckedChange={(checked) => setClaimHomeroom(checked === true)}
        />
        <Label htmlFor="claimHomeroom" className="mb-0">
          Bạn có phải GVCN lớp này không?
        </Label>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isLoading}>
        Tạo lớp
      </Button>
    </form>
  );
}
