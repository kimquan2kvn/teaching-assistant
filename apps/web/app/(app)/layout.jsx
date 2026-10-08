import { Sidebar } from '@/components/layout/sidebar';
import { MobileNav } from '@/components/layout/mobile-nav';
import { SearchBox } from '@/components/layout/search-box';
import { UserMenu } from '@/components/layout/user-menu';

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar className="hidden md:flex md:w-64 md:shrink-0" />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-border p-4">
          <MobileNav />
          <div className="max-w-sm flex-1">
            <SearchBox />
          </div>
          <UserMenu />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
