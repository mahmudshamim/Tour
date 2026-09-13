"use client";

import { Receipt, History } from "lucide-react";
import { useStore, useMoney, isPoolTxn, type Txn } from "../store";
import { useUI } from "../ui";
import { byWhen } from "../models";
import { dayKey, fmtDay } from "../constants";
import TxnRow from "../TxnRow";

export default function TransactionsSheet() {
  const { state, totalSpent, balances, canEdit } = useStore();
  const money = useMoney();
  const { close, openLog } = useUI();
  const txns = [...state.txns].sort(byWhen);

  // one block per day, newest first — "Today", "Yesterday", "Sat, 12 Jul"
  const days: { key: string; at: number; txns: Txn[] }[] = [];
  txns.forEach((t) => {
    const at = t.spentAt || t.createdAt;
    const key = dayKey(at);
    const last = days[days.length - 1];
    if (last && last.key === key) last.txns.push(t);
    else days.push({ key, at, txns: [t] });
  });

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head-row">
          <h2>All Transactions</h2>
          {canEdit && (
            <button className="link" onClick={openLog}>
              <History size={14} /> Activity log
            </button>
          )}
        </div>

        {txns.length === 0 ? (
          <div className="empty">
            <Receipt size={28} />
            <p>No transactions yet. Tap the + button to add one.</p>
          </div>
        ) : (
          <>
            <div className="list-total">
              <span>{txns.length} transactions</span>
              <span className="num">
                {money(totalSpent)}
                {balances.ownTotal > 0 && (
                  <small className="lt-own">
                    {" "}
                    + {money(balances.ownTotal)} own
                  </small>
                )}
              </span>
            </div>
            <div className="scroll-list">
              {days.map((d) => (
                <div className="day-block" key={d.key}>
                  <div className="day-head">
                    <span>{fmtDay(d.at)}</span>
                    <i />
                    <span className="num">
                      {money(d.txns.reduce((s, t) => (isPoolTxn(t) ? s + t.amount : s), 0))}
                    </span>
                  </div>
                  {d.txns.map((t) => (
                    <TxnRow key={t.id} txn={t} timeOnly />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
