import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        /** The main action: a black pill that turns lime under the pointer. */
        default:
          'bg-ink text-white hover:bg-lime hover:text-ink active:scale-[0.98]',
        /** The quiet second action: a grey pill. */
        secondary:
          'bg-mist text-ink hover:bg-mist-dark active:scale-[0.98]',
        outline:
          'border border-ink/15 bg-bg-surface text-ink hover:border-ink',
        ghost: 'text-ink hover:bg-mist',
        link: 'text-ink underline decoration-lime decoration-[3px] underline-offset-4 hover:decoration-ink',
        destructive:
          'bg-danger text-white hover:bg-danger/90 active:scale-[0.98]',
        /** The lime call — the one thing on a screen that should be pressed. */
        accent:
          'bg-lime text-ink hover:bg-ink hover:text-lime active:scale-[0.98]',
        /** The same black pill as the default (kept as a name the pages already use). */
        ink: 'bg-ink text-white hover:bg-lime hover:text-ink active:scale-[0.98]',
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
