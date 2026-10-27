import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-brand text-white hover:bg-brand-dark active:scale-[0.98]',
        secondary:
          'bg-olive text-white hover:bg-olive-dark active:scale-[0.98]',
        outline:
          'border border-ink/15 bg-transparent text-ink hover:border-ink/40 hover:bg-bg-surface',
        ghost: 'text-ink hover:bg-sand/60',
        link: 'text-brand underline-offset-4 hover:underline',
        destructive:
          'bg-danger text-white hover:bg-danger/90 active:scale-[0.98]',
        accent:
          'bg-accent text-white hover:bg-accent-dark active:scale-[0.98]',
        /** The quiet primary: charcoal, turns terracotta on hover. */
        ink: 'bg-ink text-white hover:bg-brand active:scale-[0.98]',
      },
      size: {
        sm: 'h-8 px-3.5 text-xs',
        default: 'h-10 px-5',
        lg: 'h-12 px-7 text-base',
        xl: 'h-14 px-8 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
