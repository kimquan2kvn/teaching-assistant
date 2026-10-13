'use client';

import { Menu as MenuIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetTrigger, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Sidebar } from './sidebar';

export function MobileNav() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mở menu" className="md:hidden [&_svg]:size-5">
          <MenuIcon className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 border-0 bg-sidebar-bg p-0 text-sidebar-fg">
        <SheetTitle className="sr-only">Menu điều hướng</SheetTitle>
        <Sidebar className="flex" />
      </SheetContent>
    </Sheet>
  );
}
