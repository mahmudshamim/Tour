"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  UserPlus,
  Trash2,
  Check,
  Star,
  History,
  Database,
  Eraser,
  Lock,
  LockOpen,
  Archive,
  KeyRound,
  LogOut,
  Pencil,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { initials } from "../constants";
import { useStore, tripStatsOf } from "../store";
import { useUI } from "../ui";
import { accentOf, tourDates } from "../models";
import { lockMessage } from "../editLock";
import { useTourPhoto } from "../covers";
import { CoverPhoto } from "../CoverArt";

/** Deposit field that only saves on blur/Enter — typing "1500.5" no
 *  longer gets mangled mid-way, and no half-typed amount is synced. */
function DepositInput({
  value,
  symbol,
  disabled,
  onCommit,
}: {
  value: number;
  symbol: string;
  disabled: boolean;
  onCommit: (n: number) => void;
}) {
  const show = (n: number) => (n ? String(n) : "");
  const [draft, setDraft] = useState(show(value));
  useEffect(() => setDraft(show(value)), [value]);

  const commit = () => {
    const n = parseFloat(draft);
    const next = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
    if (next !== value) onCommit(next);
    else setDraft(show(value));
  };

  return (
    <div className="depo-input">
      <span className="cur sm">{symbol}</span>
      <input
        inputMode="decimal"
        value={draft}
        placeholder="0"
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        aria-label="Deposit"
      />
    </div>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const { changePassword } = useStore();
  const { toast } = useUI();
  const [oldPw, setOld] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (next.length < 6) return setErr(lockMessage("short"));
    if (next !== again) return setErr("New passwords don't match");
    setBusy(true);
    const res = await changePassword(oldPw, next);
    setBusy(false);
    if (!res.ok) return setErr(lockMessage(res.error));
    toast("Password changed — other devices signed out");
    onDone();
  };

  const fields = [
    { ph: "Current password", v: oldPw, set: setOld, ac: "current-password" },
    { ph: "New password (6+ characters)", v: next, set: setNext, ac: "new-password" },
    { ph: "New password again", v: again, set: setAgain, ac: "new-password" },
  ];

  return (
    <div className="trip-form">
      {fields.map((f) => (
        <div className="input compact" key={f.ph}>
          <KeyRound size={16} />
          <input
            type="password"
            placeholder={f.ph}
            value={f.v}
            autoComplete={f.ac}
            onChange={(e) => {
              setErr("");
              f.set(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
      ))}
      {err && <div className="field-err">{err}</div>}
      <button
        className="btn-primary"
        onClick={submit}
        disabled={busy || !oldPw || !next}
        style={{ opacity: busy || !oldPw || !next ? 0.55 : 1 }}
      >
        {busy ? "Saving…" : "Change password"}
      </button>
    </div>
  );
}

export default function SettingsSheet() {
  const {
    state,
    trip,
    configured,
    syncing,
    syncError,
    pending,
    writeStatus,
    archived,
    canEdit,
    readOnly,
    selfId,
    setSelf,
    addMember,
    removeMember,
    updateMember,
    createDemoTrip,
    clearAll,
    lock,
  } = useStore();
  const { close, openLog, confirm, openUnlock, openTrip, toast, setTab } = useUI();
  const symbol = trip?.currency || "৳";

  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [pwForm, setPwForm] = useState(false);

  const add = () => {
    if (!newName.trim()) return;
    addMember(newName, parseFloat(newAmt) || 0);
    setNewName("");
    setNewAmt("");
  };

  const saveEdit = () => {
    if (editId) updateMember(editId, { name: editName });
    setEditId(null);
  };

  const tryRemove = async (id: string, name: string) => {
    const refs = state.txns.filter(
      (t) => t.member === id || t.split.includes(id)
    ).length;
    if (refs > 0) {
      await confirm({
        title: `${name} is in use`,
        message: `Used in ${refs} expense${
          refs > 1 ? "s" : ""
        }. Delete or reassign those first — keeps the pool math correct.`,
        confirmLabel: "Got it",
        cancelLabel: "Close",
      });
      return;
    }
    const ok = await confirm({
      title: `Remove ${name}?`,
      message: "They'll be taken off this tour's people list.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) removeMember(id);
  };

  const signOutAll = async () => {
    const ok = await confirm({
      title: "Sign out every device?",
      message:
        "Every phone that's unlocked — this one included — goes back to view-only and needs the password again.",
      confirmLabel: "Sign out all",
      danger: true,
    });
    if (!ok) return;
    await lock(true);
    toast("All devices signed out");
  };

  const doClear = async () => {
    const ok = await confirm({
      title: "Erase every tour?",
      message:
        "Deletes all tours — past ones too — with their people, expenses, history and places, for everyone. This can't be undone.",
      confirmLabel: "Erase everything",
      danger: true,
    });
    if (!ok) return;
    const done = await clearAll();
    if (done) {
      close();
      setTab("tours");
    } else toast("Couldn't erase — you need to be online and unlocked");
  };

  const acc = accentOf(trip?.accent);
  const photo = useTourPhoto(trip);
  const span = tripStatsOf([], state.txns, []);
  const dates = trip ? tourDates(trip, span.first, span.last).text : "";

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>Settings</h2>

        {/* ---- Edit access ---- */}
        {configured && (
          <div className={`access-card ${canEdit ? "on" : ""}`}>
            <span className="ac-ico">
              {canEdit ? <LockOpen size={20} /> : <Lock size={20} />}
            </span>
            <div className="ac-body">
              <div className="ac-title">
                {canEdit ? "Editing unlocked" : "View only"}
              </div>
              <div className="ac-sub">
                {canEdit
                  ? "Stays unlocked offline. Changes save for everyone once there's signal."
                  : "Anyone with the link can view. Editing needs the password."}
              </div>
            </div>
            {!canEdit && (
              <button className="ac-btn" onClick={() => openUnlock()}>
                Unlock
              </button>
            )}
          </div>
        )}
        {configured && canEdit && (
          <>
            <div className="btn-pair">
              <button className="row-btn" onClick={() => lock().then(() => toast("Locked — view only"))}>
                <Lock size={16} /> Lock
              </button>
              <button className="row-btn" onClick={() => setPwForm((v) => !v)}>
                <KeyRound size={16} /> Password
              </button>
            </div>
            {pwForm && <ChangePassword onDone={() => setPwForm(false)} />}
          </>
        )}

        {/* ---- This tour ---- */}
        {trip && (
          <>
            <div className="split-title">This tour</div>
            <button
              className="tour-mini"
              style={{ "--a1": acc.from, "--a2": acc.to } as CSSProperties}
              onClick={() => (canEdit ? openTrip(trip.id) : setTab("tours"))}
            >
              <span className="cover-tile">
                {photo ? <CoverPhoto src={photo} /> : trip.cover}
              </span>
              <span className="tr-info">
                <span className="tr-name">{trip.name}</span>
                <span className="tr-sub">
                  {[trip.destination, dates].filter(Boolean).join(" · ") ||
                    (canEdit ? "Add destination & dates" : "No details yet")}
                </span>
              </span>
              {canEdit ? <Pencil size={16} /> : <ChevronRight size={16} />}
            </button>
            {archived && (
              <div className="archived-note">
                <Archive size={15} /> Archived — this tour&apos;s numbers are
                read-only.
              </div>
            )}
          </>
        )}

        {/* ---- People + deposits ---- */}
        {trip && (
          <>
            <div className="split-title">
              People &amp; Deposits ({state.members.length})
            </div>
            {state.members.length > 0 && (
              <div className="hint-soft">
                <Star size={12} /> Tap the star on your own name — it&apos;s only
                remembered on this device.
              </div>
            )}
            {state.members.map((m) => {
              const isSelf = selfId === m.id;
              return (
                <div className="member-manage" key={m.id}>
                  <span className="m-avatar sm" style={{ background: m.color }}>
                    {initials(m.name)}
                  </span>
                  {editId === m.id ? (
                    <input
                      className="inline-edit"
                      value={editName}
                      autoFocus
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      onBlur={saveEdit}
                    />
                  ) : (
                    <button
                      className="mm-name"
                      disabled={readOnly}
                      onClick={() => {
                        setEditId(m.id);
                        setEditName(m.name);
                      }}
                    >
                      {m.name}
                      {isSelf && <span className="you-badge">You</span>}
                    </button>
                  )}
                  <DepositInput
                    value={m.contribution}
                    symbol={symbol}
                    disabled={readOnly}
                    onCommit={(n) => updateMember(m.id, { contribution: n })}
                  />
                  <button
                    className={`mini-btn ${isSelf ? "on" : ""}`}
                    title={isSelf ? "That's you" : "This is me"}
                    aria-label={isSelf ? `${m.name} is you` : `I am ${m.name}`}
                    onClick={() => setSelf(isSelf ? "" : m.id)}
                  >
                    <Star size={15} />
                  </button>
                  {!readOnly && (
                    <button
                      className="mini-btn danger"
                      title="Remove"
                      onClick={() => tryRemove(m.id, m.name)}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}

            <div className="add-member" hidden={readOnly}>
              <div className="add-fields">
                <div className="input compact flex1">
                  <UserPlus size={17} />
                  <input
                    placeholder="Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </div>
                <div className="input compact depo-add">
                  <span className="cur sm">{symbol}</span>
                  <input
                    placeholder="Deposit"
                    inputMode="decimal"
                    value={newAmt}
                    onChange={(e) => setNewAmt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </div>
              </div>
              <button className="add-btn" onClick={add} aria-label="Add person">
                <Check size={18} />
              </button>
            </div>
          </>
        )}

        {/* ---- Data ---- */}
        <div className="split-title">Data</div>
        <div
          className={`db-status ${
            configured ? (syncError ? "err" : "ok") : "off"
          }`}
        >
          <span className="db-dot" />
          {!configured
            ? "Local only — no database connected"
            : syncError
            ? `Cloud error: ${syncError}`
            : syncing
            ? "Syncing with Supabase…"
            : "Synced to Supabase (cloud)"}
        </div>
        {syncError.includes("trips") && (
          <div className="hint-line">
            Run <b>supabase-trips.sql</b> in the Supabase SQL editor to add
            multi-tour support.
          </div>
        )}
        {pending > 0 && writeStatus === "not-installed" && (
          <div className="warn-line">
            <AlertTriangle size={15} /> {pending} change{pending > 1 ? "s" : ""}{" "}
            waiting: run <b>supabase-edit-lock.sql</b> in Supabase.
          </div>
        )}
        {pending > 0 && writeStatus === "locked" && (
          <button className="warn-line" onClick={() => openUnlock()}>
            <Lock size={15} /> {pending} change{pending > 1 ? "s" : ""} made
            here wait for an unlock to be saved.
          </button>
        )}

        {canEdit && (
          <>
            <button className="row-btn" onClick={openLog}>
              <History size={17} /> Activity log
              <span className="row-count">{state.audit.length}</span>
            </button>
            <button
              className="row-btn"
              onClick={() => {
                createDemoTrip();
                close();
                setTab("dashboard");
                toast("Demo tour added — delete it any time");
              }}
            >
              <Database size={17} /> Add a demo tour
            </button>
            {configured && (
              <button className="row-btn" onClick={signOutAll}>
                <LogOut size={17} /> Sign out all devices
              </button>
            )}
            <button className="row-btn danger" onClick={doClear}>
              <Eraser size={17} /> Erase every tour
            </button>
          </>
        )}

        <button className="btn-primary" onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}
