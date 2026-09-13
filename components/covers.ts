/* ============================================================
   Tour cover photos on this device (bytes live in photoStore).

   A tiny index of which version of each tour's photo this device
   holds (localStorage) decides what to download. Tours without their
   own photo can still get a built-in one for the place — a tea garden
   for Sylhet — bundled, so it works offline.
   ============================================================ */

import { useEffect, useSyncExternalStore } from "react";
import { loadCover, loadCoverIndex } from "./db";
import { sceneFor } from "./CoverArt";
import { putPhoto, dropPhoto, getPhoto, peek, subscribe, snapshot } from "./photoStore";

const IDX_KEY = "terra.covers.v1"; // { [tripId]: updatedAt } held on this device

/** Built-in photos for places that have one (Unsplash License). */
const STOCK: Record<string, string> = {
  tea: "/covers/tea.jpg", // tea garden on rolling hills — Sylhet, Srimangal
};
export const stockPhoto = (cover: string): string | null =>
  STOCK[sceneFor(cover)] ?? null;

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
  const idx = readIdx();
  if (photo) {
    idx[tripId] = updatedAt;
    await putPhoto("covers", tripId, photo);
  } else {
    delete idx[tripId];
    await dropPhoto("covers", tripId);
  }
  writeIdx(idx);
}

/** The photo bytes for an upload that's about to go out. */
export const coverForUpload = (tripId: string) => getPhoto("covers", tripId);

/**
 * Bring this device's photos in line with the cloud. Photos changed here
 * and still queued (`pending`) are left alone — they win until uploaded.
 */
export async function syncCovers(tripIds: string[], pending: Set<string>) {
  const res = await loadCoverIndex();
  if (!res.ok) return;
  const idx = readIdx();
  for (const id of tripIds) {
    if (pending.has(id)) continue;
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
    if (tripId) getPhoto("covers", tripId);
  }, [tripId]);
  return tripId ? peek("covers", tripId) ?? null : null;
}

/** What to show on a tour's cover: its own photo, else the place's
 *  built-in one, else nothing (the drawn scene takes over). */
export function useTourPhoto(trip: { id: string; cover: string } | undefined) {
  const own = useCover(trip?.id);
  return own ?? (trip ? stockPhoto(trip.cover) : null);
}
