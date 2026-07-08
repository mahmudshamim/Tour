"use client";

import { Pencil, Trash2, ArrowRight } from "lucide-react";
import { catIcon, catLabel, fmtDateTime } from "../constants";
import { useStore, useMoney, type Txn } from "../store";
import { useUI } from "../ui";

export default function DetailSheet({ txn: initial }: { txn: Txn }) {
  const { state, deleteTxn, memberById } = useStore();
  const money = useMoney();
  const { close, openEdit, confirm } = useUI();

  // Always reflect latest version from store (may have been edited).
  const txn = state.txns.find((t) => t.id === initial.id) ?? initial;
  const history = state.audit
    .filter((a) => a.txnId === txn.id)
    .sort((a, b) => b.at - a.at);

  const Icon = catIcon(txn.category);
  const isGroup = txn.kind === "group";
  const chargedTo = memberById(txn.member);
  const perHead =
    isGroup && txn.split.length ? txn.amount / txn.split.length : 0;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${txn.title}”?`,
      message: "It stays in the activity log, but leaves your expense list.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (ok) {
      deleteTxn(txn.id);
      close();
    }
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />

        <div className="detail-head">
          <span className="a-ico big">
            <Icon size={22} />
          </span>
          <div>
            <div className="detail-title">{txn.title}</div>
            <div className="detail-cat">{catLabel(txn.category)}</div>
          </div>
          <div className="detail-amt num">{money(txn.amount)}</div>
        </div>

        <div className="detail-grid">
          <div className="dg-cell">
            <div className="q-lbl">Type</div>
            <div className="dg-val">
              <span className={`tag-pill ${isGroup ? "grp" : "per"}`}>
                {isGroup ? "GROUP" : "PERSONAL"}
              </span>
            </div>
          </div>
          {isGroup ? (
            <>
              <div className="dg-cell">
                <div className="q-lbl">Per person</div>
                <div className="dg-val num">{money(perHead)}</div>
              </div>
              <div className="dg-cell">
                <div className="q-lbl">Deducted from</div>
                <div className="dg-val">{txn.split.length} people</div>
              </div>
            </>
          ) : (
            <div className="dg-cell">
              <div className="q-lbl">Charged to</div>
              <div className="dg-val">
                <span
                  className="dot-avatar"
                  style={{ background: chargedTo?.color ?? "#555" }}
                />
                {chargedTo?.name ?? "—"}
              </div>
            </div>
          )}
          <div className="dg-cell">
            <div className="q-lbl">Created</div>
            <div className="dg-val">{fmtDateTime(txn.createdAt)}</div>
          </div>
        </div>

        <div className="split-title">History</div>
        <div className="hist">
          {history.map((h) => (
            <div className="hist-row" key={h.id}>
              <span className={`hist-dot ${h.action}`} />
              <div className="hist-body">
                <div className="hist-top">
                  <b>
                    {h.action === "created"
                      ? "Created"
                      : h.action === "updated"
                      ? "Edited"
                      : "Deleted"}
                  </b>
                  <span className="hist-time">{fmtDateTime(h.at)}</span>
                </div>
                {(h.by || h.device || h.tz) && (
                  <div className="hist-origin">
                    {h.by && <b>{h.by}</b>}
                    {[h.device, h.tz].filter(Boolean).map((x, i) => (
                      <span key={x}>{i > 0 || h.by ? " · " : ""}{x}</span>
                    ))}
                  </div>
                )}
                {h.changes && h.changes.length > 0 && (
                  <div className="hist-changes">
                    {h.changes.map((c, i) => (
                      <div key={i} className="hist-change">
                        {c.field}: <s>{c.from}</s>{" "}
                        <ArrowRight size={11} /> <b>{c.to}</b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="btn-row">
          <button className="btn-ghost" onClick={onDelete}>
            <Trash2 size={17} /> Delete
          </button>
          <button className="btn-primary flex1" onClick={() => openEdit(txn)}>
            <Pencil size={17} /> Edit
          </button>
        </div>
      </div>
    </div>
  );
}
