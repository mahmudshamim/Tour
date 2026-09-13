"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  Check,
  Luggage,
  MapPin,
  Navigation,
  CalendarDays,
  Route,
  Clock,
  Quote,
  Archive,
  ArchiveRestore,
  Trash2,
  Lock,
  ImagePlus,
  KeyRound,
} from "lucide-react";
import { useStore, cachedTripStats, tripStatsOf } from "../store";
import { usePlaces } from "../places";
import { useUI } from "../ui";
import CoverArt, { CoverPhoto } from "../CoverArt";
import { useCover, stockPhoto } from "../covers";
import { shrinkPhoto } from "../photo";
import { lockMessage } from "../editLock";

/** Organiser only: a password that edits just this one tour. */
function CoOrganiser({ tripId }: { tripId: string }) {
  const { setTripPassword, tripLocks } = useStore();
  const { toast } = useUI();
  const [has, setHas] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    tripLocks().then((list) => alive && setHas(list ? list.includes(tripId) : null));
    return () => {
      alive = false;
    };
  }, [tripId, tripLocks]);

  const apply = async (value: string) => {
    setBusy(true);
    setErr("");
    const res = await setTripPassword(tripId, value);
    setBusy(false);
    if (!res.ok) return setErr(lockMessage(res.error));
    setHas(res.locked);
    setPw("");
    toast(res.locked ? "Tour password set — share it with your co-organiser" : "Tour password removed");
  };

  return (
    <div className="coorg">
      <div className="split-title">Co-organiser password</div>
      <p className="field-hint">
        {has
          ? "This tour has its own password: whoever has it can edit this tour — and nothing else. Changing it signs them out."
          : "Let a friend run this tour: they unlock with this password while viewing it, and can edit only this tour."}
      </p>
      <div className="add-member">
        <div className="input compact flex1">
          <KeyRound size={16} />
          <input
            placeholder={has ? "New tour password" : "Tour password (6+ characters)"}
            value={pw}
            autoComplete="off"
            onChange={(e) => {
              setErr("");
              setPw(e.target.value);
            }}
          />
        </div>
        <button
          type="button"
          className="loc-btn"
          disabled={busy || pw.length < 6}
          onClick={() => apply(pw)}
        >
          {busy ? "…" : has ? "Change" : "Set"}
        </button>
      </div>
      {has && (
        <button type="button" className="link danger-link" onClick={() => apply("")} disabled={busy}>
          Remove tour password
        </button>
      )}
      {err && <div className="field-err">{err}</div>}
    </div>
  );
}
import {
  ACCENTS,
  COVERS,
  DEFAULT_DETAILS,
  accentOf,
  fmtDateRange,
  guessTheme,
  ymdOf,
  type Trip,
  type TripDraft,
} from "../models";

const draftOf = (t: Trip): TripDraft => ({
  name: t.name,
  currency: t.currency,
  destination: t.destination,
  origin: t.origin,
  startDate: t.startDate,
  endDate: t.endDate,
  cover: t.cover,
  accent: t.accent,
  note: t.note,
  distanceKm: t.distanceKm,
  travelTime: t.travelTime,
});

/** Create a tour, or edit one (`tripId`). Details only — money, people
 *  and places live in their own screens. */
