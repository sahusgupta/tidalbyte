import { lazy, Suspense, useEffect } from "react";
import { findZone } from "../features/earth/zones";
import { SimulatorHost } from "../features/simulator/SimulatorHost";
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
  }, [route.name, zone]);
  if (route.name === "atlas") return <App onEarth={() => navigate({ name: "earth" })} />;
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
      >
        {zone && (
          <SimulatorHost
            zone={zone}
            onExit={() => navigate({ name: "earth" })}
            onOpenAtlas={() => navigate({ name: "atlas" })}
          />
        )}
      </EarthView>
    </Suspense>
  );
}
