import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-fg',
        'focus:outline-none focus:ring-2 focus:ring-brand',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
