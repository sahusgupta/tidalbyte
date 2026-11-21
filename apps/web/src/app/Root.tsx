import { useEffect } from "react";
import { findZone } from "../features/earth/zones";
import { SimulatorHost } from "../features/simulator/SimulatorHost";
import Landing from "../features/landing/Landing";
import { useHashRoute } from "./route";

export function Root() {
  const [route, navigate] = useHashRoute();
  const zone = route.name === "zone" ? findZone(route.zoneId) : undefined;
  useEffect(() => {
    document.title = `${zone?.name ?? "Houston flood simulation"} · EarthLab`;
  }, [route.name, zone]);
  if (zone) return <SimulatorHost key={zone.id} zone={zone}
    onExit={() => navigate({ name: "landing" })} onHome={() => navigate({ name: "landing" })}
    onZoneChange={zoneId => navigate({ name: "zone", zoneId })} />;
  return <Landing chooseArea={route.name === "choose"} onCloseChooser={() => navigate({ name: "landing" })} />;
}
