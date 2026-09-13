"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Txn } from "./store";
import type { Tab } from "./types";

type Sheet =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; txn: Txn }
  | { kind: "detail"; txn: Txn }
  | { kind: "settings" }
  | { kind: "transactions" }
  | { kind: "log" }
  /** create a tour, or edit one when `tripId` is set */
  | { kind: "trip"; tripId?: string }
  | { kind: "settle" }
  | { kind: "report" }
  /** pin a plan stop on the map */
  | { kind: "placeLoc"; placeId: string };

export type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
export type ConfirmReq = ConfirmOpts & { resolve: (v: boolean) => void };

const TABS: Tab[] = ["tours", "dashboard", "map", "itinerary", "group"];

type UI = {
  tab: Tab;
  setTab: (t: Tab) => void;
  sheet: Sheet;
  openAdd: () => void;
  openEdit: (txn: Txn) => void;
  openDetail: (txn: Txn) => void;
  openSettings: () => void;
  openTransactions: () => void;
  openLog: () => void;
  openTrip: (tripId?: string) => void;
  openSettle: () => void;
  openReport: () => void;
  openPlaceLoc: (placeId: string) => void;
  close: () => void;
  /** password prompt — sits above any sheet */
  unlockOpen: boolean;
  /** `then` runs once unlocked — e.g. "New tour" carries on to the form */
  openUnlock: (then?: () => void) => void;
  closeUnlock: (unlocked?: boolean) => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  confirmReq: ConfirmReq | null;
  settleConfirm: (v: boolean) => void;
  toast: (msg: string) => void;
  toastMsg: string;
};

const UICtx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hash.replace("#", "") as Tab;
      if (TABS.includes(h)) return h;
    }
    return "dashboard";
  });
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(0);
  const afterUnlock = useRef<(() => void) | null>(null);

  const close = useCallback(() => setSheet({ kind: "none" }), []);

  const setTab = useCallback((t: Tab) => {
    setTabState(t);
    try {
      const url = new URL(window.location.href);
      url.hash = t;
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* ignore */
    }
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setReq({ ...opts, resolve })),
    []
  );
  const settle = useCallback((v: boolean) => {
    setReq((r) => {
      if (r) r.resolve(v);
      return null;
    });
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(""), 2400);
  }, []);

  const value: UI = {
    tab,
    setTab,
    sheet,
    openAdd: () => setSheet({ kind: "add" }),
    openEdit: (txn) => setSheet({ kind: "edit", txn }),
    openDetail: (txn) => setSheet({ kind: "detail", txn }),
    openSettings: () => setSheet({ kind: "settings" }),
    openTransactions: () => setSheet({ kind: "transactions" }),
    openLog: () => setSheet({ kind: "log" }),
    openTrip: (tripId) => setSheet({ kind: "trip", tripId }),
    openSettle: () => setSheet({ kind: "settle" }),
    openReport: () => setSheet({ kind: "report" }),
    openPlaceLoc: (placeId) => setSheet({ kind: "placeLoc", placeId }),
    close,
    unlockOpen,
    openUnlock: (then) => {
      afterUnlock.current = then ?? null;
      setUnlockOpen(true);
    },
    closeUnlock: (unlocked = false) => {
      setUnlockOpen(false);
      const then = afterUnlock.current;
      afterUnlock.current = null;
      if (unlocked) then?.();
    },
    confirm,
    confirmReq: req,
    settleConfirm: settle,
    toast,
    toastMsg,
  };
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

export function useUI(): UI {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
