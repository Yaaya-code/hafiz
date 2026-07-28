import { cn } from "@/lib/utils";

export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  return (
    <div
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#9a7b2c] to-[#D4AF37] text-sm font-semibold text-[#020408] shadow-[0_0_16px_rgba(212,175,55,0.35)] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110",
        className
      )}
    >
      {initials}
    </div>
  );
}
