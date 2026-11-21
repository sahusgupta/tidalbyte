import { useCallback, useEffect, useState } from "react";
import { findZone } from "../features/earth/zones";

/**
 * Hash routes:  /, #/           EarthLab landing
 *               #/simulate    Houston flood simulator (legacy #/atlas redirects here)
 *               #/earth       Legacy link to the scrolling landing page
 *               #/zone/<id>   Earth view zoomed into a zone, with the simulator open
 */
export type Route = { name: "choose" } | { name: "landing" } | { name: "zone"; zoneId: string };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "");
  if (path === "" || path === "/") return { name: "landing" };
  if (path === "/earth") return { name: "landing" };
  if (path === "/simulate" || path === "/atlas") return { name: "choose" };
  const match = /^\/zone\/([a-z0-9-]+)$/.exec(path);
  if (match && findZone(match[1])) return { name: "zone", zoneId: match[1] };
  return { name: "landing" };
}

export function routeHash(route: Route): string {
  if (route.name === "choose") return "#/simulate";
  if (route.name === "landing") return "#/";
  if (route.name === "zone") return `#/zone/${route.zoneId}`;
  return "#/";
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
