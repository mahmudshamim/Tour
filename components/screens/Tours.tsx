"use client";

import { useMemo, type CSSProperties } from "react";
import {
  Lock,
  Plus,
  Share2,
  Pencil,
  ChevronRight,
  MapPin,
  CalendarDays,
  Luggage,
  Eye,
  Users,
  Wallet,
  Flag,
} from "lucide-react";
import AppHeader from "../AppHeader";
import CoverArt, { CoverPhoto } from "../CoverArt";
import { useTourPhoto } from "../covers";
import { useStore, cachedTripStats, tripStatsOf } from "../store";
import { usePlaces } from "../places";
import { useUI } from "../ui";
import { EMPTY_STATS, type TripStats } from "../db";
import {
  accentOf,
  phaseLabel,
  tourDates,
  tripPhase,
  tripYear,
  type Trip,
} from "../models";

/** Each tour paints itself in its own colours. */
const coverStyle = (t: Trip) => {
  const a = accentOf(t.accent);
  return { "--a1": a.from, "--a2": a.to } as CSSProperties;
};

/** ৳12,400 — whole numbers read better at a glance */
const short = (n: number, sym: string) =>
  sym + Math.round(n).toLocaleString("en-US");

/** ongoing → upcoming (soonest first) → undated → finished-but-not-archived */
function liveOrder(a: Trip, b: Trip): number {
  const rank = (t: Trip) =>
    ({ ongoing: 0, upcoming: 1, undated: 2, done: 3 })[tripPhase(t).kind];
  const r = rank(a) - rank(b);
  if (r) return r;
  if (a.startDate && b.startDate && a.startDate !== b.startDate)
    return rank(a) === 1
      ? a.startDate.localeCompare(b.startDate)
      : b.startDate.localeCompare(a.startDate);
  return b.createdAt - a.createdAt;
}

const pastKey = (t: Trip) => t.startDate || new Date(t.createdAt).toISOString();

