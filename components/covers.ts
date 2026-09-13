/* ============================================================
   Cover photos on this device.

   Photos live in Cache Storage, not localStorage: localStorage is
   small and it's where the outbox of unsynced expenses lives — a few
   photos must never be able to crowd that out. A tiny index of which
   version each tour's photo is (localStorage) decides what to fetch.

   Tours without their own photo can still get a built-in one for the
   place (a tea garden for Sylhet) — bundled, so it works offline.
   ============================================================ */

import { useEffect, useSyncExternalStore } from "react";
import { loadCover, loadCoverIndex } from "./db";
import { sceneFor } from "./CoverArt";

const CACHE = "terra-covers-v1";
const IDX_KEY = "terra.covers.v1"; // { [tripId]: updatedAt } held on this device
const keyOf = (tripId: string) => `/__terra/cover/${encodeURIComponent(tripId)}`;

/** Built-in photos for places that have one (Unsplash License). */
const STOCK: Record<string, string> = {
  tea: "/covers/tea.jpg", // tea garden on rolling hills — Sylhet, Srimangal
};
export const stockPhoto = (cover: string): string | null =>
  STOCK[sceneFor(cover)] ?? null;

const mem = new Map<string, string | null>(); // tripId → photo (null = none)
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version++;
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
const snapshot = () => version;

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches !== "undefined" ? await caches.open(CACHE) : null;
  } catch {
    return null; // not a secure context (plain-http LAN address) → memory only
  }
}

function readIdx(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(IDX_KEY) || "{}");
  } catch {
    return {};
  }
}
function writeIdx(idx: Record<string, number>) {
  try {
    localStorage.setItem(IDX_KEY, JSON.stringify(idx));
  } catch {
    /* ignore */
  }
}

/** Put (or clear, with null) a tour's own photo on this device. */
export async function setLocalCover(
  tripId: string,
  photo: string | null,
  updatedAt = Date.now()
) {
  mem.set(tripId, photo);
  emit();
  const idx = readIdx();
  const cache = await openCache();
  if (photo) {
    idx[tripId] = updatedAt;
    await cache?.put(keyOf(tripId), new Response(photo)).catch(() => {});
  } else {
    delete idx[tripId];
    await cache?.delete(keyOf(tripId)).catch(() => {});
  }
  writeIdx(idx);
}

async function loadLocal(tripId: string) {
  if (mem.has(tripId)) return;
  mem.set(tripId, null); // "looked" — don't read twice
  const cache = await openCache();
  const hit = await cache?.match(keyOf(tripId)).catch(() => undefined);
  if (hit) {
    mem.set(tripId, await hit.text());
    emit();
  }
}

/**
 * Bring this device's photos in line with the cloud. Photos changed here
 * and still queued (`pending`) are left alone — they win until uploaded.
 */
export async function syncCovers(
  tripIds: string[],
  pending: Record<string, string | null>
) {
  const res = await loadCoverIndex();
  if (!res.ok) return;
  const idx = readIdx();
  for (const id of tripIds) {
    if (id in pending) continue;
    const server = res.index[id];
    if (!server) {
      if (idx[id]) await setLocalCover(id, null);
      continue;
    }
    if (idx[id] === server) continue;
    const photo = await loadCover(id);
    if (photo) await setLocalCover(id, photo, server);
  }
}

/** The tour's own photo, if it has one (null otherwise). */
export function useCover(tripId: string | undefined): string | null {
  useSyncExternalStore(subscribe, snapshot, () => 0);
  useEffect(() => {
    if (tripId) loadLocal(tripId);
  }, [tripId]);
  return tripId ? mem.get(tripId) ?? null : null;
}

/** What to show on a tour's cover: its own photo, else the place's
 *  built-in one, else nothing (the drawn scene takes over). */
export function useTourPhoto(trip: { id: string; cover: string } | undefined) {
  const own = useCover(trip?.id);
  return own ?? (trip ? stockPhoto(trip.cover) : null);
}
