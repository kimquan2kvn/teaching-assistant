import { SearchIcon } from '@/components/icons/search-icon';
import { Input } from '@/components/ui/input';

export function SearchBox() {
  return (
    <div className="relative">
      <SearchIcon
        data-testid="search-icon"
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted"
      />
      <Input placeholder="Tìm kiếm..." className="pl-9" />
    </div>
  );
}
