"use client";

import { useState } from "react";
import { Lock, X, Eye, EyeOff } from "lucide-react";
import { DATA_PASSWORD } from "./secret";

export default function PasswordModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");

  const submit = () => {
    if (val === DATA_PASSWORD) onSuccess();
    else {
      setErr("Wrong password");
      setVal("");
    }
  };

  return (
    <div className="pin-overlay" onClick={onClose}>
      <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pin-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <span className="pin-lock">
          <Lock size={22} />
        </span>
        <div className="pin-title">Enter password</div>
        <div className="pin-sub">Required to view data options</div>

        <div className={`pw-field ${err ? "shake" : ""}`}>
          <input
            type={show ? "text" : "password"}
            value={val}
            autoFocus
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
            aria-label="Toggle visibility"
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <div className="pin-err">{err}</div>

        <button className="btn-primary" onClick={submit}>
          Unlock
        </button>
      </div>
    </div>
  );
}
