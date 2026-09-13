"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, FileSpreadsheet, Share2, Printer } from "lucide-react";
import { fmtTime, catLabel } from "../constants";
import { useStore, useMoney } from "../store";
import { usePlaces } from "../places";
import { useUI } from "../ui";
import { byWhen } from "../models";
import {
  buildReport,
  fileSlug,
  reportCsv,
  settleLineText,
  shareFile,
  shareText,
  summaryText,
  type ReportData,
} from "../report";

/**
 * A tour on one page: money, people, settle-up, every expense. Share it
 * as a chat message, an Excel/Sheets file, or a PDF (via the phone's
 * own Print → Save as PDF, which gets Bangla text right).
 */
export default function ReportSheet() {
  const { state, trip, balances } = useStore();
  const { places } = usePlaces();
  const money = useMoney();
  const { close, toast } = useUI();
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done, { once: true });
    const t = window.setTimeout(() => window.print(), 80);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  if (!trip) return null;
  const data: ReportData = { trip, members: state.members, txns: state.txns, places, balances };
  const r = buildReport(data);
  const maxCat = Math.max(1, ...r.byCategory.map((c) => c.amount));

  const onShare = async () => {
    const res = await shareText(summaryText(data, money));
    if (res === "copied") toast("Copied — paste it in the group chat");
  };
  const onCsv = async () => {
    const res = await shareFile(
      `${fileSlug(trip.name)}-report.csv`,
      reportCsv(data, money),
      "text/csv"
    );
    if (res === "downloaded") toast("Saved — opens in Excel or Google Sheets");
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>
          {trip.cover} {trip.name}
        </h2>
        {r.dates && <p className="sub-line">{[trip.destination, r.dates].filter(Boolean).join(" · ")}</p>}

        <div className="report-actions">
          <button onClick={onShare}>
            <Share2 size={18} />
            <span>Chat summary</span>
          </button>
          <button onClick={onCsv}>
            <FileSpreadsheet size={18} />
            <span>Excel (CSV)</span>
          </button>
          <button onClick={() => setPrinting(true)}>
            <Printer size={18} />
            <span>PDF / Print</span>
          </button>
        </div>

        <ReportBody data={data} money={money} maxCat={maxCat} />

        <button className="btn-primary" onClick={close}>
          Done
        </button>
      </div>
      {printing &&
        createPortal(
          <div className="print-root">
            <h1>
              {trip.cover} {trip.name}
            </h1>
            <p className="print-sub">
              {[trip.destination, r.dates].filter(Boolean).join(" · ")} · TerraExplore
            </p>
            <ReportBody data={data} money={money} maxCat={maxCat} print />
          </div>,
          document.body
        )}
    </div>
  );
}

function ReportBody({
  data,
  money,
  maxCat,
  print = false,
}: {
  data: ReportData;
  money: (n: number) => string;
  maxCat: number;
  print?: boolean;
}) {
  const r = buildReport(data);
  const nm = (id: string) => data.members.find((m) => m.id === id)?.name ?? "—";
  const txns = [...data.txns].sort(byWhen).reverse();
  return (
    <div className={`report ${print ? "for-print" : ""}`}>
      <div className="report-grid">
        <div>
          <span>Pool</span>
          <b className="num">{money(r.pool)}</b>
        </div>
        <div>
          <span>Spent</span>
          <b className="num">{money(r.spent)}</b>
        </div>
        <div>
          <span>Left</span>
          <b className="num">{money(r.left)}</b>
        </div>
        <div>
          <span>Per person</span>
          <b className="num">{money(r.perHead)}</b>
        </div>
      </div>
      {r.own > 0 && <p className="report-note">Plus {money(r.own)} paid from own pockets (outside the pool).</p>}

      {r.byCategory.length > 0 && (
        <>
          <h3>Where it went</h3>
          {r.byCategory.map((c) => (
            <div className="report-bar" key={c.id}>
              <span className="rb-label">{c.label}</span>
              <span className="rb-track">
                <i style={{ width: `${(c.amount / maxCat) * 100}%` }} />
              </span>
              <span className="rb-amt num">{money(c.amount)}</span>
            </div>
          ))}
        </>
      )}

      {r.byDay.length > 1 && (
        <>
          <h3>By day</h3>
          {r.byDay.map((d) => (
            <div className="report-row" key={d.key}>
              <span>{d.label}</span>
              <b className="num">{money(d.amount)}</b>
            </div>
          ))}
        </>
      )}

      <h3>People</h3>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Deposit</th>
              <th>Spent</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {r.people.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="num">{money(p.deposit)}</td>
                <td className="num">{money(p.spent)}</td>
                <td className={`num ${p.balance < -0.004 ? "neg" : ""}`}>
                  {p.balance < -0.004 ? "−" : ""}
                  {money(p.balance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Settle up</h3>
      {r.settle.lines.length ? (
        r.settle.lines.map((l) => (
          <div className="report-row" key={`${l.from}-${l.to}`}>
            <span>{settleLineText(data.members, l, money)}</span>
            {data.trip.settled?.[l.from === data.trip.holderId ? l.to : l.from] && <b>✓ paid</b>}
          </div>
        ))
      ) : (
        <p className="report-note">Everyone&apos;s square.</p>
      )}

      <h3>Expenses ({r.count})</h3>
      <div className="report-table-wrap">
        <table className="report-table expenses">
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((t) => {
              const at = t.spentAt || t.createdAt;
              return (
                <tr key={t.id}>
                  <td>
                    {new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    <small> {fmtTime(at)}</small>
                  </td>
                  <td>
                    {t.title}
                    <small>
                      {" "}
                      {catLabel(t.category)} ·{" "}
                      {t.kind === "group"
                        ? `split ${t.split.length}`
                        : t.kind === "own"
                        ? `${nm(t.member)}, own pocket`
                        : nm(t.member)}
                    </small>
                  </td>
                  <td className="num">{money(t.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!print && (
        <p className="report-note">
          <FileText size={13} /> {r.explored}/{data.places.length} planned stops explored.
        </p>
      )}
    </div>
  );
}
