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
} from "lucide-react";
import { initials } from "../constants";
import { useStore } from "../store";
import { useUI } from "../ui";
import PasswordModal from "../PasswordModal";

export default function SettingsSheet() {
  const {
    state,
    configured,
    syncing,
    addMember,
    removeMember,
    updateMember,
    updateSettings,
    seedSample,
    clearAll,
  } = useStore();
  const { close, openLog, confirm } = useUI();
  const s = state.settings;

  const [newName, setNewName] = useState("");
  const [newAmt, setNewAmt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [askPw, setAskPw] = useState(false);

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

        {/* Trip + currency */}
        <div className="tc-row">
          <div className="tc-trip">
            <div className="split-title">Trip</div>
            <div className="input">
              <input
                placeholder="Trip name (e.g. Sylhet 2026)"
                value={s.tripName}
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
              <button
                className="mini-btn danger"
                title="Remove"
                onClick={() => tryRemove(m.id, m.name)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}

        <div className="add-member">
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
        <div className={`db-status ${configured ? "ok" : "off"}`}>
          <span className="db-dot" />
          {configured
            ? syncing
              ? "Syncing with Supabase…"
              : "Synced to Supabase (cloud)"
            : "Local only — no database connected"}
        </div>

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
