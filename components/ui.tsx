"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Txn } from "./store";

type Sheet =
  | { kind: "none" }
  | { kind: "add" }
  | { kind: "edit"; txn: Txn }
  | { kind: "detail"; txn: Txn }
  | { kind: "settings" }
  | { kind: "transactions" }
  | { kind: "log" };

export type ConfirmOpts = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};
export type ConfirmReq = ConfirmOpts & { resolve: (v: boolean) => void };

type UI = {
  sheet: Sheet;
  openAdd: () => void;
  openEdit: (txn: Txn) => void;
  openDetail: (txn: Txn) => void;
  openSettings: () => void;
  openTransactions: () => void;
  openLog: () => void;
  close: () => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  confirmReq: ConfirmReq | null;
  settleConfirm: (v: boolean) => void;
};

const UICtx = createContext<UI | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const close = useCallback(() => setSheet({ kind: "none" }), []);

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

  const value: UI = {
    sheet,
    openAdd: () => setSheet({ kind: "add" }),
    openEdit: (txn) => setSheet({ kind: "edit", txn }),
    openDetail: (txn) => setSheet({ kind: "detail", txn }),
    openSettings: () => setSheet({ kind: "settings" }),
    openTransactions: () => setSheet({ kind: "transactions" }),
    openLog: () => setSheet({ kind: "log" }),
    close,
    confirm,
    confirmReq: req,
    settleConfirm: settle,
  };
  return <UICtx.Provider value={value}>{children}</UICtx.Provider>;
}

export function useUI(): UI {
  const ctx = useContext(UICtx);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
