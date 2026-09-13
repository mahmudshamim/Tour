"use client";

import { useEffect, useState } from "react";
import { Lock, X, Eye, EyeOff } from "lucide-react";
import { useStore } from "./store";
import { useUI } from "./ui";
import { lockMessage } from "./editLock";

/** Password → edit session for this device. Checked by the database,
 *  so there is no password anywhere in the app's own code. */
export default function UnlockModal() {
  const { unlock } = useStore();
  const { closeUnlock, toast } = useUI();
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeUnlock();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeUnlock]);

  const submit = async () => {
    if (!val || busy) return;
    setBusy(true);
    const res = await unlock(val);
    setBusy(false);
    if (res.ok) {
      toast("Editing unlocked on this device");
      closeUnlock(true);
      return;
    }
    setErr(lockMessage(res.error));
    if (res.error === "wrong") setVal("");
  };

  return (
    <div className="pin-overlay" onClick={() => closeUnlock()}>
      <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pin-close" onClick={() => closeUnlock()} aria-label="Close">
          <X size={18} />
        </button>
        <span className="pin-lock">
          <Lock size={22} />
        </span>
        <div className="pin-title">Unlock editing</div>
        <div className="pin-sub">
          Anyone with the link can view. Adding or changing anything needs the
          tour password.
        </div>

        <div className={`pw-field ${err ? "shake" : ""}`} key={err}>
          <input
            type={show ? "text" : "password"}
            value={val}
            autoFocus
            autoComplete="current-password"
            placeholder="Password"
            onChange={(e) => {
              setErr("");
              setVal(e.target.value);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            className="pw-eye"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <div className="pin-err">{err}</div>

        <button
          className="btn-primary"
          onClick={submit}
          disabled={!val || busy}
          style={{ opacity: val && !busy ? 1 : 0.55 }}
        >
          {busy ? "Checking…" : "Unlock"}
        </button>
        <div className="pin-foot">
          Unlock once before you travel — this device then stays unlocked,
          even with no network.
        </div>
      </div>
    </div>
  );
}
