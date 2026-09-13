/* ============================================================
   Photos on this device — tour covers and expense receipts.

   Kept in Cache Storage, never localStorage: localStorage is small and
   it's where the outbox of unsynced expenses lives, so photos must not
   be able to crowd it out. The outbox only holds a reference; the
   photo itself is read from here at upload time.

   Plain-http LAN addresses have no Cache Storage → memory only.
   ============================================================ */

export type Bucket = "covers" | "receipts";

const CACHE = "terra-photos-v1";
const keyOf = (bucket: Bucket, key: string) =>
  `/__terra/${bucket}/${encodeURIComponent(key)}`;

const mem = new Map<string, string | null>(); // "bucket/key" → photo (null = none)
const listeners = new Set<() => void>();
let version = 0;

export const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
export const snapshot = () => version;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

async function openCache(): Promise<Cache | null> {
  try {
    return typeof caches !== "undefined" ? await caches.open(CACHE) : null;
  } catch {
    return null;
  }
}

/** What's in memory right now (undefined = not looked up yet). */
export const peek = (bucket: Bucket, key: string) => mem.get(`${bucket}/${key}`);

export async function putPhoto(bucket: Bucket, key: string, photo: string) {
  mem.set(`${bucket}/${key}`, photo);
  emit();
  const cache = await openCache();
  await cache?.put(keyOf(bucket, key), new Response(photo)).catch(() => {});
}

export async function dropPhoto(bucket: Bucket, key: string) {
  mem.set(`${bucket}/${key}`, null);
  emit();
  const cache = await openCache();
  await cache?.delete(keyOf(bucket, key)).catch(() => {});
}

/** Memory, then the device cache. Null if this device doesn't have it. */
export async function getPhoto(bucket: Bucket, key: string): Promise<string | null> {
  const k = `${bucket}/${key}`;
  const known = mem.get(k);
  if (known !== undefined) return known;
  const cache = await openCache();
  const hit = await cache?.match(keyOf(bucket, key)).catch(() => undefined);
  const photo = hit ? await hit.text() : null;
  if (photo || !mem.has(k)) {
    mem.set(k, photo);
    if (photo) emit();
  }
  return photo;
}
