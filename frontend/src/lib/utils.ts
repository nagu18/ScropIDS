import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatRelative(iso?: string | null): string {
  if (!iso) {
    return "Never";
  }
  const value = new Date(iso);
  const diffMs = Date.now() - value.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) {
    return "Just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function threatColor(level: string): string {
  const normalized = level.toLowerCase();
  if (normalized === "critical" || normalized === "high") return "bg-danger/20 text-danger border-danger/50";
  if (normalized === "medium" || normalized === "warning") return "bg-warning/20 text-warning border-warning/50";
  return "bg-safe/20 text-safe border-safe/50";
}
