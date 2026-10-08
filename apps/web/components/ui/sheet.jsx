'use client';

import { forwardRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;
export const SheetTitle = Dialog.Title;

const sideClasses = {
  left: 'left-0 top-0 h-full w-72 data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left',
  right:
    'right-0 top-0 h-full w-72 data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right',
};

export const SheetContent = forwardRef(function SheetContent(
  { side = 'left', className, children, ...props },
  ref,
) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <Dialog.Content
        ref={ref}
        className={cn('fixed z-50 overflow-y-auto bg-white shadow-lg', sideClasses[side], className)}
        {...props}
      >
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
});
