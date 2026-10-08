import {
  LayoutDashboard,
  School,
  Users,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  AlertTriangle,
  NotebookText,
  ListChecks,
  Settings,
} from 'lucide-react';

export const NAV_GROUPS = [
  {
    group: 'Tổng quan',
    items: [{ label: 'Bảng điều khiển', href: '/', icon: LayoutDashboard }],
  },
  {
    group: 'Nền tảng',
    items: [
      { label: 'Lớp học', href: '/dang-phat-trien', icon: School },
      { label: 'Học sinh', href: '/dang-phat-trien', icon: Users },
    ],
  },
  {
    group: 'Kế hoạch dạy học',
    items: [
      { label: 'Phân phối chương trình', href: '/dang-phat-trien', icon: BookOpen },
      { label: 'Thời khóa biểu', href: '/dang-phat-trien', icon: CalendarDays },
    ],
  },
  {
    group: 'Lớp học hằng ngày',
    items: [
      { label: 'Điểm danh', href: '/dang-phat-trien', icon: ClipboardCheck },
      { label: 'Vi phạm & điểm cộng', href: '/dang-phat-trien', icon: AlertTriangle },
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
    items: [{ label: 'Cài đặt', href: '/dang-phat-trien', icon: Settings }],
  },
];
