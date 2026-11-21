/**
 * Hand-off contract between EarthLab and an external street & flood simulator.
 *
 * EarthLab opens the simulator at VITE_SIMULATOR_URL inside the app, adding the zone as query
 * parameters, and also posts the same zone as a message once the simulator page has loaded.
 * The simulator can post back `ready`, `status` or `exit`. See README.md in this folder.
 */
import { zoneCenter, type BBox, type LonLat, type Zone } from "../earth/zones";

export const CONTRACT_VERSION = 1;

export interface SimulatorZone {
  id: string;
  name: string;
  bbox: BBox;
  center: LonLat;
}

export interface ZoneMessage {
  source: "earthlab";
  type: "zone";
  version: typeof CONTRACT_VERSION;
  zone: SimulatorZone;
}

export type SimulatorMessage =
  | { source: "simulator"; type: "ready" }
  | { source: "simulator"; type: "exit" }
  | { source: "simulator"; type: "status"; message: string };

export function toSimulatorZone(zone: Zone): SimulatorZone {
  return { id: zone.id, name: zone.name, bbox: zone.bbox, center: zoneCenter(zone) };
}

const fixed = (value: number) => Number(value.toFixed(5)).toString();

/** The simulator URL for a zone, or null when no simulator is configured or the URL is invalid. */
export function simulatorUrl(base: string | undefined, zone: Zone): URL | null {
  const trimmed = base?.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const z = toSimulatorZone(zone);
  url.searchParams.set("zone", z.id);
  url.searchParams.set("name", z.name);
  url.searchParams.set("bbox", z.bbox.map(fixed).join(","));
  url.searchParams.set("center", z.center.map(fixed).join(","));
  url.searchParams.set("v", String(CONTRACT_VERSION));
  return url;
}

export function zoneMessage(zone: Zone): ZoneMessage {
  return { source: "earthlab", type: "zone", version: CONTRACT_VERSION, zone: toSimulatorZone(zone) };
}

/** Accept only well-formed messages from the simulator; everything else is ignored. */
export function parseSimulatorMessage(data: unknown): SimulatorMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "simulator") return null;
  if (d.type === "ready" || d.type === "exit") return { source: "simulator", type: d.type };
  if (d.type === "status" && typeof d.message === "string")
    return { source: "simulator", type: "status", message: d.message.slice(0, 200) };
  return null;
}
