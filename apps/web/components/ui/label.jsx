import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

export const Label = forwardRef(function Label({ className, ...props }, ref) {
  return (
    <label ref={ref} className={cn('mb-1 block text-sm font-medium text-fg', className)} {...props} />
  );
});
