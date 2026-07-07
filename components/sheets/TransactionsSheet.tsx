"use client";

import { Receipt, History } from "lucide-react";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";
import TxnRow from "../TxnRow";

export default function TransactionsSheet() {
  const { state, totalSpent } = useStore();
  const money = useMoney();
  const { close, openLog } = useUI();
  const txns = [...state.txns].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head-row">
          <h2>All Transactions</h2>
          <button className="link" onClick={openLog}>
            <History size={14} /> Activity log
          </button>
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
              <span className="num">{money(totalSpent)}</span>
            </div>
            <div className="scroll-list">
              {txns.map((t) => (
                <TxnRow key={t.id} txn={t} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
