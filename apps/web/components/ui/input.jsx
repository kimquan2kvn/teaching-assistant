import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-fg',
        'focus:outline-none focus:ring-2 focus:ring-brand',
        className,
      )}
      {...props}
    />
  );
});
