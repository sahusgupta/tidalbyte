import { describe, expect, it } from "vitest";
import {
  BASELINE, HOUSTON_ROADS, SEED_SCENARIO, SEED_TRACK,
  analyzeRoadNetwork, deriveAtlas, getFloodPolygon, getFloodRadiusAtProgress,
  getOverlayIntersections, getStormPosition, polylineIntersectsCircle,
} from "./domain";

describe("explicit hypothetical geometry", () => {
  it("interpolates a track by path distance and handles duplicate waypoints", () => {
    expect(getStormPosition(SEED_TRACK, 0)).toEqual(SEED_TRACK[0]);
    expect(getStormPosition(SEED_TRACK, 1)).toEqual(SEED_TRACK.at(-1));
    const simple: [number, number][] = [[-95.5, 29.75], [-95.5, 29.75], [-95.3, 29.75]];
    expect(getStormPosition(simple, 0.5)[0]).toBeCloseTo(-95.4, 5);
  });
  it("counts crossing road segments even when both ends lie outside the footprint", () => {
    expect(polylineIntersectsCircle([[-95.5, 29.75], [-95.3, 29.75]], [-95.4, 29.75], 1)).toBe(true);
    expect(polylineIntersectsCircle([[-95.5, 29.8], [-95.3, 29.8]], [-95.4, 29.75], 1)).toBe(false);
  });
  it("uses the visible current-time flood radius for road intersections", () => {
    const snapshot = { ...structuredClone(BASELINE), mode: "flood" as const, progress: 0.4 };
    const derived = deriveAtlas(snapshot);
    expect(derived.currentFloodRadiusKm).toBe(getFloodRadiusAtProgress(snapshot.floodRadiusKm, snapshot.progress));
    const expected = HOUSTON_ROADS.filter((road) => polylineIntersectsCircle(road.points, snapshot.floodCenter, derived.currentFloodRadiusKm)).map((road) => road.id);
    expect(derived.intersectedRoadIds).toEqual(expected);
    expect(derived.footprint).toEqual(getFloodPolygon(snapshot.floodCenter, derived.currentFloodRadiusKm));
    expect(derived.footprint[0]).toEqual(derived.footprint.at(-1));
  });
  it("does not infer road closures from a visual overlay", () => {
    const snapshot = { ...structuredClone(BASELINE), mode: "flood" as const, floodRadiusKm: 15 };
    expect(getOverlayIntersections(snapshot).length).toBeGreaterThan(0);
    expect(deriveAtlas(snapshot).network.closedRoadIds).toEqual([]);
    expect(deriveAtlas(snapshot).network.connectedComponents).toBe(1);
  });
});

describe("curated road topology under manual closure assumptions", () => {
  it("distinguishes a closed crossing from open but disconnected links", () => {
    const before = analyzeRoadNetwork([]);
    const after = analyzeRoadNetwork(SEED_SCENARIO.closedRoadIds);
    expect(before.connectedComponents).toBe(1);
    expect(before.reachableNodeCount).toBe(before.totalNodeCount);
    expect(after.connectedComponents).toBe(2);
    expect(after.reachableNodeCount).toBe(before.reachableNodeCount - 3);
    expect(after.disconnectedRoadIds).toEqual(["channel-east", "coastal-connector"]);
    expect(after.disconnectedRoadIds).not.toContain("channel-bridge");
  });
  it("preserves reachability when one edge of the downtown loop closes", () => {
    const after = analyzeRoadNetwork(["downtown-north"]);
    expect(after.connectedComponents).toBe(1);
    expect(after.reachableNodeCount).toBe(after.totalNodeCount);
    expect(after.disconnectedRoadIds).toEqual([]);
  });
  it("ignores unknown and duplicate closure IDs without inventing effects", () => {
    expect(analyzeRoadNetwork(["unknown", "channel-bridge", "channel-bridge"]))
      .toEqual(analyzeRoadNetwork(["channel-bridge"]));
  });
});
