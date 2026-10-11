'use client';

import Link from 'next/link';
import { useSelector } from 'react-redux';
import { useGetMyPositionsQuery } from '@/lib/store/positions-api';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { RoleGate } from '@/components/layout/role-gate';
import { getSubjectColor } from '@/components/schedule/subject-colors';
import { buttonVariants } from '@/components/ui/button';
import { apiErrorMessage, cn } from '@/lib/utils';

const LOAD_ERROR_FALLBACK = 'Không tải được danh sách môn, vui lòng thử lại';

// 3 trang theo môn-lớp; mỗi trang đọc ?positionId= để mở đúng vị trí vừa chọn ở đây.
const SUBJECT_DESTINATIONS = [
  { label: 'Phân phối chương trình', segment: 'ppct' },
  { label: 'Khai báo tiết', segment: 'thoi-khoa-bieu' },
  { label: 'Sổ báo giảng', segment: 'so-bao-giang' },
];

function SubjectCard({ position }) {
  const { class: klass } = position;
  return (
    <li className="rounded-lg border border-border p-4">
      <h2 className="font-heading text-lg font-semibold">{klass.name}</h2>
      <p className="mt-1 flex items-center gap-2 text-sm">
        <span
          aria-hidden="true"
          className={cn('h-2.5 w-2.5 shrink-0 rounded-full', getSubjectColor(position.subject).dot)}
        />
        <span className="font-medium text-fg">{position.subject}</span>
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {SUBJECT_DESTINATIONS.map(({ label, segment }) => (
          <Link
            key={segment}
            href={`/lop-hoc/${klass.id}/${segment}?positionId=${position.id}`}
            className={buttonVariants({ variant: 'outline' })}
          >
            {label}
          </Link>
        ))}
      </div>
    </li>
  );
}

function HomeroomHint() {
  return (
    <p className="mt-4 text-sm text-fg-muted">
      Để xem PPCT các môn trong lớp chủ nhiệm, mở{' '}
      <Link href="/lop-hoc" className="font-medium text-brand underline">
        Lớp học
      </Link>
      , chọn lớp rồi vào thẻ &quot;Phân phối chương trình&quot;.
    </p>
  );
}

function NoSubjectState({ hasHomeroom }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      <p className="text-lg font-semibold">Bạn chưa giữ môn nào</p>
      <p className="mt-2 text-fg-muted">Tham gia lớp bằng mã lớp và chọn môn bạn dạy để bắt đầu.</p>
      <div className="mt-4">
        <Link href="/lop-hoc/tham-gia" className={buttonVariants({ variant: 'default' })}>
          Tham gia bằng mã lớp
        </Link>
      </div>
      {hasHomeroom && <HomeroomHint />}
    </div>
  );
}

function SubjectListSkeleton() {
  return (
    <div role="status" aria-label="Đang tải danh sách môn" className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((key) => (
        <div key={key} className="h-40 animate-pulse rounded-lg bg-black/5" />
      ))}
    </div>
  );
}

function TeacherSubjects() {
  const { data: positions, isLoading, error } = useGetMyPositionsQuery();

  if (isLoading) return <SubjectListSkeleton />;

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {apiErrorMessage(error, LOAD_ERROR_FALLBACK)}
      </p>
    );
  }

  const allPositions = positions ?? [];
  const subjectPositions = allPositions.filter((position) => position.type === 'SUBJECT');

  if (subjectPositions.length === 0) {
    const hasHomeroom = allPositions.some((position) => position.type === 'HOMEROOM');
    return <NoSubjectState hasHomeroom={hasHomeroom} />;
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {subjectPositions.map((position) => (
        <SubjectCard key={position.id} position={position} />
      ))}
    </ul>
  );
}

function AdminGuide() {
  return (
    <p className="rounded-lg border border-border p-4 text-sm text-fg-muted">
      Quản trị viên mở PPCT của từng môn từ trang chi tiết lớp (Quản lý giáo viên → chọn giáo viên → Xem lớp).
    </p>
  );
}

function PageContent() {
  const currentUser = useSelector(selectCurrentUser);

  return (
    <div className="p-6">
      <h1 className="font-heading text-2xl font-semibold">Phân phối chương trình</h1>
      <div className="mt-6">
        {/* ADMIN không giữ vị trí nào: TeacherSubjects (gọi /positions/mine) phải là component riêng để hook của
            nó không bao giờ chạy với ADMIN — không thể gọi hook có điều kiện trong cùng một component. */}
        {currentUser?.role === 'TEACHER' ? <TeacherSubjects /> : <AdminGuide />}
      </div>
    </div>
  );
}

export default function PhanPhoiChuongTrinhPage() {
  return (
    <RoleGate roles={['TEACHER', 'ADMIN']}>
      <PageContent />
    </RoleGate>
  );
}
