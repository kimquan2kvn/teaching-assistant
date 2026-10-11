import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      success: 'bg-success-soft text-success',
      danger: 'bg-danger-soft text-danger',
      muted: 'bg-black/5 text-fg-muted',
    },
  },
  defaultVariants: {
    variant: 'muted',
  },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
