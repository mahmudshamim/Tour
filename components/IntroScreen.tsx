"use client";

import { useEffect } from "react";
import { Plane } from "lucide-react";
import TripMark from "./TripMark";

export default function IntroScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="intro" onClick={onDone}>
      {/* drifting stars */}
      <div className="intro-sky">
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="intro-star"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 70}%`,
              animationDelay: `${(i % 6) * 0.25}s`,
            }}
          />
        ))}
      </div>

      {/* flight route */}
      <svg className="intro-route" viewBox="0 0 393 520" preserveAspectRatio="none">
        <path
          className="intro-path"
          d="M-30 360 C 120 250, 250 360, 430 180"
          fill="none"
        />
      </svg>
      <div className="intro-plane">
        <Plane size={26} />
      </div>

      {/* mountains rising */}
      <svg className="intro-mtns" viewBox="0 0 393 200" preserveAspectRatio="none">
        <path
          className="mtn back"
          d="M0 200 L70 90 L140 200 Z M120 200 L210 60 L300 200 Z M260 200 L340 100 L393 200 Z"
        />
        <path
          className="mtn front"
          d="M-20 200 L60 120 L150 200 Z M120 200 L200 95 L290 200 Z M250 200 L330 130 L410 200 Z"
        />
      </svg>

      {/* brand */}
      <div className="intro-brand">
        <span className="intro-logo">
          <TripMark size={44} />
        </span>
        <div className="intro-title">TerraExplore</div>
        <div className="intro-tag">
          <span>Plan</span>
          <i />
          <span>Explore</span>
          <i />
          <span>Split</span>
        </div>
      </div>
    </div>
  );
}
