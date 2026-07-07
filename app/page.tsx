"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import TripMark from "@/components/TripMark";
import type { Tab } from "@/components/types";
import { ThemeProvider, useTheme } from "@/components/theme";
import { StoreProvider, useStore } from "@/components/store";
import { UIProvider, useUI } from "@/components/ui";
import BottomNav from "@/components/BottomNav";
import Onboarding from "@/components/screens/Onboarding";
import MapScreen from "@/components/screens/MapScreen";
import Dashboard from "@/components/screens/Dashboard";
import Itinerary from "@/components/screens/Itinerary";
import Expenses from "@/components/screens/Expenses";
import SheetHost from "@/components/sheets/SheetHost";

function Shell() {
  const { theme } = useTheme();
  const { ready, state } = useStore();
  const { openAdd } = useUI();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hash.replace("#", "");
      if (["dashboard", "map", "itinerary", "group"].includes(h))
        return h as Tab;
    }
    return "dashboard";
  });
  const [onboardDismissed, setOnboardDismissed] = useState(false);

  const showOnboard =
    ready && state.members.length === 0 && state.txns.length === 0 && !onboardDismissed;

  return (
    <main className="stage">
      <div className="phone" data-theme={theme === "dark" ? "dark" : undefined}>
        <div className="notch" />

        {!ready ? (
          <div className="splash">
            <span className="splash-logo">
              <TripMark size={34} />
            </span>
          </div>
        ) : (
          <>
            {tab === "dashboard" && <Dashboard />}
            {tab === "map" && <MapScreen />}
            {tab === "itinerary" && <Itinerary />}
            {tab === "group" && <Expenses />}

            {/* Global add-expense FAB — visible on every tab */}
            <button
              className="fab fab-global"
              onClick={openAdd}
              aria-label="Add expense"
            >
              <Plus size={24} />
            </button>

            <BottomNav active={tab} onChange={setTab} />

            {showOnboard && (
              <Onboarding onClose={() => setOnboardDismissed(true)} />
            )}
            <SheetHost />
          </>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <UIProvider>
          <Shell />
        </UIProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}
