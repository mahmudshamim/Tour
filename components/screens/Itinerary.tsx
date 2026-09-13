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
  Navigation,
  Clock,
  CalendarDays,
  MapPinned,
} from "lucide-react";
import AppHeader from "../AppHeader";
import { usePlaces, ICONS, PICKER, swapTarget, mapsUrl, type Place } from "../places";
import { useStore } from "../store";
import { useUI } from "../ui";
import { fmtClock, planDayDate, planDays, planOrder, type Trip } from "../models";

const dayName = (trip: Trip | undefined, n: number) => {
  const at = planDayDate(trip, n);
  return at
    ? new Date(at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "";
};

function DayPicker({
  value,
  days,
  trip,
  onChange,
}: {
  value: number;
  days: number;
  trip: Trip | undefined;
  onChange: (d: number) => void;
}) {
  return (
    <label className="day-pick">
      <CalendarDays size={14} />
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label="Day">
        <option value={0}>No day</option>
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            Day {d}
            {dayName(trip, d) ? ` · ${dayName(trip, d)}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function TimePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <label className="time-pick">
      <Clock size={14} />
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Time" />
    </label>
  );
}

export default function Itinerary() {
  const { places, toggle, add, update, move, remove, resetDone } = usePlaces();
  const { trip, readOnly } = useStore();
  const { confirm, openPlaceLoc } = useUI();
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("pin");
  const [newDay, setNewDay] = useState(0);
  const [newTime, setNewTime] = useState("");
  const [editMode, setEditMode] = useState(false);

  // locked (or archived) mid-edit → drop back to the read-only list
  useEffect(() => {
    if (readOnly) setEditMode(false);
  }, [readOnly]);

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
    add(newName, newIcon, newDay, newTime);
    setNewName("");
    setNewIcon("pin");
    setNewTime("");
  };

  const done = places.filter((p) => p.done).length;
  const total = places.length || 1;
  const pct = Math.round((done / total) * 100);

  const days = planDays(trip, places);
  const sorted = [...places].sort(planOrder);
  const planned = places.some((p) => p.day > 0);
  const usedDays = new Set(places.filter((p) => p.day > 0).map((p) => p.day)).size;
  // one block per day with stops, then the not-yet-scheduled ones
  const groups: { day: number; items: Place[] }[] = planned
    ? [
        ...Array.from({ length: days }, (_, i) => i + 1).map((d) => ({
          day: d,
          items: sorted.filter((p) => p.day === d),
        })),
        { day: 0, items: sorted.filter((p) => !p.day || p.day > days) },
      ].filter((g) => g.items.length || (editMode && g.day > 0 && g.day <= days))
    : [{ day: -1, items: sorted }];

  const row = (p: Place, i: number) => (
    <PlaceRow
      key={p.id}
      place={p}
      index={i}
      trip={trip}
      days={days}
      editMode={editMode}
      canUp={Boolean(swapTarget(places, p.id, -1))}
      canDown={Boolean(swapTarget(places, p.id, 1))}
      readOnly={readOnly}
      onToggle={() => toggle(p.id)}
      onUpdate={(patch) => update(p.id, patch)}
      onMoveUp={() => move(p.id, -1)}
      onMoveDown={() => move(p.id, 1)}
      onLocate={() => openPlaceLoc(p.id)}
      onDelete={() => confirmRemove(p.id, p.name)}
    />
  );

  return (
    <div className="screen fade-in">
      <AppHeader title="Trip Plan" />

      <div className="section-pad">
        <div className="section-head tight" style={{ marginTop: 8 }}>
          <div>
            <div className="section-title">{trip?.name || "Trip Plan"}</div>
            <div className="ov-sub">
              {places.length
                ? `${places.length} place${places.length > 1 ? "s" : ""}` +
                  (usedDays ? ` over ${usedDays} day${usedDays > 1 ? "s" : ""}` : "")
                : "No stops planned yet"}
            </div>
          </div>
          <div className="head-links">
            {places.length > 0 && !readOnly && (
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
            {done > 0 && !editMode && !readOnly && (
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

      {!planned && places.length > 1 && !readOnly && !editMode && (
        <div className="plan-tip">
          <CalendarDays size={15} /> Tap <b>Edit</b> to put stops on days, with times and map pins.
        </div>
      )}

      <div style={{ paddingTop: 8 }}>
        {groups.map((g) =>
          g.day === -1 ? (
            g.items.map(row)
          ) : (
            <div className="day-group" key={g.day}>
              <div className="day-title">
                <span className="dt-badge">{g.day ? `Day ${g.day}` : "Anytime"}</span>
                <span className="dt-date">{g.day ? dayName(trip, g.day) : "not on a day yet"}</span>
                <i />
                {g.items.length > 0 && (
                  <span className="dt-count">
                    {g.items.filter((p) => p.done).length}/{g.items.length}
                  </span>
                )}
              </div>
              {g.items.length ? g.items.map(row) : <div className="day-empty">Nothing on this day yet</div>}
            </div>
          )
        )}
      </div>

      {places.length === 0 && readOnly && (
        <div className="card list-card">
          <div className="empty sm">
            <MapPin size={24} />
            <p>No stops planned for this tour yet.</p>
          </div>
        </div>
      )}

      {/* add new place — view-only devices and archived tours can't */}
      <div className="add-place-card" hidden={readOnly}>
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
        <div className="add-when">
          <DayPicker value={newDay} days={days} trip={trip} onChange={setNewDay} />
          <TimePicker value={newTime} onChange={setNewTime} />
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
  trip,
  days,
  editMode,
  canUp,
  canDown,
  readOnly,
  onToggle,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onLocate,
  onDelete,
}: {
  place: Place;
  index: number;
  trip: Trip | undefined;
  days: number;
  editMode: boolean;
  canUp: boolean;
  canDown: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onUpdate: (patch: { name?: string; area?: string; day?: number; time?: string }) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onLocate: () => void;
  onDelete: () => void;
}) {
  const Icon = ICONS[p.icon] ?? MapPin;
  const [name, setName] = useState(p.name);
  const [area, setArea] = useState(p.area);
  const located = p.lat != null && p.lng != null;

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
          <div className="pf-when">
            <DayPicker value={p.day} days={days} trip={trip} onChange={(d) => onUpdate({ day: d })} />
            <TimePicker value={p.time} onChange={(t) => onUpdate({ time: t })} />
            <button
              className={`pf-loc ${located ? "on" : ""}`}
              onClick={onLocate}
              aria-label={located ? `Move ${p.name} on the map` : `Put ${p.name} on the map`}
            >
              <MapPinned size={15} />
            </button>
          </div>
        </div>
        <div className="place-reorder">
          <button
            className="move-btn"
            disabled={!canUp}
            onClick={onMoveUp}
            aria-label={`Move ${p.name} up`}
          >
            <ChevronUp size={16} />
          </button>
          <button
            className="move-btn"
            disabled={!canDown}
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
      <button className="place-main" onClick={onToggle} disabled={readOnly}>
        <span className="place-ico">
          <Icon size={20} />
        </span>
        <div className="place-info">
          <div className="place-name">{p.name}</div>
          <div className="place-area">
            {p.time && <span className="place-time">{fmtClock(p.time)}</span>}
            {(p.area || located) && (
              <span className="place-where">
                <MapPin size={12} /> {p.area || "On the map"}
              </span>
            )}
          </div>
        </div>
        <span className={`place-check ${p.done ? "on" : ""}`}>
          {p.done && <Check size={16} strokeWidth={3} />}
        </span>
      </button>
      <a
        className="place-go"
        href={mapsUrl(p, trip?.destination ?? "")}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Directions to ${p.name}`}
      >
        <Navigation size={16} />
      </a>
    </div>
  );
}
