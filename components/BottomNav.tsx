"use client";

import type { CSSProperties } from "react";
import { LayoutGrid, Map, CalendarRange, Users, Luggage } from "lucide-react";
import type { Tab } from "./types";

const tabs: { id: Tab; label: string; Icon: typeof Map }[] = [
  { id: "tours", label: "Tours", Icon: Luggage },
  { id: "dashboard", label: "Overview", Icon: LayoutGrid },
  { id: "map", label: "Map", Icon: Map },
  { id: "itinerary", label: "Plan", Icon: CalendarRange },
  { id: "group", label: "Group", Icon: Users },
];

export default function BottomNav({
  active,
  onChange,
  noTrip,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  /** nothing to show inside a tour yet → only Tours is useful */
  noTrip?: boolean;
}) {
  const idx = tabs.findIndex((t) => t.id === active);
  return (
    <nav
      className="tabbar"
      style={{ "--idx": idx < 0 ? 0 : idx } as CSSProperties}
    >
      <span className="tab-indicator" />
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`tab ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
          disabled={noTrip && id !== "tours"}
        >
          <span className="tab-ico">
            <Icon size={21} strokeWidth={active === id ? 2.4 : 2} />
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}
