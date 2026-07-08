"use client";

import { useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import type { ConfirmReq } from "./ui";

export default function ConfirmModal({
  req,
  onSettle,
}: {
  req: ConfirmReq;
  onSettle: (v: boolean) => void;
}) {
  const danger = !!req.danger;

  // Esc cancels, Enter confirms.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSettle(false);
      if (e.key === "Enter") onSettle(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSettle]);

  return (
    <div className="confirm-overlay" onClick={() => onSettle(false)}>
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <span className={`confirm-ico ${danger ? "danger" : ""}`}>
          {danger ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
        </span>
        <h3 className="confirm-title">{req.title}</h3>
        {req.message && <p className="confirm-msg">{req.message}</p>}
        <div className="confirm-actions">
          <button className="confirm-btn ghost" onClick={() => onSettle(false)}>
            {req.cancelLabel || "Cancel"}
          </button>
          <button
            className={`confirm-btn ${danger ? "danger" : "primary"}`}
            onClick={() => onSettle(true)}
            autoFocus
          >
            {req.confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
