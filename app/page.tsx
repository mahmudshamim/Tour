"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Tab } from "@/components/types";
import { ThemeProvider, useTheme } from "@/components/theme";
import { StoreProvider, useStore } from "@/components/store";
import { PlacesProvider } from "@/components/places";
import { UIProvider, useUI } from "@/components/ui";
import TripMark from "@/components/TripMark";
import IntroScreen from "@/components/IntroScreen";
import BottomNav from "@/components/BottomNav";
import MapScreen from "@/components/screens/MapScreen";
import Dashboard from "@/components/screens/Dashboard";
import Itinerary from "@/components/screens/Itinerary";
import Expenses from "@/components/screens/Expenses";
import SheetHost from "@/components/sheets/SheetHost";

function Shell() {
  const { theme } = useTheme();
  const { ready } = useStore();
  const { openAdd } = useUI();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hash.replace("#", "");
      if (["dashboard", "map", "itinerary", "group"].includes(h))
        return h as Tab;
    }
    return "dashboard";
  });
  const [introDone, setIntroDone] = useState(
    () =>
      typeof window !== "undefined" &&
      window.location.search.includes("nointro")
  );

  return (
    <main className="stage">
      <div className="phone" data-theme={theme === "dark" ? "dark" : undefined}>
        <div className="notch" />

        {ready ? (
          <>
            {tab === "dashboard" && <Dashboard />}
            {tab === "map" && <MapScreen />}
            {tab === "itinerary" && <Itinerary />}
            {tab === "group" && <Expenses />}

            <button
              className="fab fab-global"
              onClick={openAdd}
              aria-label="Add expense"
            >
              <Plus size={24} />
            </button>

            <BottomNav active={tab} onChange={setTab} />
            <SheetHost />
          </>
        ) : (
          <div className="splash">
            <span className="splash-logo">
              <TripMark size={30} />
            </span>
          </div>
        )}

        {!introDone && <IntroScreen onDone={() => setIntroDone(true)} />}
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
