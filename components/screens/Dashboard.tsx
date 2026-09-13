"use client";

import type { CSSProperties } from "react";
import { MapPin, Receipt, Flag, ChevronRight, CalendarRange, PartyPopper } from "lucide-react";
import AppHeader from "../AppHeader";
import CoverArt, { CoverPhoto } from "../CoverArt";
import { useTourPhoto } from "../covers";
import TxnRow from "../TxnRow";
import { initials } from "../constants";
import { useStore, useMoney, tripStatsOf } from "../store";
import { usePlaces, ICONS } from "../places";
import { useUI } from "../ui";
import { useCountUp, useMounted } from "../hooks";
import { accentOf, byWhen, phaseLabel, tourDates, tripPhase } from "../models";

const R = 74;
const C = 2 * Math.PI * R;

export default function Dashboard() {
  const { state, trip, totalSpent, pool, balances, readOnly } = useStore();
  const { places } = usePlaces();
  const money = useMoney();
  const { openTransactions, setTab } = useUI();

  const budget = pool;
  const pct = budget > 0 ? Math.min(totalSpent / budget, 1) : 0;
  const pctLabel = budget > 0 ? Math.round(pct * 100) : 0;
  const remaining = budget - totalSpent;

  const mounted = useMounted();
  const aPct = useCountUp(pctLabel);
  const aBudget = useCountUp(budget);
  const aSpent = useCountUp(totalSpent);
  const aRemaining = useCountUp(remaining);

  const recent = [...state.txns]
    .sort(byWhen)
    .slice(0, 4);

  const acc = accentOf(trip?.accent);
  const tint = { "--a1": acc.from, "--a2": acc.to } as CSSProperties;
  const phase = trip ? phaseLabel(tripPhase(trip)) : "";
  const { first, last } = tripStatsOf([], state.txns, []);
  const dates = trip ? tourDates(trip, first, last).text : "";
  const next = places.find((p) => !p.done);
  const explored = places.filter((p) => p.done).length;
  const NextIcon = next ? ICONS[next.icon] ?? MapPin : MapPin;
  const photo = useTourPhoto(trip);

  return (
    <div className="screen fade-in">
      <AppHeader title="Overview" />

      {trip && (
        <button
          className={`trip-banner rise ${photo ? "has-photo" : ""}`}
          style={tint}
          onClick={() => setTab("tours")}
        >
          {photo ? (
            <>
              <CoverPhoto src={photo} />
              <span className="cv-shade" />
            </>
          ) : (
            <>
              <CoverArt cover={trip.cover} className="tb-art" />
              <span className="tb-emoji">{trip.cover}</span>
            </>
          )}
          <span className="tb-info">
            <span className="tb-name">{trip.name}</span>
            <span className="tb-sub">
              {[trip.destination, dates].filter(Boolean).join(" · ") ||
                "All tours →"}
            </span>
          </span>
          {phase && <span className="tb-phase">{phase}</span>}
        </button>
      )}

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
            {budget > 0 ? money(aBudget) : readOnly ? "No deposits yet" : "Add deposits"}
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

      {(places.length > 0 || !readOnly) && (
        <div className="section-pad">
          <div className="section-head">
            <div className="section-title">Next Up</div>
            {places.length > 0 && (
              <button className="link" onClick={() => setTab("itinerary")}>
                Plan
              </button>
            )}
          </div>
        </div>
      )}

      {next ? (
        <button className="next-card" style={tint} onClick={() => setTab("map")}>
          <span className="next-art">
            <NextIcon size={120} strokeWidth={1.2} />
          </span>
          <div className="grad" />
          <div className="next-body">
            <span className="badge-tag">NEXT STOP</span>
            <div className="title">{next.name}</div>
            <div className="next-meta">
              {(next.area || trip?.destination) && (
                <span>
                  <MapPin size={13} /> {next.area || trip?.destination}
                </span>
              )}
              <span>
                <Flag size={13} /> {explored}/{places.length} explored
              </span>
            </div>
          </div>
        </button>
      ) : places.length > 0 ? (
        <div className="next-card done" style={tint}>
          <span className="next-art">
            <PartyPopper size={120} strokeWidth={1.2} />
          </span>
          <div className="grad" />
          <div className="next-body">
            <span className="badge-tag">ALL DONE</span>
            <div className="title">Every stop explored</div>
            <div className="next-meta">
              <span>
                <Flag size={13} /> {places.length} places
              </span>
            </div>
          </div>
        </div>
      ) : (
        !readOnly && (
          <button className="plan-cta" onClick={() => setTab("itinerary")}>
            <CalendarRange size={20} />
            <span>
              <b>Plan your stops</b>
              <small>Add the places you want to see on this tour</small>
            </span>
            <ChevronRight size={18} />
          </button>
        )
      )}

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
                      <span className={`spend-remain num ${over ? "neg" : ""}`}>
                        {over ? `−${money(Math.abs(bal))}` : money(bal)}
                        <small>{over ? "over" : "left"}</small>
                      </span>
                    </div>
                    <div className="spend-bar">
                      <i
                        className={over ? "over" : ""}
                        style={{ width: `${Math.round(frac * 100)}%` }}
                      />
                    </div>
                    <div className="spend-sub">
                      <span className="s-spent num">
                        Spent {money(spent)}
                      </span>
                      <span className="s-total num">
                        {Math.round(frac * 100)}% of {money(dep)}
                      </span>
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
            <p>
              {readOnly
                ? "No expenses logged yet."
                : "No expenses yet. Tap + to log your first one."}
            </p>
          </div>
        ) : (
          recent.map((t, i) => <TxnRow key={t.id} txn={t} index={i} />)
        )}
      </div>
    </div>
  );
}
