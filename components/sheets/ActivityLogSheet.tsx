"use client";

import { History, Plus, Pencil, Trash2 } from "lucide-react";
import { fmtDateTime } from "../constants";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";

const actionMeta = {
  created: { Icon: Plus, cls: "created", label: "Added" },
  updated: { Icon: Pencil, cls: "updated", label: "Edited" },
  deleted: { Icon: Trash2, cls: "deleted", label: "Deleted" },
} as const;

export default function ActivityLogSheet() {
  const { state } = useStore();
  const money = useMoney();
  const { close } = useUI();
  const log = [...state.audit].sort((a, b) => b.at - a.at);

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>Activity Log</h2>
        <p className="sub-line">
          Every add, edit and delete is recorded here — full history.
        </p>

        {log.length === 0 ? (
          <div className="empty">
            <History size={28} />
            <p>No activity yet.</p>
          </div>
        ) : (
          <div className="scroll-list">
            {log.map((e) => {
              const m = actionMeta[e.action];
              return (
                <div className="log-row" key={e.id}>
                  <span className={`log-ico ${m.cls}`}>
                    <m.Icon size={15} />
                  </span>
                  <div className="a-info">
                    <div className="a-top">
                      <span className="a-name">
                        {m.label} · {e.title}
                      </span>
                      <span className="a-amt num">{money(e.amount)}</span>
                    </div>
                    <div className="a-sub">
                      {fmtDateTime(e.at)}
                      {e.changes && e.changes.length > 0 && (
                        <>
                          {" · "}
                          {e.changes.map((c) => c.field).join(", ")} changed
                        </>
                      )}
                    </div>
                    {(e.by || e.device || e.tz) && (
                      <div className="log-origin">
                        {e.by && <b>{e.by}</b>}
                        {[e.device, e.tz].filter(Boolean).map((x, i) => (
                          <span key={x}>{i > 0 || e.by ? " · " : ""}{x}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
