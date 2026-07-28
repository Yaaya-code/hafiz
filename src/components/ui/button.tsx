import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-95 active:shadow-inner",
    "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]",
    "relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:bg-gradient-to-tr after:from-transparent after:via-white/10 after:to-transparent after:translate-x-[-100%] hover:after:translate-x-[100%] after:transition-transform after:duration-700"
  ),
  {
    variants: {
      variant: {
        default:
          "bg-[#D4AF37] text-[#020408] font-semibold shadow-[0_0_20px_rgba(212,175,55,0.55)] ring-1 ring-[#D4AF37]/50 hover:-translate-y-2 hover:scale-[1.03] hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.5)] hover:bg-[#f0d78c]",
        secondary:
          "bg-[#0A0F1A] text-[#CBD5E1] border border-[#D4AF37]/15 hover:-translate-y-1 hover:scale-[1.02] hover:border-[#D4AF37]/40 hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.35)]",
        outline:
          "border border-[#D4AF37]/20 bg-transparent text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.5)] hover:bg-[#D4AF37]/10 hover:border-[#D4AF37] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)] hover:-translate-y-1 hover:scale-[1.02]",
        ghost:
          "hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] hover:drop-shadow-[0_0_8px_rgba(212,175,55,0.8)]",
        destructive:
          "bg-[#D4AF37] text-[#020408] hover:scale-[1.03] hover:shadow-[0_0_20px_rgba(212,175,55,0.5)]",
        premium:
          "bg-gradient-to-l from-[#9a7b2c] via-[#D4AF37] to-[#f0d78c] text-[#020408] font-bold shadow-[0_0_20px_rgba(212,175,55,0.55)] ring-1 ring-[#D4AF37]/40 hover:-translate-y-2 hover:scale-[1.03] hover:shadow-[0_15px_40px_-10px_rgba(212,175,55,0.55)]",
        soft: "bg-[#D4AF37]/10 border border-[#D4AF37] text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold shadow-[0_0_20px_rgba(212,175,55,0.5)] ring-1 ring-[#D4AF37]/50 backdrop-blur-md hover:-translate-y-1 hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(212,175,55,0.65)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-2xl px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
