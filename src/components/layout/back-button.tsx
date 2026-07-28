"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type BackButtonProps = {
  /** Fallback when history is empty */
  href?: string;
  label?: string;
  className?: string;
  /** Prefer history.back() when possible */
  preferHistory?: boolean;
};

/**
 * Arabic RTL back / exit control for inner pages.
 * Uses ← and returns to previous page or dashboard.
 */
export function BackButton({
  href = "/dashboard",
  label = "رجوع",
  className,
  preferHistory = true,
}: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    if (preferHistory && typeof window !== "undefined") {
      // history.length is not always reliable; try back then fallback
      if (window.history.length > 1) {
        router.back();
        return;
      }
    }
    router.push(href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className
      )}
      aria-label={label}
    >
      <span className="text-base leading-none" aria-hidden>
        ←
      </span>
      <span>{label}</span>
    </button>
  );
}

/**
 * Page title row with back control — use at top of inner screens.
 */
export function PageHeader({
  title,
  description,
  backHref = "/dashboard",
  backLabel = "رجوع",
  actions,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackButton href={backHref} label={backLabel} />
        {actions}
      </div>
      <div>
        {typeof title === "string" ? (
          <h1 className="text-2xl font-bold">{title}</h1>
        ) : (
          title
        )}
        {description && (
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}
