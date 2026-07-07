"use client";

import { Sun, Route, Users, Plus, Clock, MapPin, Receipt } from "lucide-react";
import AppHeader from "../AppHeader";
import TxnRow from "../TxnRow";
import { IMG } from "../data";
import { initials } from "../constants";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";
import { useCountUp, useMounted } from "../hooks";

const R = 74;
const C = 2 * Math.PI * R;

export default function Dashboard() {
  const { state, totalSpent, pool, balances } = useStore();
  const money = useMoney();
  const { openAdd, openTransactions } = useUI();

  const budget = pool;
  const pct = budget > 0 ? Math.min(totalSpent / budget, 1) : 0;
  const pctLabel = budget > 0 ? Math.round(pct * 100) : 0;
  const remaining = budget - totalSpent;

  const selfNet = balances.balance[state.settings.selfId] ?? 0;
  const owes = selfNet < -0.005;
  const balLabel = owes ? "You overspent" : "Your balance left";

  const mounted = useMounted();
  const aPct = useCountUp(pctLabel);
  const aBudget = useCountUp(budget);
  const aSpent = useCountUp(totalSpent);
  const aRemaining = useCountUp(remaining);
  const aNet = useCountUp(selfNet);

  const recent = [...state.txns]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 4);

  return (
    <div className="screen fade-in">
      <AppHeader title="TerraExplore" />

      <div className="section-pad">
        <div className="section-head tight" style={{ marginTop: 8 }}>
          <div>
            <div className="section-title">Trip Overview</div>
            {state.settings.tripName && (
              <div className="ov-sub">{state.settings.tripName}</div>
            )}
          </div>
        </div>
      </div>

      <div className="card budget-card">
        <div className="ring-wrap">
          <div className="ring">
            <svg width="168" height="168" viewBox="0 0 168 168">
              <defs>
                <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#4ade80" />
                  <stop offset="1" stopColor="#22c55e" />
                </linearGradient>
              </defs>
              <circle cx="84" cy="84" r={R} fill="none" stroke="var(--track)" strokeWidth="12" />
              <circle
                className="ring-progress"
                cx="84"
                cy="84"
                r={R}
                fill="none"
                stroke="url(#ring)"
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - (mounted ? pct : 0))}
                style={{ filter: "drop-shadow(0 0 6px rgba(74,222,128,.5))" }}
              />
            </svg>
            <div className="ring-center">
              <div className="pct num">{Math.round(aPct)}%</div>
              <div className="lbl">SPENT</div>
            </div>
          </div>
        </div>

        <div className="budget-total">
          <span className="eyebrow">Total Pool</span>
          <div className="amt num">
            {budget > 0 ? money(aBudget) : "Add deposits"}
          </div>
        </div>

        <div className="stat-split">
          <div className="stat-cell">
            <div className="eyebrow">Spent</div>
            <div className="val green num">{money(aSpent)}</div>
          </div>
          <div className="stat-cell">
            <div className="eyebrow">Remaining</div>
            <div className="val num">{budget > 0 ? money(aRemaining) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title">Next Up</div>
        </div>
      </div>

      <div className="next-card">
        <img
          src={IMG.trek}
          alt="Sylhet Tea Trails"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
        <div className="grad" />
        <div className="next-body">
          <span className="badge-tag">TEA TRAILS</span>
          <div className="title">Sylhet Tea Trails</div>
          <div className="next-meta">
            <span>
              <Clock size={13} /> 08:30 AM
            </span>
            <span>
              <MapPin size={13} /> Sreemangal
            </span>
          </div>
        </div>
      </div>

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title">Quick Stats</div>
        </div>
      </div>

      <div>
        <div className="card qstat rise" style={{ animationDelay: "0.05s" }}>
          <span className="q-ico sand">
            <Sun size={22} />
          </span>
          <div className="q-info">
            <div className="q-lbl">Weather</div>
            <div className="q-val num">
              31°C <small>Humid</small>
            </div>
          </div>
        </div>

        <div className="card qstat rise" style={{ animationDelay: "0.12s" }}>
          <span className="q-ico sky">
            <Route size={22} />
          </span>
          <div className="q-info">
            <div className="q-lbl">Distance</div>
            <div className="q-val num">
              45 KM <small>Total Covered</small>
            </div>
          </div>
        </div>

        <div className="card qstat rise" style={{ animationDelay: "0.19s" }}>
          <span className="q-ico green">
            <Users size={22} />
          </span>
          <div className="q-info">
            <div className="q-lbl">Balance</div>
            <div className="q-val num">
              {money(aNet)} <small>{balLabel}</small>
            </div>
          </div>
          <button className="q-plus" onClick={openAdd} aria-label="Add expense">
            <Plus size={20} />
          </button>
        </div>
      </div>

      {state.members.length > 0 && (
        <>
          <div className="section-pad">
            <div className="section-head">
              <div className="section-title">Member Spending</div>
            </div>
          </div>
          <div className="card list-card">
            {state.members.map((m, i) => {
              const spent = balances.spent[m.id] ?? 0;
              const bal = balances.balance[m.id] ?? 0;
              const dep = m.contribution || 0;
              const frac = dep > 0 ? Math.min(spent / dep, 1) : spent > 0 ? 1 : 0;
              const over = bal < -0.005;
              return (
                <div
                  className="spend-row rise"
                  key={m.id}
                  style={{ animationDelay: `${i * 0.07}s` }}
                >
                  <span className="m-avatar sm" style={{ background: m.color }}>
                    {initials(m.name)}
                  </span>
                  <div className="spend-info">
                    <div className="spend-top">
                      <span className="spend-name">{m.name}</span>
                      <span className="spend-amt num">{money(spent)}</span>
                    </div>
                    <div className="spend-bar">
                      <i
                        className={over ? "over" : ""}
                        style={{ width: `${Math.round(frac * 100)}%` }}
                      />
                    </div>
                    <div className="spend-sub">
                      {over ? (
                        <span className="over-txt">
                          over by {money(Math.abs(bal))}
                        </span>
                      ) : (
                        <>{money(bal)} left of {money(dep)}</>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="section-pad">
        <div className="section-head">
          <div className="section-title">Recent Transactions</div>
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
            <p>No expenses yet. Tap + to log your first one.</p>
          </div>
        ) : (
          recent.map((t, i) => <TxnRow key={t.id} txn={t} index={i} />)
        )}
      </div>
    </div>
  );
}
