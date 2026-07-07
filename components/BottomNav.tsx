"use client";

import { LayoutGrid, Map, CalendarRange, Users } from "lucide-react";
import type { Tab } from "./types";

const tabs: { id: Tab; label: string; Icon: typeof Map }[] = [
  { id: "dashboard", label: "Dashboard", Icon: LayoutGrid },
  { id: "map", label: "Map", Icon: Map },
  { id: "itinerary", label: "Trip Plan", Icon: CalendarRange },
  { id: "group", label: "Group", Icon: Users },
];

export default function BottomNav({
  active,
  onChange,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="tabbar">
      {tabs.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`tab ${active === id ? "active" : ""}`}
          onClick={() => onChange(id)}
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
