import {
  ShoppingBag,
  Utensils,
  Ticket,
  Bed,
  Car,
  Receipt,
  type LucideIcon,
} from "lucide-react";

export type CategoryId =
  | "gear"
  | "food"
  | "fees"
  | "stay"
  | "travel"
  | "other";

export const CATEGORIES: {
  id: CategoryId;
  label: string;
  Icon: LucideIcon;
}[] = [
  { id: "gear", label: "Gear", Icon: ShoppingBag },
  { id: "food", label: "Food", Icon: Utensils },
  { id: "fees", label: "Fees", Icon: Ticket },
  { id: "stay", label: "Stay", Icon: Bed },
  { id: "travel", label: "Travel", Icon: Car },
  { id: "other", label: "Other", Icon: Receipt },
];

export const catIcon = (id: CategoryId): LucideIcon =>
  CATEGORIES.find((c) => c.id === id)?.Icon ?? Receipt;

export const catLabel = (id: CategoryId): string =>
  CATEGORIES.find((c) => c.id === id)?.label ?? "Other";

// Member avatar palette
export const MEMBER_COLORS = [
  "#2e7d32",
  "#8e5a2e",
  "#3a5f7d",
  "#7d3a5f",
  "#5f7d3a",
  "#b0822e",
  "#3a7d6f",
  "#6f3a7d",
];

export const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const money = (n: number, symbol = "৳"): string =>
  symbol +
  Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const timeAgo = (ts: number): string => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

export const fmtDateTime = (ts: number): string =>
  new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
