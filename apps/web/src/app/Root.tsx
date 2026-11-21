import { lazy, Suspense } from "react";
import { findZone } from "../features/earth/zones";
import { SimulatorHost } from "../features/simulator/SimulatorHost";
import { App } from "./App";
import { useHashRoute } from "./route";

const EarthView = lazy(() => import("../features/earth/EarthView"));

/** Earth view -> zone (simulator) -> Houston scenario atlas, addressed by URL hash. */
export function Root() {
  const [route, navigate] = useHashRoute();
  if (route.name === "atlas") return <App onEarth={() => navigate({ name: "earth" })} />;
  const zone = route.name === "zone" ? findZone(route.zoneId) : undefined;
  return (
    <Suspense
      fallback={
        <div role="status" style={{ height: "100svh", display: "grid", placeItems: "center", color: "#b0bbb0" }}>
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
