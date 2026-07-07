"use client";

import { catIcon } from "./constants";
import { useStore, useMoney, type Txn } from "./store";
import { useUI } from "./ui";

export default function TxnRow({ txn, index = 0 }: { txn: Txn; index?: number }) {
  const { memberById, state } = useStore();
  const money = useMoney();
  const { openDetail } = useUI();
  const Icon = catIcon(txn.category);
  const payer = memberById(txn.paidBy);
  const self = state.settings.selfId;
  const perHead = txn.split.length ? txn.amount / txn.split.length : 0;
  const paidLabel =
    payer?.id === self ? "Paid by You" : `Paid by ${payer?.name ?? "—"}`;

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
          {paidLabel} · <span className="split">Split {txn.split.length}</span>{" "}
          · {money(perHead)} each
        </div>
      </div>
    </button>
  );
}
