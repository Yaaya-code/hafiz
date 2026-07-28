import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-300",
  {
    variants: {
      variant: {
        default:
          "border border-[#D4AF37] bg-[#D4AF37] text-[#020408] shadow-[0_0_16px_rgba(212,175,55,0.5)]",
        secondary: "border-transparent bg-[#0A0F1A] text-[#CBD5E1]",
        outline: "text-[#CBD5E1] border-[#D4AF37]/20",
        success:
          "border border-[#D4AF37] bg-[#D4AF37]/10 text-[#D4AF37] drop-shadow-[0_0_8px_rgba(212,175,55,0.8)] font-semibold shadow-[0_0_20px_rgba(212,175,55,0.6)] ring-1 ring-[#D4AF37]/50 backdrop-blur-md",
        warning:
          "border border-[#D4AF37]/50 bg-[#D4AF37]/10 text-[#D4AF37] drop-shadow-[0_0_6px_rgba(212,175,55,0.6)] shadow-[0_0_14px_rgba(212,175,55,0.35)]",
        danger:
          "border border-[#D4AF37]/30 bg-[#D4AF37]/5 text-[#D4AF37] drop-shadow-[0_0_6px_rgba(212,175,55,0.5)]",
        muted: "border border-transparent bg-[#0A0F1A] text-[#CBD5E1]/70",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
