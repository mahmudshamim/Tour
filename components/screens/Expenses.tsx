"use client";

import { Users, Receipt, UserPlus, Wallet } from "lucide-react";
import AppHeader from "../AppHeader";
import TxnRow from "../TxnRow";
import { initials } from "../constants";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";
import { useCountUp, useMounted } from "../hooks";

export default function Expenses() {
  const { state, totalSpent, pool, balances } = useStore();
  const money = useMoney();
  const { openSettings, openTransactions } = useUI();

  const pct = pool > 0 ? Math.min(Math.round((totalSpent / pool) * 100), 100) : 0;
  const self = state.settings.selfId;

  const mounted = useMounted();
  const aSpent = useCountUp(totalSpent);

  const recent = [...state.txns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5);

  return (
    <div className="screen fade-in">
      <AppHeader title="Tour Expenses" />

      <div className="card summary-card">
        <div className="eyebrow">Spent from Pool</div>
        <div className="summary-amt num">
          {money(aSpent)}
          {pool > 0 && <span className="of">of {money(pool)}</span>}
        </div>
        {pool > 0 ? (
          <>
            <div className="progress">
              <i style={{ width: `${mounted ? pct : 0}%` }} />
            </div>
            <div className="progress-legend">
              <span className="used">{pct}% USED</span>
              <span className="rem num">
                {money(pool - totalSpent)} LEFT IN POOL
              </span>
            </div>
          </>
        ) : (
          <div className="hint-line" onClick={openSettings}>
            Add people with their deposits to build the pool
          </div>
        )}
      </div>

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title row-title">
            <Wallet size={19} /> Member Balances
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
            <p>No people yet. Add tripmates and their deposits.</p>
            <button className="btn-primary" onClick={openSettings}>
              <UserPlus size={17} /> Add people
            </button>
          </div>
        </div>
      ) : (
        <div className="card list-card">
          {state.members.map((m, i) => {
            const bal = balances.balance[m.id] ?? 0;
            const spent = balances.spent[m.id] ?? 0;
            const over = bal < -0.005;
            const cls = over ? "neg" : "pos";
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
                    Deposited {money(m.contribution)} ·{" "}
                    <b>Spent {money(spent)}</b>
                  </div>
                </div>
                <div className="m-bal">
                  <div className={`m-amount num ${cls}`}>{money(bal)}</div>
                  <div className="m-bal-lbl">{over ? "over" : "left"}</div>
                </div>
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
