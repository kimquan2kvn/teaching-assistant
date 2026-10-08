import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Textarea = forwardRef(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'min-h-[80px] w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-fg',
        'focus:outline-none focus:ring-2 focus:ring-brand',
        className,
      )}
      {...props}
    />
  );
});
