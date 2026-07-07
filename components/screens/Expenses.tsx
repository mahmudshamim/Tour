"use client";

import { Users, Receipt, UserPlus } from "lucide-react";
import AppHeader from "../AppHeader";
import TxnRow from "../TxnRow";
import { initials } from "../constants";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";
import { useCountUp, useMounted } from "../hooks";

export default function Expenses() {
  const { state, totalSpent, balances } = useStore();
  const money = useMoney();
  const { openSettings, openTransactions } = useUI();

  const budget = state.settings.budget;
  const pct = budget > 0 ? Math.min(Math.round((totalSpent / budget) * 100), 100) : 0;
  const self = state.settings.selfId;

  const mounted = useMounted();
  const aTotal = useCountUp(totalSpent);

  const recent = [...state.txns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  return (
    <div className="screen fade-in">
      <AppHeader title="Tour Expenses" />

      <div className="card summary-card">
        <div className="eyebrow">Total Spent</div>
        <div className="summary-amt num">
          {money(aTotal)}
          {budget > 0 && <span className="of">of {money(budget)}</span>}
        </div>
        {budget > 0 ? (
          <>
            <div className="progress">
              <i style={{ width: `${mounted ? pct : 0}%` }} />
            </div>
            <div className="progress-legend">
              <span className="used">{pct}% USED</span>
              <span className="rem num">
                {money(budget - totalSpent)} REMAINING
              </span>
            </div>
          </>
        ) : (
          <div className="hint-line" onClick={openSettings}>
            Set a budget in settings to track remaining
          </div>
        )}
      </div>

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title row-title">
            <Users size={19} /> Group Balances
          </div>
          <button className="link" onClick={openSettings}>
            <UserPlus size={14} /> Manage
          </button>
        </div>
      </div>

      {state.members.length === 0 ? (
        <div className="card list-card">
          <div className="empty">
            <Users size={28} />
            <p>No people yet. Add tripmates to split expenses.</p>
            <button className="btn-primary" onClick={openSettings}>
              <UserPlus size={17} /> Add people
            </button>
          </div>
        </div>
      ) : (
        <div className="card list-card">
          {state.members.map((m, i) => {
            const net = balances.net[m.id] ?? 0;
            const paid = balances.paid[m.id] ?? 0;
            const owed = net > 0.005;
            const owes = net < -0.005;
            const cls = owed ? "pos" : owes ? "neg" : "zero";
            const label = owed
              ? `+${money(net)}`
              : owes
              ? `-${money(net)}`
              : money(0);
            const status = owed
              ? `Is owed ${money(net)}`
              : owes
              ? `Owes ${money(net)}`
              : "Settle up";
            return (
              <div
                className="member rise"
                key={m.id}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <span className="m-avatar" style={{ background: m.color }}>
                  {initials(m.name)}
                </span>
                <div className="m-info">
                  <div className="m-name">
                    {m.name}
                    {m.id === self && <span className="you-badge">You</span>}
                  </div>
                  <div className="m-status">
                    {status} · <b>Paid: {money(paid)}</b>
                  </div>
                </div>
                <div className={`m-amount num ${cls}`}>{label}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title">Recent Activity</div>
          {state.txns.length > 0 && (
            <button className="link" onClick={openTransactions}>
              View All
            </button>
          )}
        </div>
      </div>

      <div className="card list-card stack-lg">
        {recent.length === 0 ? (
          <div className="empty sm">
            <Receipt size={24} />
            <p>No expenses logged. Use the + button to add one.</p>
          </div>
        ) : (
          recent.map((t, i) => <TxnRow key={t.id} txn={t} index={i} />)
        )}
      </div>
    </div>
  );
}
