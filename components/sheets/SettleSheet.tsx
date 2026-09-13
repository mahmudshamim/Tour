"use client";

import { ArrowRight, Check, Share2, Wallet, PartyPopper, FileText } from "lucide-react";
import { initials } from "../constants";
import { useStore, useMoney } from "../store";
import { useUI } from "../ui";
import { settleUp } from "../models";
import { settleLineText, shareText, summaryText } from "../report";
import { usePlaces } from "../places";

/**
 * End of the tour: who hands whom what. Pick who's holding the pool's
 * cash and every line becomes a person-to-person payment; tick lines off
 * as people pay. Works on archived tours — that's usually when it's done.
 */
export default function SettleSheet() {
  const { state, trip, balances, pool, totalSpent, canEdit, updateSettle, memberById } = useStore();
  const { places } = usePlaces();
  const money = useMoney();
  const { close, toast, openReport } = useUI();
  if (!trip) return null;

  const s = settleUp(state.members, balances, trip.holderId);
  const holder = memberById(trip.holderId);
  const settled = trip.settled ?? {};
  // the person on the line who isn't the cash holder
  const partyOf = (l: { from: string; to: string }) => (l.from === trip.holderId ? l.to : l.from);
  const done = s.lines.filter((l) => settled[partyOf(l)]).length;

  const toggle = (id: string) =>
    updateSettle({ settled: { ...settled, [id]: !settled[id] } });

  const share = async () => {
    const res = await shareText(
      summaryText({ trip, members: state.members, txns: state.txns, places, balances }, money)
    );
    if (res === "copied") toast("Copied — paste it in the group chat");
  };

  const Avatar = ({ id }: { id: string }) => {
    const m = memberById(id);
    return m ? (
      <span className="m-avatar xs" style={{ background: m.color }}>
        {initials(m.name)}
      </span>
    ) : (
      <span className="m-avatar xs pool">
        <Wallet size={13} />
      </span>
    );
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head-row">
          <h2>Settle up</h2>
          <button className="link" onClick={share}>
            <Share2 size={14} /> Share
          </button>
        </div>

        <div className="settle-sum">
          <div>
            <span>Deposits</span>
            <b className="num">{money(pool)}</b>
          </div>
          <div>
            <span>Spent</span>
            <b className="num">{money(totalSpent)}</b>
          </div>
          <div className="hl">
            <span>Left in pool</span>
            <b className="num">{money(s.left)}</b>
          </div>
        </div>

        <div className="split-title">Who has the pool&apos;s cash?</div>
        <div className="chip-row">
          {state.members.map((m) => (
            <button
              key={m.id}
              className={`pay-chip ${trip.holderId === m.id ? "on" : ""}`}
              disabled={!canEdit}
              onClick={() => updateSettle({ holderId: trip.holderId === m.id ? "" : m.id })}
            >
              <span className="dot-avatar" style={{ background: m.color }} />
              {m.name}
            </button>
          ))}
        </div>
        <div className="seg-hint">
          {holder
            ? `Everyone settles with ${holder.name}. Their own share (${money(
                balances.balance[holder.id] ?? 0
              )}) simply stays with them.`
            : "Pick who collected the deposits — then each line becomes one payment."}
        </div>

        {s.lines.length === 0 ? (
          <div className="empty sm">
            <PartyPopper size={26} />
            <p>Everyone&apos;s square — nothing to settle.</p>
          </div>
        ) : (
          <>
            <div className="split-title">
              Payments{" "}
              <span className="muted-inline">
                {done}/{s.lines.length} done
              </span>
            </div>
            {s.lines.map((l) => {
              const who = partyOf(l);
              const paid = Boolean(settled[who]);
              return (
                <div className={`settle-line ${paid ? "paid" : ""}`} key={`${l.from}-${l.to}`}>
                  <Avatar id={l.from} />
                  <ArrowRight size={14} className="sl-arrow" />
                  <Avatar id={l.to} />
                  <span className="sl-text">{settleLineText(state.members, l, money)}</span>
                  <button
                    className={`check ${paid ? "on" : ""}`}
                    disabled={!canEdit}
                    onClick={() => toggle(who)}
                    aria-label={paid ? "Mark as not paid" : "Mark as paid"}
                  >
                    {paid && <Check size={15} strokeWidth={3} />}
                  </button>
                </div>
              );
            })}
          </>
        )}

        <div className="btn-row">
          <button className="btn-ghost neutral" onClick={openReport}>
            <FileText size={17} /> Full report
          </button>
          <button className="btn-primary flex1" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
