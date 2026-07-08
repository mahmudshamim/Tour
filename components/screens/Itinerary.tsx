"use client";

import { useEffect, useState } from "react";
import {
  Check,
  MapPin,
  Plus,
  Trash2,
  RotateCcw,
  Pencil,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import AppHeader from "../AppHeader";
import { usePlaces, ICONS, PICKER, type Place } from "../places";
import { useUI } from "../ui";

export default function Itinerary() {
  const { places, toggle, add, update, move, remove, resetDone } = usePlaces();
  const { confirm } = useUI();
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("pin");
  const [editMode, setEditMode] = useState(false);

  const confirmRemove = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Remove “${name}”?`,
      message: "This place will be taken off your trip plan.",
      confirmLabel: "Remove",
      danger: true,
    });
    if (ok) remove(id);
  };

  const submit = () => {
    if (!newName.trim()) return;
    add(newName, newIcon);
    setNewName("");
    setNewIcon("pin");
  };

  const done = places.filter((p) => p.done).length;
  const total = places.length || 1;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="screen fade-in">
      <AppHeader title="Trip Plan" />

      <div className="section-pad">
        <div className="section-head tight" style={{ marginTop: 8 }}>
          <div>
            <div className="section-title">সিলেট ট্রিপ</div>
            <div className="ov-sub">{places.length} places to explore</div>
          </div>
          <div className="head-links">
            {places.length > 0 && (
              <button
                className={`link ${editMode ? "on" : ""}`}
                onClick={() => setEditMode((e) => !e)}
              >
                {editMode ? (
                  <>
                    <Check size={14} /> Done
                  </>
                ) : (
                  <>
                    <Pencil size={14} /> Edit
                  </>
                )}
              </button>
            )}
            {done > 0 && !editMode && (
              <button className="link" onClick={resetDone}>
                <RotateCcw size={14} /> Reset
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card summary-card" style={{ paddingBottom: 16 }}>
        <div className="trip-prog-top">
          <span className="eyebrow">Explored</span>
          <span className="trip-prog-count num">
            {done} <small>/ {places.length}</small>
          </span>
        </div>
        <div className="progress">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-legend">
          <span className="used">{pct}% DONE</span>
          <span className="rem">{places.length - done} left</span>
        </div>
      </div>

      <div style={{ paddingTop: 8 }}>
        {places.map((p, i) => (
          <PlaceRow
            key={p.id}
            place={p}
            index={i}
            editMode={editMode}
            isFirst={i === 0}
            isLast={i === places.length - 1}
            onToggle={() => toggle(p.id)}
            onUpdate={(patch) => update(p.id, patch)}
            onMoveUp={() => move(p.id, -1)}
            onMoveDown={() => move(p.id, 1)}
            onDelete={() => confirmRemove(p.id, p.name)}
          />
        ))}
      </div>

      {/* add new place */}
      <div className="add-place-card">
        <div className="split-title">Add a place</div>
        <div className="icon-picker">
          {PICKER.map((k) => {
            const Ic = ICONS[k];
            return (
              <button
                key={k}
                className={`ic-pick ${newIcon === k ? "on" : ""}`}
                onClick={() => setNewIcon(k)}
                aria-label={k}
              >
                <Ic size={17} />
              </button>
            );
          })}
        </div>
        <div className="add-member">
          <div className="input compact flex1">
            <MapPin size={17} />
            <input
              placeholder="New place name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          <button className="add-btn" onClick={submit} aria-label="Add place">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="stack-lg" />
    </div>
  );
}

function PlaceRow({
  place: p,
  index,
  editMode,
  isFirst,
  isLast,
  onToggle,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  place: Place;
  index: number;
  editMode: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onUpdate: (patch: { name?: string; area?: string }) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  const Icon = ICONS[p.icon] ?? MapPin;
  const [name, setName] = useState(p.name);
  const [area, setArea] = useState(p.area);

  // Keep drafts in sync if the stored values change elsewhere.
  useEffect(() => setName(p.name), [p.name]);
  useEffect(() => setArea(p.area), [p.area]);

  const commitName = () => {
    const t = name.trim();
    if (t && t !== p.name) onUpdate({ name: t });
    else setName(p.name);
  };
  const commitArea = () => {
    const t = area.trim();
    if (t !== p.area) onUpdate({ area: t });
  };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  if (editMode) {
    return (
      <div
        className="place-row editing rise"
        style={{ animationDelay: `${index * 0.04}s` }}
      >
        <span className="place-ico">
          <Icon size={20} />
        </span>
        <div className="place-fields">
          <input
            className="pf pf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={blurOnEnter}
            onBlur={commitName}
            placeholder="Place name"
            aria-label="Place name"
          />
          <div className="pf-area">
            <MapPin size={13} />
            <input
              className="pf pf-sub"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              onKeyDown={blurOnEnter}
              onBlur={commitArea}
              placeholder="Location / area"
              aria-label="Location"
            />
          </div>
        </div>
        <div className="place-reorder">
          <button
            className="move-btn"
            disabled={isFirst}
            onClick={onMoveUp}
            aria-label={`Move ${p.name} up`}
          >
            <ChevronUp size={16} />
          </button>
          <button
            className="move-btn"
            disabled={isLast}
            onClick={onMoveDown}
            aria-label={`Move ${p.name} down`}
          >
            <ChevronDown size={16} />
          </button>
        </div>
        <button
          className="place-del on"
          aria-label={`Remove ${p.name}`}
          onClick={onDelete}
        >
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`place-row rise ${p.done ? "done" : ""}`}
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <button className="place-main" onClick={onToggle}>
        <span className="place-ico">
          <Icon size={20} />
        </span>
        <div className="place-info">
          <div className="place-name">{p.name}</div>
          <div className="place-area">
            <MapPin size={12} /> {p.area}
          </div>
        </div>
        <span className={`place-check ${p.done ? "on" : ""}`}>
          {p.done && <Check size={16} strokeWidth={3} />}
        </span>
      </button>
    </div>
  );
}
