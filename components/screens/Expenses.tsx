"use client";

import { Users, Receipt, UserPlus, Wallet, PiggyBank, Scale, FileText, ChevronRight } from "lucide-react";
import AppHeader from "../AppHeader";
import TxnRow from "../TxnRow";
import { initials } from "../constants";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";
import { useCountUp, useMounted } from "../hooks";
import { byWhen, settleUp } from "../models";

export default function Expenses() {
  const { state, trip, totalSpent, pool, balances, selfId, readOnly } = useStore();
  const money = useMoney();
  const { openSettings, openTransactions, openSettle, openReport } = useUI();
  const settle = settleUp(state.members, balances, trip?.holderId);
  const settledCount = settle.lines.filter((l) =>
    trip?.settled?.[l.from === trip?.holderId ? l.to : l.from]
  ).length;

  const pct = pool > 0 ? Math.min(Math.round((totalSpent / pool) * 100), 100) : 0;
  const self = selfId;

  const mounted = useMounted();
  const aSpent = useCountUp(totalSpent);

  const recent = [...state.txns]
    .sort(byWhen)
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
            {readOnly
              ? "No deposits recorded yet"
              : "Add people with their deposits to build the pool"}
          </div>
        )}
      </div>

      {state.members.length > 0 && (
        <div className="group-actions">
          <button className="ga-btn" onClick={openSettle}>
            <span className="ga-ico">
              <Scale size={19} />
            </span>
            <span className="ga-text">
              <b>Settle up</b>
              <small>
                {settle.lines.length === 0
                  ? "Everyone's square"
                  : `${settle.lines.length} payment${settle.lines.length > 1 ? "s" : ""}` +
                    (settledCount ? ` · ${settledCount} done` : "")}
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button className="ga-btn" onClick={openReport}>
            <span className="ga-ico">
              <FileText size={19} />
            </span>
            <span className="ga-text">
              <b>Tour report</b>
              <small>PDF · Excel · chat</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title row-title">
            <Wallet size={19} /> Member Balances
          </div>
          <button className="link" onClick={openSettings}>
            <UserPlus size={14} /> {readOnly ? "People" : "Manage"}
          </button>
        </div>
      </div>

      {state.members.length === 0 ? (
        <div className="card list-card">
          <div className="empty">
            <Users size={28} />
            <p>
              {readOnly
                ? "No people on this tour yet."
                : "No people yet. Add tripmates and their deposits."}
            </p>
            {!readOnly && (
              <button className="btn-primary" onClick={openSettings}>
                <UserPlus size={17} /> Add people
              </button>
            )}
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
                    {(balances.own[m.id] ?? 0) > 0 && (
                      <span className="m-own">
                        {" "}
                        · own {money(balances.own[m.id])}
                      </span>
                    )}
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

      {balances.ownTotal > 0 && (
        <>
          <div className="section-pad">
            <div className="section-head">
              <div className="section-title row-title">
                <PiggyBank size={19} /> Own Pocket
              </div>
              <span className="sec-note">outside the pool</span>
            </div>
          </div>
          <div className="card list-card">
            {state.members
              .filter((m) => (balances.own[m.id] ?? 0) > 0)
              .map((m) => (
                <div className="own-row" key={m.id}>
                  <span className="dot-avatar" style={{ background: m.color }} />
                  <span className="own-name">
                    {m.name}
                    {m.id === self && <span className="you-badge">You</span>}
                  </span>
                  <span className="own-amt num">{money(balances.own[m.id])}</span>
                </div>
              ))}
            <div className="own-row total">
              <span className="own-name">Everyone</span>
              <span className="own-amt num">{money(balances.ownTotal)}</span>
            </div>
          </div>
        </>
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
            <p>
              {readOnly
                ? "No expenses logged yet."
                : "No expenses logged. Use the + button to add one."}
            </p>
          </div>
        ) : (
          recent.map((t, i) => <TxnRow key={t.id} txn={t} index={i} />)
        )}
      </div>
    </div>
  );
}