export default function Tours() {
  const { state, isOrganiser, canEditTrip, configured, cacheTick, switchTrip } = useStore();
  const canEdit = isOrganiser;
  const { places } = usePlaces();
  const { setTab, openTrip, openUnlock, toast } = useUI();

  // the open tour straight from the live store; every other tour from its
  // offline copy (the store keeps one of each, refreshed in the background)
  const live = useMemo(
    () => tripStatsOf(state.members, state.txns, places),
    [state.members, state.txns, places]
  );
  const cached = useMemo(
    () => Object.fromEntries(state.trips.map((t) => [t.id, cachedTripStats(t.id)])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.trips, state.tripId, cacheTick]
  );
  const statsOf = (id: string): TripStats =>
    id === state.tripId ? live : cached[id] ?? EMPTY_STATS;

  /** Locked? Ask for the password first, then carry on to the form. */
  const newTour = () => (canEdit ? openTrip() : openUnlock(() => openTrip()));

  const { hero, others, pastByYear, pastCount, memories } = useMemo(() => {
    const active = state.trips.filter((t) => t.status !== "archived").sort(liveOrder);
    // the hero is whatever is happening now (ongoing → soonest upcoming),
    // not merely the tour this device last opened
    const hero = active[0];
    const past = state.trips
      .filter((t) => t.status === "archived")
      .sort((a, b) => pastKey(b).localeCompare(pastKey(a)));
    const years = new Map<number, Trip[]>();
    past.forEach((t) => {
      const y = tripYear(t, statsOf(t.id).first);
      years.set(y, [...(years.get(y) ?? []), t]);
    });
    return {
      hero,
      others: active.filter((t) => t !== hero),
      pastByYear: [...years.entries()],
      pastCount: past.length,
      memories: past,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.trips, cached]);

  const totals = memories.reduce(
    (acc, t) => {
      const s = statsOf(t.id);
      acc.spots += s.done;
      acc.people = Math.max(acc.people, s.people);
      return acc;
    },
    { spots: 0, people: 0 }
  );

  const open = (t: Trip) => {
    switchTrip(t.id);
    setTab("dashboard");
  };

  const share = async (t: Trip) => {
    const url = `${window.location.origin}${window.location.pathname}?trip=${t.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t.name, text: `${t.cover} ${t.name}`, url });
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied — anyone with it can view this tour");
    } catch {
      toast(url);
    }
  };

  const activeCount = state.trips.length - pastCount;

  return (
    <div className="screen fade-in">
      <AppHeader title="TerraExplore" tourScoped={false} />

      {configured && !isOrganiser && !canEditTrip(state.tripId) && (
        <button className="view-note" onClick={() => openUnlock()}>
          <Eye size={16} />
          <span>
            You&apos;re viewing. <b>Unlock to edit</b>
          </span>
          <ChevronRight size={16} />
        </button>
      )}

      <div className="section-pad">
        <div className="section-head tight">
          <div>
            <div className="section-title">Your tours</div>
            <div className="ov-sub">
              {state.trips.length === 0
                ? "Nothing planned yet"
                : `${state.trips.length} tour${state.trips.length > 1 ? "s" : ""}` +
                  (activeCount ? ` · ${activeCount} active` : "") +
                  (pastCount ? ` · ${pastCount} past` : "")}
            </div>
          </div>
          {state.trips.length > 0 && (
            <button className={`new-tour-btn ${canEdit ? "" : "locked"}`} onClick={newTour}>
              {canEdit ? <Plus size={16} /> : <Lock size={14} />} New tour
            </button>
          )}
        </div>
      </div>

      {state.trips.length === 0 && (
        <div className="card list-card">
          <div className="empty">
            <Luggage size={30} />
            <p>
              {canEdit
                ? "Plan your first tour — people, money, places, all in one spot."
                : "No tours yet. The organiser can unlock editing to create one."}
            </p>
            <button className="btn-primary" onClick={newTour}>
              {canEdit ? <Plus size={17} /> : <Lock size={16} />} New tour
            </button>
          </div>
        </div>
      )}

      {/* nothing on right now → invite the next one (the past stays below) */}
      {!hero && state.trips.length > 0 && (
        <button className="next-tour-cta rise" onClick={newTour}>
          <span className="ntc-ico">
            <Plus size={22} />
          </span>
          <span className="ntc-text">
            <b>Plan the next tour</b>
            <small>
              {canEdit
                ? "Destination, dates, people — then add expenses on the go"
                : "Needs the edit password"}
            </small>
          </span>
          <ChevronRight size={18} />
        </button>
      )}

      {hero && (
        <HeroCard
          trip={hero}
          stats={statsOf(hero.id)}
          viewing={hero.id === state.tripId}
          canEdit={canEditTrip(hero.id)}
          onOpen={() => open(hero)}
          onShare={() => share(hero)}
          onEdit={() => openTrip(hero.id)}
        />
      )}

      {others.length > 0 && (
        <>
          <div className="section-pad">
            <div className="section-head">
              <div className="section-title">Also planned</div>
            </div>
          </div>
          <div className="tour-list">
            {others.map((t, i) => (
              <TourRow
                key={t.id}
                trip={t}
                index={i}
                stats={statsOf(t.id)}
                viewing={t.id === state.tripId}
                onOpen={() => open(t)}
              />
            ))}
          </div>
        </>
      )}

      {pastCount > 0 && (
        <>
          <div className="section-pad">
            <div className="section-head">
              <div className="section-title">Past tours</div>
              <span className="sec-note">kept exactly as they ended</span>
            </div>
          </div>

          <div className="memories">
            <div>
              <b className="num">{pastCount}</b>
              <span>tour{pastCount > 1 ? "s" : ""} done</span>
            </div>
            <div>
              <b className="num">{totals.spots}</b>
              <span>spots explored</span>
            </div>
            <div>
              <b className="num">{totals.people}</b>
              <span>biggest crew</span>
            </div>
          </div>

          {pastByYear.map(([year, trips]) => (
            <div className="year-group" key={year}>
              <div className="year-label">
                <span>{year}</span>
                <i />
              </div>
              {trips.map((t, i) => (
                <PastCard
                  key={t.id}
                  trip={t}
                  index={i}
                  stats={statsOf(t.id)}
                  viewing={t.id === state.tripId}
                  onOpen={() => open(t)}
                />
              ))}
            </div>
          ))}
        </>
      )}

      <div className="stack-lg" />
    </div>
  );
}

function PhaseChip({ trip }: { trip: Trip }) {
  const p = tripPhase(trip);
  if (p.kind === "undated") return <span className="phase-chip">ACTIVE</span>;
  return (
    <span className={`phase-chip ${p.kind}`}>
      {p.kind === "ongoing" && <i className="live-dot" />}
      {phaseLabel(p).toUpperCase()}
    </span>
  );
}

function HeroCard({
  trip: t,
  stats: s,
  viewing,
  canEdit,
  onOpen,
  onShare,
  onEdit,
}: {
  trip: Trip;
  stats: TripStats;
  viewing: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onShare: () => void;
  onEdit: () => void;
}) {
  const dates = tourDates(t, s.first, s.last).text;
  const pct = s.pool > 0 ? Math.min(s.spent / s.pool, 1) : 0;
  const photo = useTourPhoto(t);
  return (
    <div className={`tour-hero rise ${photo ? "has-photo" : ""}`} style={coverStyle(t)}>
      {photo ? (
        <>
          <CoverPhoto src={photo} />
          <span className="cv-shade" />
        </>
      ) : (
        <CoverArt cover={t.cover} className="th-art" />
      )}

      <div className="th-top">
        <PhaseChip trip={t} />
        <div className="th-actions">
          <button className="th-btn" onClick={onShare} aria-label={`Share ${t.name}`}>
            <Share2 size={16} />
          </button>
          {canEdit && (
            <button className="th-btn" onClick={onEdit} aria-label={`Edit ${t.name}`}>
              <Pencil size={16} />
            </button>
          )}
        </div>
      </div>

      {photo ? <div className="th-gap" /> : <div className="th-emoji">{t.cover}</div>}
      <div className="th-name">{t.name}</div>
      <div className="th-sub">
        {t.destination && (
          <span>
            <MapPin size={13} /> {t.destination}
          </span>
        )}
        {dates && (
          <span>
            <CalendarDays size={13} /> {dates}
          </span>
        )}
      </div>
      {t.note && <div className="th-note">{t.note}</div>}

      <div className="th-stats">
        <div>
          <b className="num">{short(s.spent, t.currency)}</b>
          <span>{s.pool > 0 ? `of ${short(s.pool, t.currency)}` : "spent"}</span>
          <i className="th-bar">
            <i style={{ width: `${Math.round(pct * 100)}%` }} />
          </i>
        </div>
        <div>
          <b className="num">{s.people}</b>
          <span>people</span>
        </div>
        <div>
          <b className="num">
            {s.done}/{s.places}
          </b>
          <span>spots</span>
        </div>
      </div>

      <button className="th-open" onClick={onOpen}>
        {viewing ? "Continue this tour" : "Open tour"} <ChevronRight size={17} />
      </button>
    </div>
  );
}

function TourRow({
  trip: t,
  stats: s,
  index,
  viewing,
  onOpen,
}: {
  trip: Trip;
  stats: TripStats;
  index: number;
  viewing: boolean;
  onOpen: () => void;
}) {
  const dates = tourDates(t, s.first, s.last).text;
  const photo = useTourPhoto(t);
  return (
    <button
      className={`tour-row rise ${viewing ? "on" : ""}`}
      style={{ ...coverStyle(t), animationDelay: `${index * 0.06}s` }}
      onClick={onOpen}
    >
      <span className="cover-tile">
        {photo ? <CoverPhoto src={photo} /> : t.cover}
      </span>
      <span className="tr-info">
        <span className="tr-name">{t.name}</span>
        <span className="tr-sub">
          {[t.destination, dates].filter(Boolean).join(" · ") ||
            `${s.people} people · ${s.places} spots`}
        </span>
      </span>
      <PhaseChip trip={t} />
      <ChevronRight size={17} className="tr-chev" />
    </button>
  );
}

function PastCard({
  trip: t,
  stats: s,
  index,
  viewing,
  onOpen,
}: {
  trip: Trip;
  stats: TripStats;
  index: number;
  viewing: boolean;
  onOpen: () => void;
}) {
  const dates = tourDates(t, s.first, s.last).text;
  const photo = useTourPhoto(t);
  return (
    <button
      className={`past-card rise ${viewing ? "on" : ""}`}
      style={{ ...coverStyle(t), animationDelay: `${index * 0.06}s` }}
      onClick={onOpen}
    >
      <span className={`pc-cover ${photo ? "has-photo" : ""}`}>
        {photo ? (
          <CoverPhoto src={photo} />
        ) : (
          <>
            <CoverArt cover={t.cover} className="pc-art" />
            <span className="pc-emoji">{t.cover}</span>
          </>
        )}
      </span>
      <span className="pc-body">
        <span className="pc-top">
          <span className="pc-name">{t.name}</span>
          {viewing && <span className="trip-badge on">VIEWING</span>}
        </span>
        <span className="pc-sub">
          {[t.destination, dates].filter(Boolean).join(" · ") || "No expenses yet"}
        </span>
        <span className="pc-stats">
          <span>
            <Wallet size={12} /> {short(s.spent, t.currency)}
          </span>
          <span>
            <Users size={12} /> {s.people}
          </span>
          <span>
            <Flag size={12} /> {s.done}/{s.places}
          </span>
        </span>
      </span>
      <ChevronRight size={17} className="tr-chev" />
    </button>
  );
}
