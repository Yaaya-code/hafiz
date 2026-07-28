import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatArabicNumber(n: number): string {
  return new Intl.NumberFormat("ar-EG").format(n);
}

export function formatPercent(n: number): string {
  return `${formatArabicNumber(Math.round(n))}%`;
}
