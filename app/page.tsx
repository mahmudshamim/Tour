"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Tab } from "@/components/types";
import { ThemeProvider, useTheme } from "@/components/theme";
import { StoreProvider, useStore } from "@/components/store";
import { PlacesProvider } from "@/components/places";
import { UIProvider, useUI } from "@/components/ui";
import TripMark from "@/components/TripMark";
import IntroScreen from "@/components/IntroScreen";
import BottomNav from "@/components/BottomNav";
import UnlockModal from "@/components/UnlockModal";
import Tours from "@/components/screens/Tours";
import MapScreen from "@/components/screens/MapScreen";
import Dashboard from "@/components/screens/Dashboard";
import Itinerary from "@/components/screens/Itinerary";
import Expenses from "@/components/screens/Expenses";
import SheetHost from "@/components/sheets/SheetHost";

function Shell() {
  const { theme } = useTheme();
  const { ready, readOnly, state, archived } = useStore();
  const { openAdd, tab, setTab, unlockOpen, toastMsg } = useUI();
  // decided after mount: the server can't see `?nointro` (the installed
  // PWA's start URL), and guessing differently there breaks hydration
  const [intro, setIntro] = useState<"pending" | "show" | "done">("pending");
  useEffect(() => {
    setIntro(window.location.search.includes("nointro") ? "done" : "show");
  }, []);

  // Opened with nothing on right now (only past tours)? Start on the Tours
  // hub — that's where the next tour gets planned. A link that names a tour
  // or a tab still wins. Read before the store rewrites the URL.
  const explicitLink = useRef<boolean | null>(null);
  if (explicitLink.current === null && typeof window !== "undefined") {
    explicitLink.current =
      Boolean(window.location.hash) ||
      new URLSearchParams(window.location.search).has("trip");
  }
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !ready || !state.tripId) return;
    landed.current = true;
    if (!explicitLink.current && archived) setTab("tours");
  }, [ready, state.tripId, archived, setTab]);

  // no tour to look inside yet → the Tours hub is the only screen
  const noTrip = !state.tripId;
  const view: Tab = noTrip ? "tours" : tab;

  return (
    <main className="stage">
      <div className="phone" data-theme={theme === "dark" ? "dark" : undefined}>
        <div className="notch" />

        {ready ? (
          <>
            {view === "tours" && <Tours />}
            {view === "dashboard" && <Dashboard />}
            {view === "map" && <MapScreen />}
            {view === "itinerary" && <Itinerary />}
            {view === "group" && <Expenses />}

            {/* view-only devices and archived trips have no way in to add */}
            {!readOnly && view !== "tours" && (
              <button
                className="fab fab-global"
                onClick={openAdd}
                aria-label="Add expense"
              >
                <Plus size={24} />
              </button>
            )}

            <BottomNav active={view} onChange={setTab} noTrip={noTrip} />
            <SheetHost />
          </>
        ) : (
          <div className="splash">
            <span className="splash-logo">
              <TripMark size={30} />
            </span>
          </div>
        )}

        {unlockOpen && <UnlockModal />}
        {toastMsg && (
          <div className="toast" role="status" key={toastMsg}>
            {toastMsg}
          </div>
        )}
        {intro === "show" && <IntroScreen onDone={() => setIntro("done")} />}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <PlacesProvider>
          <UIProvider>
            <Shell />
          </UIProvider>
        </PlacesProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}
