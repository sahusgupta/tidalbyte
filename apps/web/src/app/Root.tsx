import { lazy, Suspense, useEffect } from "react";
import { findZone } from "../features/earth/zones";
import { SimulatorHost } from "../features/simulator/SimulatorHost";
import { useHashRoute } from "./route";

const Landing = lazy(() => import("../features/landing/Landing"));

export function Root() {
  const [route, navigate] = useHashRoute();
  const zone = route.name === "zone" ? findZone(route.zoneId) : undefined;
  useEffect(() => {
    document.title = `${zone?.name ?? "Houston flood simulation"} · EarthLab`;
  }, [route.name, zone]);
  if (zone) return <SimulatorHost key={zone.id} zone={zone}
    onExit={() => navigate({ name: "landing" })} onHome={() => navigate({ name: "landing" })}
    onZoneChange={zoneId => navigate({ name: "zone", zoneId })} />;
  return <Suspense fallback={<div role="status" style={{padding:40}}>Loading EarthLab…</div>}>
    <Landing chooseArea={route.name === "choose"} onCloseChooser={() => navigate({ name: "landing" })} />
  </Suspense>;
}
