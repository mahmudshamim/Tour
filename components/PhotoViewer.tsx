"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/** Full-screen look at a photo (a receipt, usually). Pinch-zoom is the
 *  browser's own; tap outside or ✕ to close. */
export default function PhotoViewer({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="photo-viewer"
      onClick={(e) => {
        e.stopPropagation(); // don't also close the sheet underneath
        onClose();
      }}
      role="dialog"
      aria-label="Receipt photo"
    >
      <img src={src} alt="Receipt" onClick={(e) => e.stopPropagation()} />
      <button
        className="pv-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
      >
        <X size={20} />
      </button>
    </div>
  );
}
