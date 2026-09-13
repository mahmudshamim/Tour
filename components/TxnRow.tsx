"use client";

import { txnIcon, fmtTime, fmtWhen } from "./constants";
import { useStore, useMoney, type Txn } from "./store";
import { useUI } from "./ui";

export default function TxnRow({
  txn,
  index = 0,
  timeOnly = false,
}: {
  txn: Txn;
  index?: number;
  /** inside a day-grouped list the day is already said — show just the time */
  timeOnly?: boolean;
}) {
  const { memberById } = useStore();
  const money = useMoney();
  const { openDetail } = useUI();
  const Icon = txnIcon(txn.title, txn.category);
  const isGroup = txn.kind === "group";
  const perHead =
    isGroup && txn.split.length ? txn.amount / txn.split.length : 0;
  const chargedTo = memberById(txn.member);
  const kindCls = isGroup ? "grp" : txn.kind === "own" ? "own" : "per";
  const kindLabel = isGroup
    ? "GROUP"
    : txn.kind === "own"
    ? "OWN"
    : "PERSONAL";
  const at = txn.spentAt || txn.createdAt;

  return (
    <button
      className="activity tappable rise"
      style={{ animationDelay: `${index * 0.07}s` }}
      onClick={() => openDetail(txn)}
    >
      <span className="a-ico">
        <Icon size={20} />
      </span>
      <div className="a-info">
        <div className="a-name">{txn.title}</div>
        <div className="a-sub">
          <span className={`tag-pill ${kindCls}`}>{kindLabel}</span>
          {isGroup
            ? `Split ${txn.split.length} · ${money(perHead)} each`
            : txn.kind === "own"
            ? `${chargedTo?.name ?? "—"} · own pocket`
            : chargedTo?.name ?? "—"}
        </div>
      </div>
      <div className="a-right">
        <span className="a-amt num">{money(txn.amount)}</span>
        <span className="a-when">{timeOnly ? fmtTime(at) : fmtWhen(at)}</span>
      </div>
    </button>
  );
}
