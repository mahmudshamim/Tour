"use client";

import { useState } from "react";
import { Mountain, X, MapPin, Calendar, Users, ChevronDown } from "lucide-react";
import { useStore } from "../store";

export default function Onboarding({ onClose }: { onClose: () => void }) {
  const { updateSettings } = useStore();
  const [dest, setDest] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const startPlanning = () => {
    if (dest.trim()) updateSettings({ tripName: dest.trim() });
    onClose();
  };

  return (
    <div className="onboard-overlay">
      <div className="onboard">
        <div className="onboard-head">
          <div className="brand">
            <span className="logo">
              <Mountain size={15} strokeWidth={2.4} />
            </span>
            TerraExplore
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="onboard-body">
          <h1>Plan your expedition</h1>
          <p className="sub">Design your perfect high-end nature retreat</p>

          <div className="field">
            <label>Where to?</label>
            <div className="input">
              <MapPin size={19} />
              <input
                placeholder="e.g. Kyoto, Dolomites, Patagonia"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <div className="field-row">
              <div>
                <label>Departure</label>
                <div className="input compact">
                  <Calendar size={17} />
                  <input
                    type={start ? "date" : "text"}
                    placeholder="Start date"
                    value={start}
                    onFocus={(e) => {
                      e.target.type = "date";
                      e.target.showPicker?.();
                    }}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = "text";
                    }}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label>Return</label>
                <div className="input compact">
                  <Calendar size={17} />
                  <input
                    type={end ? "date" : "text"}
                    placeholder="End date"
                    value={end}
                    min={start || undefined}
                    onFocus={(e) => {
                      e.target.type = "date";
                      e.target.showPicker?.();
                    }}
                    onBlur={(e) => {
                      if (!e.target.value) e.target.type = "text";
                    }}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="invite-row">
            <div className="left">
              <Users size={18} />
              Invite tripmates
            </div>
            <button className="chip">
              <Users size={14} />
              Friends
              <ChevronDown size={14} />
            </button>
          </div>

          <button className="btn-primary" onClick={startPlanning}>
            Start Planning
          </button>
          <button className="text-link" onClick={onClose}>
            Or write a new guide
          </button>
        </div>
      </div>
    </div>
  );
}
