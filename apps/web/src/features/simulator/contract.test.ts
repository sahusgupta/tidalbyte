import { describe, expect, it } from "vitest";
import { findZone, regionBBox, HOUSTON, ZONES, zoneSizeKm } from "../earth/zones";
import { parseRoute, routeHash } from "../../app/route";
import { parseSimulatorMessage, simulatorUrl, zoneMessage } from "./contract";

const zone = findZone("downtown-buffalo-bayou")!;

describe("zones", () => {
  it("have unique ids and valid, neighbourhood-scale boxes", () => {
    expect(new Set(ZONES.map((z) => z.id)).size).toBe(ZONES.length);
    for (const z of ZONES) {
      const [w, s, e, n] = z.bbox;
      expect(w).toBeLessThan(e);
      expect(s).toBeLessThan(n);
      const [x, y] = zoneSizeKm(z);
      expect(x).toBeGreaterThan(2);
      expect(y).toBeGreaterThan(2);
      expect(Math.max(x, y)).toBeLessThan(30);
    }
  });

  it("all sit inside the region box", () => {
    const [w, s, e, n] = regionBBox(HOUSTON);
    for (const z of HOUSTON.zones) {
      expect(z.bbox[0]).toBeGreaterThanOrEqual(w);
      expect(z.bbox[3]).toBeLessThanOrEqual(n);
    }
    expect([w, s, e, n].every(Number.isFinite)).toBe(true);
  });
});

describe("simulator contract", () => {
  it("adds the zone to the simulator URL and keeps existing parameters", () => {
    const url = simulatorUrl("https://sim.example.org/app?mode=dark", zone)!;
    expect(url.origin).toBe("https://sim.example.org");
    expect(url.searchParams.get("mode")).toBe("dark");
    expect(url.searchParams.get("zone")).toBe(zone.id);
    expect(url.searchParams.get("bbox")).toBe("-95.43,29.735,-95.335,29.79");
    expect(url.searchParams.get("center")?.split(",").map(Number)).toEqual([-95.3825, 29.7625]);
    expect(url.searchParams.get("v")).toBe("1");
  });

  it("returns null when no simulator is configured or the URL is unsafe", () => {
    expect(simulatorUrl(undefined, zone)).toBeNull();
    expect(simulatorUrl("   ", zone)).toBeNull();
    expect(simulatorUrl("not a url", zone)).toBeNull();
    expect(simulatorUrl("javascript:alert(1)", zone)).toBeNull();
  });

  it("posts a versioned zone message", () => {
    expect(zoneMessage(zone)).toEqual({
      source: "earthlab",
      type: "zone",
      version: 1,
      zone: { id: zone.id, name: zone.name, bbox: zone.bbox, center: [-95.3825, 29.7625] },
    });
  });

  it("accepts only well-formed simulator messages", () => {
    expect(parseSimulatorMessage({ source: "simulator", type: "exit" })).toEqual({ source: "simulator", type: "exit" });
    expect(parseSimulatorMessage({ source: "simulator", type: "status", message: "x".repeat(500) })?.type).toBe("status");
    expect(parseSimulatorMessage({ source: "simulator", type: "status" })).toBeNull();
    expect(parseSimulatorMessage({ source: "other", type: "exit" })).toBeNull();
    expect(parseSimulatorMessage("exit")).toBeNull();
    expect(parseSimulatorMessage(null)).toBeNull();
  });
});

describe("routes", () => {
  it("round-trips landing, earth and zone routes", () => {
    for (const route of [{ name: "choose" }, { name: "landing" }, { name: "zone", zoneId: zone.id }] as const)
      expect(parseRoute(routeHash(route))).toEqual(route);
  });

  it("opens home and unknown routes on landing; redirects legacy atlas to the simulator", () => {
    for (const hash of ["", "#/", "#/earth", "#/zone/atlantis", "#/whatever"]) expect(parseRoute(hash)).toEqual({ name: "landing" });
    for (const hash of ["#/atlas", "#/simulate"])
      expect(parseRoute(hash)).toEqual({ name: "choose" });
  });
});
