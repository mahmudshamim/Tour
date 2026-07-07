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
} from "lucide-react";
import { initials } from "../constants";
import { useStore } from "../store";
import { useUI } from "../ui";

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
  const { close, openLog } = useUI();
  const s = state.settings;

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const add = () => {
    if (!newName.trim()) return;
    addMember(newName);
    setNewName("");
  };

  const saveEdit = () => {
    if (editId) updateMember(editId, editName);
    setEditId(null);
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>Settings</h2>

        {/* Trip */}
        <div className="split-title">Trip</div>
        <div className="field">
          <div className="input">
            <input
              placeholder="Trip name (e.g. Patagonia 2026)"
              value={s.tripName}
              onChange={(e) => updateSettings({ tripName: e.target.value })}
            />
          </div>
        </div>
        <div className="field-row">
          <div>
            <label className="mini-label">Total budget</label>
            <div className="input compact">
              <span className="cur">{s.currency}</span>
              <input
                placeholder="0"
                inputMode="decimal"
                value={s.budget || ""}
                onChange={(e) =>
                  updateSettings({ budget: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div>
            <label className="mini-label">Currency</label>
            <div className="input compact">
              <input
                value={s.currency}
                maxLength={3}
                onChange={(e) =>
                  updateSettings({ currency: e.target.value || "৳" })
                }
              />
            </div>
          </div>
        </div>

        {/* People */}
        <div className="split-title">People ({state.members.length})</div>
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
                onClick={() =>
                  confirm(`Remove ${m.name}?`) && removeMember(m.id)
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}

        <div className="add-member">
          <div className="input compact flex1">
            <UserPlus size={17} />
            <input
              placeholder="Add a person"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
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
        <button className="row-btn" onClick={openLog}>
          <History size={17} /> Activity log
          <span className="row-count">{state.audit.length}</span>
        </button>
        {state.members.length === 0 && (
          <button className="row-btn" onClick={seedSample}>
            <Database size={17} /> Load sample data
          </button>
        )}
        <button
          className="row-btn danger"
          onClick={() =>
            confirm("Erase all trips, people and history? Cannot be undone.") &&
            clearAll()
          }
        >
          <Eraser size={17} /> Clear all data
        </button>

        <button className="btn-primary" onClick={close}>
          Done
        </button>
      </div>
    </div>
  );
}
