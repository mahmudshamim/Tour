"use client";

import { useState } from "react";
import { Check, MapPin, Plus, Trash2, RotateCcw } from "lucide-react";
import AppHeader from "../AppHeader";
import { usePlaces, ICONS, PICKER } from "../places";

export default function Itinerary() {
  const { places, toggle, add, remove, resetDone } = usePlaces();
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("pin");

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
          {done > 0 && (
            <button className="link" onClick={resetDone}>
              <RotateCcw size={14} /> Reset
            </button>
          )}
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
        {places.map((p, i) => {
          const Icon = ICONS[p.icon] ?? MapPin;
          return (
            <div
              key={p.id}
              className={`place-row rise ${p.done ? "done" : ""}`}
              style={{ animationDelay: `${i * 0.04}s` }}
            >
              <button className="place-main" onClick={() => toggle(p.id)}>
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
              <button
                className="place-del"
                aria-label="Remove place"
                onClick={() => remove(p.id)}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
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