export default function TripSheet({ tripId }: { tripId?: string }) {
  const {
    state,
    trip: current,
    configured,
    isOrganiser,
    canEditTrip,
    createTrip,
    updateTrip,
    archiveTrip,
    restoreTrip,
    deleteTrip,
    setCover,
  } = useStore();
  const { places } = usePlaces();
  const { close, confirm, setTab, toast, openUnlock } = useUI();

  const editing = tripId ? state.trips.find((t) => t.id === tripId) : undefined;

  // an undated tour gets its dates filled in from its first and last
  // expense — the organiser only has to check them and save
  const [datesGuessed] = useState(() => {
    if (!editing || editing.startDate || editing.endDate) return false;
    const s =
      editing.id === state.tripId
        ? tripStatsOf([], state.txns, [])
        : cachedTripStats(editing.id);
    return Boolean(s?.first);
  });
  const [d, setD] = useState<TripDraft>(() => {
    if (!editing) return { ...DEFAULT_DETAILS, name: "", currency: current?.currency || "৳" };
    const draft = draftOf(editing);
    if (datesGuessed) {
      const s =
        editing.id === state.tripId
          ? tripStatsOf([], state.txns, [])
          : cachedTripStats(editing.id)!;
      draft.startDate = ymdOf(s.first);
      draft.endDate = ymdOf(s.last || s.first);
    }
    return draft;
  });
  const set = (patch: Partial<TripDraft>) => setD((x) => ({ ...x, ...patch }));

  // a new tour's cover + colour follow its name/destination ("Sylhet" →
  // tea leaves, green) until the organiser picks their own
  const [looksPicked, setLooksPicked] = useState(Boolean(editing));
  const setPlace = (patch: Partial<TripDraft>) =>
    setD((x) => {
      const next = { ...x, ...patch };
      if (looksPicked) return next;
      const t = guessTheme(next.name, next.destination);
      return t ? { ...next, cover: t.cover, accent: t.accent } : next;
    });

  // the tour's own photo: undefined = leave as is, null = remove
  const ownPhoto = useCover(editing?.id);
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState("");
  const mine = photo === undefined ? ownPhoto : photo;
  const shownPhoto = mine ?? stockPhoto(d.cover);

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhotoErr("");
    setPhotoBusy(true);
    try {
      setPhoto(await shrinkPhoto(file));
    } catch {
      setPhotoErr("Couldn't use that photo — try another one");
    } finally {
      setPhotoBusy(false);
    }
  };

  const [copyPeople, setCopyPeople] = useState(true);
  const [copyPlaces, setCopyPlaces] = useState(false);

  const acc = accentOf(d.accent);
  const dateErr =
    d.startDate && d.endDate && d.endDate < d.startDate
      ? "End date is before the start date"
      : "";
  const valid = Boolean(d.name.trim()) && !dateErr;
  const dates = fmtDateRange(d.startDate, d.endDate);

  // a new tour needs the organiser; editing one, that tour's rights
  const allowed = editing ? canEditTrip(editing.id) : isOrganiser;
  if (!allowed) {
    return (
      <div className="sheet-overlay" onClick={close}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <div className="sheet-grip" />
          <div className="empty">
            <Lock size={28} />
            <p>
              {editing
                ? "Changing this tour needs the organiser password or its own tour password."
                : "Only the organiser can start a new tour — unlock with the organiser password."}
            </p>
            <button className="btn-primary" onClick={() => openUnlock()}>
              Unlock editing
            </button>
          </div>
        </div>
      </div>
    );
  }

  const save = () => {
    if (!valid) return;
    if (editing) {
      updateTrip(editing.id, d);
      if (photo !== undefined) setCover(editing.id, photo);
      toast("Tour updated");
      close();
      return;
    }
    const id = createTrip(d, {
      copyMembers: copyPeople && state.members.length > 0,
      copyPlaces: copyPlaces ? places : undefined,
    });
    if (id && photo) setCover(id, photo);
    close();
    setTab("dashboard");
    toast(`${d.cover} ${d.name.trim()} is ready`);
  };

  const doArchive = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: `Archive “${editing.name}”?`,
      message:
        "It moves to Past tours and becomes read-only — numbers, history and places stay exactly as they are. You can restore it any time.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    archiveTrip(editing.id);
    toast("Moved to Past tours");
    close();
  };

  const doDelete = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: `Delete “${editing.name}”?`,
      message:
        "Erases this tour's people, expenses, history and places for everyone. This can't be undone — archive it instead to keep it.",
      confirmLabel: "Delete tour",
      danger: true,
    });
    if (!ok) return;
    deleteTrip(editing.id);
    toast("Tour deleted");
    close();
  };

  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  return (
    <div className="sheet-overlay" onClick={close}>
      <div className="sheet tall" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <h2>{editing ? "Edit tour" : "New tour"}</h2>

        {/* live preview — what the Tours hub will show */}
        <div
          className={`tour-preview ${shownPhoto ? "has-photo" : ""}`}
          style={{ "--a1": acc.from, "--a2": acc.to } as CSSProperties}
        >
          {shownPhoto ? (
            <>
              <CoverPhoto src={shownPhoto} />
              <span className="cv-shade" />
            </>
          ) : (
            <CoverArt cover={d.cover} className="tp-art" />
          )}
          {!shownPhoto && <span className="tp-emoji">{d.cover}</span>}
          <span className="tp-info">
            <span className="tp-name">{d.name.trim() || "Tour name"}</span>
            <span className="tp-sub">
              {[d.destination, dates].filter(Boolean).join(" · ") ||
                "Destination · dates"}
            </span>
          </span>
        </div>

        <div className="field">
          <label>Name</label>
          <div className="input">
            <Luggage size={17} />
            <input
              placeholder="e.g. Cox's Bazar 2026"
              value={d.name}
              autoFocus={!editing}
              maxLength={60}
              onChange={(e) => setPlace({ name: e.target.value })}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Destination</label>
            <div className="input compact">
              <MapPin size={16} />
              <input
                placeholder="Where to"
                value={d.destination}
                maxLength={40}
                onChange={(e) => setPlace({ destination: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Starting from</label>
            <div className="input compact">
              <Navigation size={16} />
              <input
                placeholder="e.g. Dhaka"
                value={d.origin}
                maxLength={40}
                onChange={(e) => set({ origin: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Starts</label>
            <div className="input compact">
              <CalendarDays size={16} />
              <input
                type="date"
                value={d.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>Ends</label>
            <div className={`input compact ${dateErr ? "bad" : ""}`}>
              <CalendarDays size={16} />
              <input
                type="date"
                value={d.endDate}
                min={d.startDate || undefined}
                onChange={(e) => set({ endDate: e.target.value })}
              />
            </div>
          </div>
        </div>
        {dateErr && <div className="field-err">{dateErr}</div>}
        {datesGuessed && !dateErr && (
          <div className="field-hint">
            Filled in from the first and last expense — check and save.
          </div>
        )}

        <div className="split-title">Photo</div>
        <div className="photo-row">
          <label className="photo-pick">
            {shownPhoto ? <img src={shownPhoto} alt="" /> : <ImagePlus size={22} />}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                pickPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <div className="photo-side">
            <div className="photo-btns">
              <label className="link photo-link">
                <ImagePlus size={14} /> {mine ? "Change" : "Choose photo"}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    pickPhoto(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {mine && (
                <button type="button" className="link danger-link" onClick={() => setPhoto(null)}>
                  <Trash2 size={14} /> Remove
                </button>
              )}
            </div>
            <small className="photo-note">
              {photoBusy
                ? "Shrinking the photo…"
                : photoErr
                ? photoErr
                : mine
                ? "Your photo — saved with the tour, works offline"
                : shownPhoto
                ? "Built-in photo for this place — pick one of yours any time"
                : "From your gallery — it's shrunk on the phone first"}
            </small>
          </div>
        </div>

        <div className="split-title">Cover</div>
        <div className="cover-grid">
          {COVERS.map((c) => (
            <button
              key={c}
              className={`cover-pick ${d.cover === c ? "on" : ""}`}
              onClick={() => {
                set({ cover: c });
                setLooksPicked(true);
              }}
              aria-label={`Cover ${c}`}
              type="button"
            >
              {c}
            </button>
          ))}
        </div>

        <div className="split-title">Colour</div>
        <div className="swatch-row">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`swatch ${d.accent === a.id ? "on" : ""}`}
              style={{ background: `linear-gradient(145deg, ${a.from}, ${a.to})` }}
              onClick={() => {
                set({ accent: a.id });
                setLooksPicked(true);
              }}
              aria-label={a.label}
              title={a.label}
            >
              {d.accent === a.id && <Check size={15} strokeWidth={3} />}
            </button>
          ))}
        </div>

        <div className="field">
          <label>Tagline</label>
          <div className="input compact">
            <Quote size={16} />
            <input
              placeholder="Optional — e.g. Sea, sand & zero plans"
              value={d.note}
              maxLength={80}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label>Distance (km)</label>
            <div className="input compact">
              <Route size={16} />
              <input
                inputMode="decimal"
                placeholder="Optional"
                value={d.distanceKm || ""}
                onChange={(e) => set({ distanceKm: num(e.target.value) })}
              />
            </div>
          </div>
          <div className="field">
            <label>Travel time</label>
            <div className="input compact">
              <Clock size={16} />
              <input
                placeholder="e.g. 5h drive"
                value={d.travelTime}
                maxLength={24}
                onChange={(e) => set({ travelTime: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="field cur-field">
          <label>Currency</label>
          <div className="input compact">
            <input
              className="cur-input"
              value={d.currency}
              maxLength={3}
              onChange={(e) => set({ currency: e.target.value })}
            />
          </div>
        </div>

        {!editing && current && (state.members.length > 0 || places.length > 0) && (
          <div className="trip-form">
            <div className="mini-label">Start from “{current.name}”</div>
            {state.members.length > 0 && (
              <label className="opt-row">
                <button
                  className={`check ${copyPeople ? "on" : ""}`}
                  onClick={() => setCopyPeople((v) => !v)}
                  type="button"
                >
                  {copyPeople && <Check size={15} strokeWidth={3} />}
                </button>
                Copy {state.members.length} people (deposits start at 0)
              </label>
            )}
            {places.length > 0 && (
              <label className="opt-row">
                <button
                  className={`check ${copyPlaces ? "on" : ""}`}
                  onClick={() => setCopyPlaces((v) => !v)}
                  type="button"
                >
                  {copyPlaces && <Check size={15} strokeWidth={3} />}
                </button>
                Copy {places.length} places, all unticked
              </label>
            )}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={save}
          disabled={!valid}
          style={{ opacity: valid ? 1 : 0.5 }}
        >
          {editing ? "Save changes" : "Create tour"}
        </button>

        {editing && configured && isOrganiser && <CoOrganiser tripId={editing.id} />}

        {editing && (
          <div className="danger-zone">
            {editing.status === "archived" ? (
              <button
                className="row-btn"
                onClick={() => {
                  restoreTrip(editing.id);
                  toast("Restored — editable again");
                  close();
                }}
              >
                <ArchiveRestore size={17} /> Restore to active
              </button>
            ) : (
              <button className="row-btn" onClick={doArchive}>
                <Archive size={17} /> Archive — move to Past tours
              </button>
            )}
            {isOrganiser && (
              <button className="row-btn danger" onClick={doDelete}>
                <Trash2 size={17} /> Delete tour
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
