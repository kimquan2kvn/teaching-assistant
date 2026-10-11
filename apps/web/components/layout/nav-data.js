import {
  LayoutDashboard,
  School,
  Users,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  AlertTriangle,
  NotebookPen,
  NotebookText,
  ListChecks,
  Settings,
  UserCog,
  Award,
  FileText,
  Tags,
} from 'lucide-react';

export const NAV_GROUPS = [
  {
    group: 'Tổng quan',
    items: [{ label: 'Bảng điều khiển', href: '/', icon: LayoutDashboard }],
  },
  {
    group: 'Nền tảng',
    items: [
      { label: 'Lớp học', href: '/lop-hoc', icon: School, roles: ['TEACHER', 'ADMIN'] },
      { label: 'Học sinh', href: '/lop-hoc', icon: Users, roles: ['TEACHER', 'ADMIN'] },
    ],
  },
  {
    group: 'Kế hoạch dạy học',
    // TKB và sổ báo giảng theo giáo viên: backend (/timetable/me, /lesson-logs/week) chỉ cho TEACHER, ADMIN bị 403
    // nên không có mục ở đây — ADMIN xem theo lớp qua /lop-hoc/[classId]/{thoi-khoa-bieu,so-bao-giang}.
    items: [
      { label: 'Lịch năm học', href: '/lich-nam-hoc', icon: CalendarRange, roles: ['TEACHER', 'ADMIN'] },
      { label: 'Phân phối chương trình', href: '/phan-phoi-chuong-trinh', icon: BookOpen, roles: ['TEACHER', 'ADMIN'] },
      { label: 'Thời khóa biểu', href: '/thoi-khoa-bieu', icon: CalendarDays, roles: ['TEACHER'] },
      { label: 'Sổ báo giảng', href: '/so-bao-giang', icon: NotebookPen, roles: ['TEACHER'] },
    ],
  },
  {
    group: 'Lớp học hằng ngày',
    items: [
      { label: 'Điểm danh', href: '/lop-hoc', icon: ClipboardCheck, roles: ['TEACHER', 'ADMIN'] },
      { label: 'Vi phạm & điểm cộng', href: '/lop-hoc', icon: AlertTriangle, roles: ['TEACHER', 'ADMIN'] },
      { label: 'Xếp loại rèn luyện', href: '/lop-hoc', icon: Award, roles: ['TEACHER', 'ADMIN'] },
      { label: 'Chép phạt', href: '/lop-hoc', icon: FileText, roles: ['TEACHER', 'ADMIN'] },
    ],
  },
  {
    group: 'Học tập',
    items: [
      { label: 'Sổ điểm', href: '/dang-phat-trien', icon: NotebookText },
      { label: 'Bài tập', href: '/dang-phat-trien', icon: ListChecks },
    ],
  },
  {
    group: 'Khác',
    items: [
      { label: 'Cài đặt', href: '/dang-phat-trien', icon: Settings },
      { label: 'Quản lý giáo viên', href: '/quan-ly-giao-vien', icon: UserCog, roles: ['ADMIN'] },
      { label: 'Danh mục vi phạm', href: '/danh-muc-vi-pham', icon: Tags, roles: ['ADMIN'] },
    ],
  },
];
