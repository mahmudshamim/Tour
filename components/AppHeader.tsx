"use client";

import {
  Settings,
  Sun,
  Moon,
  CloudOff,
  RefreshCw,
  Archive,
  Lock,
  LockOpen,
} from "lucide-react";
import TripMark from "./TripMark";
import { useTheme } from "./theme";
import { useUI } from "./ui";
import { useStore } from "./store";

/** Shows only when something needs saying: no network, or writes still
 *  sitting in the outbox waiting for one (or for an unlock). */
function SyncPill() {
  const { online, pending, configured, writeStatus } = useStore();
  const { openUnlock } = useUI();
  if (!configured) return null;
  if (online && !pending) return null;
  if (online && pending && writeStatus === "locked") {
    return (
      <button className="sync-pill off" onClick={() => openUnlock()}>
        <Lock size={13} /> {pending} waiting
      </button>
    );
  }
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

/** View-only ↔ editing. Locking is one tap + confirm; unlocking asks
 *  for the password. Hidden when there's no server to enforce it. */
function LockButton() {
  const { configured, canEdit, lock } = useStore();
  const { openUnlock, confirm, toast } = useUI();
  if (!configured) return null;
  if (!canEdit) {
    return (
      <button
        className="icon-btn"
        onClick={() => openUnlock()}
        aria-label="View only — unlock editing"
        title="View only — tap to unlock editing"
      >
        <Lock size={18} />
      </button>
    );
  }
  const onLock = async () => {
    const ok = await confirm({
      title: "Lock editing?",
      message:
        "This device goes back to view-only. Unlocking again needs the password and an internet connection — keep it unlocked for trips with no signal.",
      confirmLabel: "Lock",
    });
    if (!ok) return;
    await lock();
    toast("Locked — view only");
  };
  return (
    <button
      className="icon-btn unlocked"
      onClick={onLock}
      aria-label="Editing unlocked — tap to lock"
      title="Editing unlocked — tap to lock"
    >
      <LockOpen size={18} />
    </button>
  );
}

export default function AppHeader({
  title,
  tourScoped = true,
}: {
  title: string;
  /** false on screens that aren't about the open tour (the Tours hub) */
  tourScoped?: boolean;
}) {
  const { theme, toggle } = useTheme();
  const { archived } = useStore();
  const { openSettings } = useUI();
  return (
    <header className="app-head">
      <div className="brand">
        <span className="logo">
          <TripMark size={19} />
        </span>
        <span className="brand-title">{title}</span>
        {archived && tourScoped && (
          <button className="arc-pill" onClick={openSettings}>
            <Archive size={12} /> ARCHIVED
          </button>
        )}
      </div>
      <div className="head-actions">
        <SyncPill />
        <LockButton />
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
