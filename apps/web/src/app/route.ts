import { useCallback, useEffect, useState } from "react";
import { findZone } from "../features/earth/zones";

/**
 * Hash routes:  /, #/, #/atlas   Houston scenario atlas
 *               #/earth       Earth view
 *               #/zone/<id>   Earth view zoomed into a zone, with the simulator open
 */
export type Route = { name: "earth" } | { name: "atlas" } | { name: "zone"; zoneId: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (path === "/earth") return { name: "earth" };
  const match = /^\/zone\/([a-z0-9-]+)$/.exec(path);
  if (match && findZone(match[1])) return { name: "zone", zoneId: match[1] };
  return { name: "atlas" };
}

export function routeHash(route: Route): string {
  if (route.name === "atlas") return "#/atlas";
  if (route.name === "zone") return `#/zone/${route.zoneId}`;
  return "#/earth";
}

export function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: Route) => {
    const hash = routeHash(next);
    if (window.location.hash !== hash) window.location.hash = hash;
    else setRoute(next);
  }, []);
  return [route, navigate];
}
