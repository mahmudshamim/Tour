"use client";

import { catIcon } from "./constants";
import { useStore, useMoney, type Txn } from "./store";
import { useUI } from "./ui";

export default function TxnRow({ txn, index = 0 }: { txn: Txn; index?: number }) {
  const { memberById } = useStore();
  const money = useMoney();
  const { openDetail } = useUI();
  const Icon = catIcon(txn.category);
  const isGroup = txn.kind === "group";
  const perHead =
    isGroup && txn.split.length ? txn.amount / txn.split.length : 0;
  const chargedTo = memberById(txn.member);
  const label = isGroup
    ? `Group · Split ${txn.split.length} · ${money(perHead)} each`
    : `Personal · ${chargedTo?.name ?? "—"}`;

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
        <div className="a-top">
          <span className="a-name">{txn.title}</span>
          <span className="a-amt num">{money(txn.amount)}</span>
        </div>
        <div className="a-sub">
          <span className={`tag-pill ${isGroup ? "grp" : "per"}`}>
            {isGroup ? "GROUP" : "PERSONAL"}
          </span>
          {isGroup
            ? `Split ${txn.split.length} · ${money(perHead)} each`
            : chargedTo?.name ?? "—"}
        </div>
      </div>
    </button>
  );
}
