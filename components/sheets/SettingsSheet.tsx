"use client";

import { useState } from "react";
import {
  UserPlus,
  Trash2,
  Check,
  Star,
  History,
  Database,
  Eraser,
  Lock,
  Archive,
  ArchiveRestore,
  Plus,
  Luggage,
} from "lucide-react";
import { initials } from "../constants";
import { useStore } from "../store";
import { usePlaces } from "../places";
import { useUI } from "../ui";
import PasswordModal from "../PasswordModal";

export default function SettingsSheet() {
  const {
    state,
    configured,
    syncing,
    syncError,
    archived,
    addMember,
    removeMember,
    updateMember,
    updateSettings,
    createTrip,
    switchTrip,
    archiveTrip,
    restoreTrip,
    deleteTrip,
    seedSample,
    clearAll,
  } = useStore();
  const { places } = usePlaces();
  const { close, openLog, confirm } = useUI();
  const s = state.settings;

  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [askPw, setAskPw] = useState(false);

  /* new-trip form */
  const [tripForm, setTripForm] = useState(false);
  const [tripName, setTripName] = useState("");
  const [copyPeople, setCopyPeople] = useState(true);
  const [copyPlaces, setCopyPlaces] = useState(false);

  const submitTrip = () => {
    if (!tripName.trim()) return;
    createTrip(tripName, {
      copyMembers: copyPeople,
      copyPlaces: copyPlaces ? places : undefined,
    });
    setTripName("");
    setTripForm(false);
  };

  const doArchive = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Archive “${name}”?`,
      message:
        "It becomes read-only — numbers, history and places stay exactly as they are. You can restore it any time.",
      confirmLabel: "Archive",
    });
    if (ok) archiveTrip(id);
  };

  const doDeleteTrip = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      message:
        "Erases that trip's people, expenses, history and places. This can't be undone.",
      confirmLabel: "Delete trip",
      danger: true,
    });
    if (ok) deleteTrip(id);
  };

  const doClear = async () => {
    const ok = await confirm({
      title: "Clear all data?",
      message: "Erases every trip, person and history entry. This can't be undone.",
      confirmLabel: "Erase everything",
      danger: true,
    });
    if (ok) {
      clearAll();
      close();
    }
  };

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
      message: "They'll be taken off this trip's people list.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) removeMember(id);
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>Settings</h2>

        {archived && (
          <div className="archived-note">
            <Archive size={15} /> This trip is archived — everything here is
            read-only.
          </div>
        )}

        {/* Trips */}
        <div className="split-title row-between">
          <span>Trips ({state.trips.length})</span>
          <button className="link" onClick={() => setTripForm((v) => !v)}>
            <Plus size={14} /> New trip
          </button>
        </div>

        {tripForm && (
          <div className="trip-form">
            <div className="input compact">
              <Luggage size={17} />
              <input
                placeholder="Trip name (e.g. Bandarban 2027)"
                value={tripName}
                autoFocus
                onChange={(e) => setTripName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitTrip()}
              />
            </div>
            <label className="opt-row">
              <button
                className={`check ${copyPeople ? "on" : ""}`}
                onClick={() => setCopyPeople((v) => !v)}
                type="button"
              >
                {copyPeople && <Check size={15} strokeWidth={3} />}
              </button>
              Copy people (deposits start at 0)
            </label>
            <label className="opt-row">
              <button
                className={`check ${copyPlaces ? "on" : ""}`}
                onClick={() => setCopyPlaces((v) => !v)}
                type="button"
              >
                {copyPlaces && <Check size={15} strokeWidth={3} />}
              </button>
              Copy places ({places.length}), all unticked
            </label>
            <button
              className="btn-primary"
              onClick={submitTrip}
              disabled={!tripName.trim()}
              style={{ opacity: tripName.trim() ? 1 : 0.5 }}
            >
              Create trip
            </button>
          </div>
        )}

        {state.trips.map((t) => {
          const active = t.id === state.tripId;
          return (
            <div className={`trip-row ${active ? "on" : ""}`} key={t.id}>
              <button
                className="trip-main"
                onClick={() => switchTrip(t.id)}
                disabled={active}
              >
                <span className="trip-name">{t.name || "Untitled trip"}</span>
                <span className="trip-meta">
                  {active && <span className="trip-badge on">VIEWING</span>}
                  {t.status === "archived" && (
                    <span className="trip-badge arc">ARCHIVED</span>
                  )}
                </span>
              </button>
              {t.status === "archived" ? (
                <button
                  className="mini-btn"
                  title="Restore"
                  onClick={() => restoreTrip(t.id)}
                >
                  <ArchiveRestore size={15} />
                </button>
              ) : (
                <button
                  className="mini-btn"
                  title="Archive"
                  onClick={() => doArchive(t.id, t.name)}
                >
                  <Archive size={15} />
                </button>
              )}
              {unlocked && state.trips.length > 1 && (
                <button
                  className="mini-btn danger"
                  title="Delete trip"
                  onClick={() => doDeleteTrip(t.id, t.name)}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}

        {/* Trip + currency */}
        <div className="tc-row">
          <div className="tc-trip">
            <div className="split-title">Trip name</div>
            <div className="input">
              <input
                placeholder="Trip name (e.g. Sylhet 2026)"
                value={s.tripName}
                disabled={archived}
                onChange={(e) => updateSettings({ tripName: e.target.value })}
              />
            </div>
          </div>
          <div className="tc-cur">
            <div className="split-title">Currency</div>
            <div className="input">
              <input
                className="cur-input"
                value={s.currency}
                maxLength={3}
                disabled={archived}
                onChange={(e) =>
                  updateSettings({ currency: e.target.value || "৳" })
                }
              />
            </div>
          </div>
        </div>

        {/* People + deposits */}
        <div className="split-title">
          People &amp; Deposits ({state.members.length})
        </div>
        {state.members.map((m) => {
          const isSelf = s.selfId === m.id;
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
                  onClick={() => {
                    setEditId(m.id);
                    setEditName(m.name);
                  }}
                >
                  {m.name}
                  {isSelf && <span className="you-badge">You</span>}
                </button>
              )}
              <div className="depo-input">
                <span className="cur sm">{s.currency}</span>
                <input
                  inputMode="decimal"
                  value={m.contribution || ""}
                  placeholder="0"
                  disabled={archived}
                  onChange={(e) =>
                    updateMember(m.id, {
                      contribution: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
              <button
                className={`mini-btn ${isSelf ? "on" : ""}`}
                title="Mark as you"
                onClick={() => updateSettings({ selfId: m.id })}
              >
                <Star size={15} />
              </button>
              {!archived && (
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

        <div className="add-member" hidden={archived}>
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
              <span className="cur sm">{s.currency}</span>
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

        {/* Data */}
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
            multi-trip support.
          </div>
        )}

        {unlocked ? (
          <>
            <button className="row-btn" onClick={openLog}>
              <History size={17} /> Activity log
              <span className="row-count">{state.audit.length}</span>
            </button>
            {state.members.length === 0 && (
              <button className="row-btn" onClick={seedSample}>
                <Database size={17} /> Load sample data
              </button>
            )}
            <button className="row-btn danger" onClick={doClear}>
              <Eraser size={17} /> Clear all data
            </button>
          </>
        ) : (
          <button className="row-btn" onClick={() => setAskPw(true)}>
            <Lock size={17} /> Unlock data options
            <span className="row-lock-hint">password</span>
          </button>
        )}

        <button className="btn-primary" onClick={close}>
          Done
        </button>
      </div>

      {askPw && (
        <PasswordModal
          onClose={() => setAskPw(false)}
          onSuccess={() => {
            setUnlocked(true);
            setAskPw(false);
          }}
        />
      )}
    </div>
  );
}
