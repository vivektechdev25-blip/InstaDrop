import { HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  // Defaults true - the hover lift/shadow/border polish applies to every
  // Card site-wide (FeatureList's grid, HowItWorks's steps) since it's
  // fixed here at the shared primitive rather than per usage. Opt out for
  // cards that display fetched/result content rather than inviting a
  // click (PreviewCard) - a hover-lift there reads as a stray UI glitch,
  // not an interaction cue, since the card itself isn't clickable.
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  function Card({ className, interactive = true, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 ease-out",
          interactive && "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
          className
        )}
        {...props}
      />
    );
  }
);

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
    );
  }
);

export const CardTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn("text-h3 tracking-tight", className)}
        {...props}
      />
    );
  }
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return (
      <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
    );
  }
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />;
  }
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...props }, ref) {
    return (
      <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
    );
  }
);
