'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUBJECTS } from '@so-chu-nhiem/shared';
import { useLazyGetClassByCodeQuery } from '@/lib/store/classes-api';
import { useJoinPositionMutation } from '@/lib/store/positions-api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Backend trả 409 khi 2 giáo viên cùng nhận 1 vị trí đúng lúc race (findOneAndUpdate nguyên tử phía service) —
// phải phân biệt nhánh này khỏi các lỗi khác để tự làm mới danh sách taken/trống thay vì để người dùng bấm lại
// vào 1 lựa chọn đã bị người khác nhận trước đó.
const CONFLICT_STATUS = 409;

export default function ThamGiaLopPage() {
  const [code, setCode] = useState('');
  const [classInfo, setClassInfo] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [joinError, setJoinError] = useState(null);

  const [lookupClassByCode, { isFetching: isLookingUp }] = useLazyGetClassByCodeQuery();
  const [joinPosition, { isLoading: isJoining }] = useJoinPositionMutation();
  const router = useRouter();

  async function fetchClassInfo(classCode) {
    try {
      const result = await lookupClassByCode(classCode).unwrap();
      setClassInfo(result);
      setLookupError(null);
      return result;
    } catch (err) {
      setClassInfo(null);
      setLookupError(err?.data?.message ?? 'Không tìm thấy lớp với mã này');
      return null;
    }
  }

  async function handleLookup(e) {
    e.preventDefault();
    setJoinError(null);
    setSelectedType(null);
    setSelectedSubject(null);
    await fetchClassInfo(code);
  }

  function selectHomeroom() {
    setSelectedType('HOMEROOM');
    setSelectedSubject(null);
  }

  function selectSubject(subject) {
    setSelectedType('SUBJECT');
    setSelectedSubject(subject);
  }

  async function handleJoin(e) {
    e.preventDefault();
    setJoinError(null);
    const payload =
      selectedType === 'HOMEROOM'
        ? { code, type: 'HOMEROOM' }
        : { code, type: 'SUBJECT', subject: selectedSubject };
    try {
      const position = await joinPosition(payload).unwrap();
      router.push(`/lop-hoc/${position.classId}`);
    } catch (err) {
      setJoinError(err?.data?.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
      // Bị người khác nhận trước đúng lúc race — danh sách taken/trống đang hiện đã cũ, phải tải lại ngay
      // và bắt người dùng chọn lại (không giữ lựa chọn cũ, có thể đã không còn hợp lệ).
      if (err?.status === CONFLICT_STATUS) {
        setSelectedType(null);
        setSelectedSubject(null);
        await fetchClassInfo(code);
      }
    }
  }

  const positions = classInfo?.positions ?? [];
  const homeroomPosition = positions.find((p) => p.type === 'HOMEROOM');
  const homeroomTaken = homeroomPosition?.taken ?? true;
  const subjectPositions = positions.filter((p) => p.type === 'SUBJECT');

  const canSubmit =
    classInfo != null &&
    (selectedType === 'HOMEROOM' || (selectedType === 'SUBJECT' && selectedSubject != null));

  return (
    <div className="mx-auto mt-16 flex max-w-xl flex-col gap-6 px-4">
      <h1 className="font-heading text-xl font-semibold">Tham gia bằng mã lớp</h1>

      <form onSubmit={handleLookup} className="flex gap-2">
        <Input placeholder="Mã lớp" value={code} onChange={(e) => setCode(e.target.value)} required />
        <Button type="submit" disabled={isLookingUp}>
          Tra cứu
        </Button>
      </form>
      {lookupError && <p className="text-sm text-danger">{lookupError}</p>}

      {classInfo && (
        <form onSubmit={handleJoin} className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            Lớp: <span className="font-medium text-fg">{classInfo.class.name}</span>
          </p>

          <button
            type="button"
            disabled={homeroomTaken}
            aria-pressed={selectedType === 'HOMEROOM'}
            onClick={selectHomeroom}
            className={cn(
              'rounded-md border border-border px-3 py-2 text-left text-sm',
              homeroomTaken ? 'cursor-not-allowed text-fg-muted opacity-50' : 'hover:bg-black/5',
              selectedType === 'HOMEROOM' && 'border-brand bg-brand-soft',
            )}
          >
            Làm GVCN
          </button>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SUBJECTS.map((subject) => {
              const position = subjectPositions.find((p) => p.subject === subject);
              const taken = position?.taken ?? false;
              const isSelected = selectedType === 'SUBJECT' && selectedSubject === subject;
              return (
                <button
                  key={subject}
                  type="button"
                  disabled={taken}
                  aria-pressed={isSelected}
                  onClick={() => selectSubject(subject)}
                  className={cn(
                    'rounded-md border border-border px-3 py-2 text-left text-sm',
                    taken ? 'cursor-not-allowed text-fg-muted opacity-50' : 'hover:bg-black/5',
                    isSelected && 'border-brand bg-brand-soft',
                  )}
                >
                  {subject}
                  {taken && <span className="ml-1 text-xs italic">Đã có người giữ</span>}
                </button>
              );
            })}
          </div>

          {joinError && <p className="text-sm text-danger">{joinError}</p>}

          <Button type="submit" disabled={!canSubmit || isJoining}>
            Tham gia
          </Button>
        </form>
      )}
    </div>
  );
}
