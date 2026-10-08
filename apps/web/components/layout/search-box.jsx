import { SearchIcon } from '@/components/icons/search-icon';
import { Input } from '@/components/ui/input';

// value/onChange/placeholder đều TUỲ CHỌN để không phá chỗ gọi hiện có (header, không truyền gì) — khi có
// value/onChange, input trở thành component có kiểm soát (không dùng state nội bộ), dùng lại được cho ô tìm
// nhanh danh mục vi phạm.
export function SearchBox({ value, onChange, placeholder = 'Tìm kiếm...' }) {
  return (
    <div className="relative">
      <SearchIcon
        data-testid="search-icon"
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
      />
      <Input placeholder={placeholder} value={value} onChange={onChange} className="pl-9" />
    </div>
  );
}
