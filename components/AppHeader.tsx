"use client";

import { Settings, Sun, Moon, CloudOff, RefreshCw, Archive } from "lucide-react";
import TripMark from "./TripMark";
import { useTheme } from "./theme";
import { useUI } from "./ui";
import { useStore } from "./store";

/** Shows only when something needs saying: no network, or writes still
 *  sitting in the outbox waiting for one. */
function SyncPill() {
  const { online, pending, configured } = useStore();
  if (!configured) return null;
  if (online && !pending) return null;
  return (
    <span className={`sync-pill ${online ? "busy" : "off"}`}>
      {online ? <RefreshCw size={13} /> : <CloudOff size={13} />}
      {online
        ? `Saving ${pending}`
        : pending
        ? `Offline · ${pending}`
        : "Offline"}
    </span>
  );
}

export default function AppHeader({ title }: { title: string }) {
  const { theme, toggle } = useTheme();
  const { archived } = useStore();
  const { openSettings } = useUI();
  return (
    <header className="app-head">
      <div className="brand">
        <span className="logo">
          <TripMark size={19} />
        </span>
        {title}
        {archived && (
          <button className="arc-pill" onClick={openSettings}>
            <Archive size={12} /> ARCHIVED
          </button>
        )}
      </div>
      <div className="head-actions">
        <SyncPill />
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
