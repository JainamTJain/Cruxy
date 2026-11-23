import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cardinal/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-cardinal text-white hover:bg-[#861c2d]",
        secondary: "bg-ink text-white hover:bg-black",
        gold: "bg-gold text-ink hover:brightness-95",
        outline:
          "border border-ink/15 bg-white/70 text-ink hover:bg-white",
        ghost: "text-ink hover:bg-ink/5",
      },
      size: {
        default: "min-h-11 h-11 px-5",
        sm: "min-h-11 h-11 px-3 text-xs",
        lg: "min-h-12 h-12 px-6 text-base",
        key: "min-h-14 h-14 w-full text-lg font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
