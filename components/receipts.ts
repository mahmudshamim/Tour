/* ============================================================
   Receipt photos on this device (bytes live in photoStore).

   Keyed by expense id + version (`receiptAt`), so a replaced receipt
   is simply a new key. The open tour's receipts are fetched in the
   background while there's signal, so they can be looked at on a hill
   with none; any other receipt downloads the first time it's opened.
   ============================================================ */

import { useEffect, useState, useSyncExternalStore } from "react";
import { loadReceipt } from "./db";
import { getPhoto, peek, putPhoto, subscribe, snapshot } from "./photoStore";
import type { Txn } from "./models";

export const receiptKey = (txnId: string, at: number) => `${txnId}@${at}`;

export const receiptForUpload = (txnId: string, at: number) =>
  getPhoto("receipts", receiptKey(txnId, at));

export const saveLocalReceipt = (txnId: string, at: number, photo: string) =>
  putPhoto("receipts", receiptKey(txnId, at), photo);

async function ensure(txn: Pick<Txn, "id" | "receiptAt">): Promise<string | null> {
  if (!txn.receiptAt) return null;
  const key = receiptKey(txn.id, txn.receiptAt);
  const have = await getPhoto("receipts", key);
  if (have) return have;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;
  const photo = await loadReceipt(txn.id);
  if (photo) await putPhoto("receipts", key, photo);
  return photo;
}

/** Download the open tour's receipts this device doesn't have yet. */
export async function prefetchReceipts(txns: Txn[]) {
  for (const t of txns) {
    if (!t.receiptAt) continue;
    if (navigator.onLine === false) return;
    await ensure(t).catch(() => null);
  }
}

/** The expense's receipt photo: string, null (none / not reachable), or
 *  "loading" while it's being fetched. */
export function useReceipt(txn: Pick<Txn, "id" | "receiptAt"> | undefined) {
  useSyncExternalStore(subscribe, snapshot, () => 0);
  const [busy, setBusy] = useState(false);
  const key = txn && txn.receiptAt ? receiptKey(txn.id, txn.receiptAt) : "";
  useEffect(() => {
    if (!txn || !key) return;
    let alive = true;
    setBusy(true);
    ensure(txn).finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return null;
  const photo = peek("receipts", key);
  if (photo) return photo;
  return busy ? "loading" : null;
}
