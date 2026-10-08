import { forwardRef } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-brand text-black hover:bg-brand-hover',
        outline: 'border border-border bg-transparent text-fg hover:bg-black/5',
        ghost: 'bg-transparent text-fg hover:bg-black/5',
      },
      size: {
        default: 'h-10 px-4 text-sm',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export const Button = forwardRef(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
});
