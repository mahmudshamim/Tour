"use client";

import { Settings, Sun, Moon } from "lucide-react";
import TripMark from "./TripMark";
import { useTheme } from "./theme";
import { useUI } from "./ui";

export default function AppHeader({ title }: { title: string }) {
  const { theme, toggle } = useTheme();
  const { openSettings } = useUI();
  return (
    <header className="app-head">
      <div className="brand">
        <span className="logo">
          <TripMark size={19} />
        </span>
        {title}
      </div>
      <div className="head-actions">
        <button className="icon-btn" onClick={toggle} aria-label="Toggle theme">
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        <button
          className="icon-btn"
          onClick={openSettings}
          aria-label="Settings"
        >
          <Settings size={19} />
        </button>
      </div>
    </header>
  );
}
