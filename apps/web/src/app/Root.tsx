import { lazy, Suspense, useEffect } from "react";
import { findZone } from "../features/earth/zones";
import { SimulatorHost } from "../features/simulator/SimulatorHost";
import { simulatorUrl } from "../features/simulator/contract";
import { App } from "./App";
import { useHashRoute } from "./route";

const EarthView = lazy(() => import("../features/earth/EarthView"));

/** The Houston editor, Earth index and individual zones can all be bookmarked. */
export function Root() {
  const [route, navigate] = useHashRoute();
  const zone = route.name === "zone" ? findZone(route.zoneId) : undefined;
  useEffect(() => {
    const title =
      zone?.name ?? (route.name === "earth" ? "Earth overview" : "Houston Disaster Atlas");
    document.title = `${title} · EarthLab`;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) theme.content = route.name === "atlas" ? "#1b1e1a" : "#1b211f";
  }, [route.name, zone]);
  if (route.name === "atlas")
    return (
      <App
        onEarth={() => navigate({ name: "earth" })}
        onSimulator={() => navigate({ name: "zone", zoneId: "downtown-buffalo-bayou" })}
      />
    );
  // A configured simulator is shown full-bleed over the globe (see simulator.css .sim-connected).
  const simulatorCoversGlobe =
    !!zone && simulatorUrl(import.meta.env.VITE_SIMULATOR_URL, zone) !== null;
  return (
    <Suspense
      fallback={
        <div
          role="status"
          style={{ height: "100svh", display: "grid", placeItems: "center", color: "#b0bbb0" }}
        >
          Loading Earth…
        </div>
      }
    >
      <EarthView
        activeZoneId={zone?.id ?? null}
        onZoneEntered={(zoneId) => navigate({ name: "zone", zoneId })}
        onOpenAtlas={() => navigate({ name: "atlas" })}
        paused={simulatorCoversGlobe}
      >
        {zone && (
          <SimulatorHost
            key={zone.id}
            zone={zone}
            onExit={() => navigate({ name: "earth" })}
            onOpenAtlas={() => navigate({ name: "atlas" })}
          />
        )}
      </EarthView>
    </Suspense>
  );
}
