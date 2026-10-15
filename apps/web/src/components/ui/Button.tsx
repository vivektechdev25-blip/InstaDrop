import { ButtonHTMLAttributes, forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // The logo's pink-to-violet, with white text in both themes (the
        // --cta-* stops are tuned for that). Disabled keeps the brand colour
        // rather than fading to a washed-out lilac - the main action should
        // still read as the main action before a link is pasted - and drops
        // the glow so it is clearly not yet active. No desaturation: over
        // the dark theme's near-black that turned the gradient maroon.
        default:
          "bg-cta-gradient text-white shadow-glow hover:shadow-glow-lg hover:brightness-110 disabled:opacity-70 disabled:shadow-none",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-transparent hover:border-primary/40 hover:bg-primary/5",
        ghost: "hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 hover:shadow-md",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-3 text-sm",
        lg: "h-12 px-8 text-base",
        // 44px, not 40px - confirmed live that a 40x40 icon button falls
        // short of the WCAG 2.5.5 / Apple HIG 44x44 touch-target minimum
        // (Lighthouse's own accessibility audit only requires 24x24, so
        // passing that didn't catch this).
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, asChild = false, ...props }, ref) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
