'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSelector } from 'react-redux';
import { cn } from '@/lib/utils';
import { selectCurrentUser } from '@/lib/store/auth-slice';
import { NAV_GROUPS } from './nav-data';

export function Sidebar({ className }) {
  const pathname = usePathname();
  const currentUser = useSelector(selectCurrentUser);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || (currentUser && item.roles.includes(currentUser.role))),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className={cn('flex-col gap-6 bg-sidebar-bg p-4 text-sidebar-fg', className)}>
      {visibleGroups.map(({ group, items }) => (
        <div key={group} className="mb-6">
          <p className="mb-2 px-2 text-xs font-semibold uppercase text-fg-muted">{group}</p>
          <ul className="flex flex-col gap-1">
            {items.map(({ label, href, icon: Icon }) => {
              const isActive = href === pathname;
              return (
                <li key={label}>
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-2 rounded-md border-l-2 border-transparent px-2 py-1.5 text-sm',
                      isActive
                        ? 'border-brand text-sidebar-active-fg'
                        : 'text-sidebar-fg hover:text-sidebar-active-fg',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
