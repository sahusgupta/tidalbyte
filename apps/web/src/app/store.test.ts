import { beforeEach, describe, expect, it } from "vitest";
import { BASELINE, HOUSTON_BOUNDS, SEED_SCENARIO, analyzeRoadNetwork, deriveAtlas } from "../atlas/domain";
import { snapshotOf, useAtlasStore } from "./store";

beforeEach(() => useAtlasStore.getState().reset());

describe("Houston local editor controller", () => {
  it("starts over Houston with a hypothetical closure that visibly changes connectivity", () => {
    const state = useAtlasStore.getState();
    expect(state.bookmark).toBe("houston");
    expect(state.playing).toBe(false);
    expect(snapshotOf(state)).toEqual(SEED_SCENARIO);
    expect(deriveAtlas(state).network.reachableNodeCount).toBeLessThan(analyzeRoadNetwork(BASELINE.closedRoadIds).reachableNodeCount);
  });
  it("undoes geometry edits without rewinding independent camera or inspection state", () => {
    const state = useAtlasStore.getState();
    state.setTrack([[-95.5, 29.8], [-95.2, 29.7]]);
    state.flyTo("bayou");
    state.selectRoad("park-approach");
    const beforeUndo = useAtlasStore.getState().version;
    state.undo();
    expect(useAtlasStore.getState().track).toEqual(SEED_SCENARIO.track);
    expect(useAtlasStore.getState().bookmark).toBe("bayou");
    expect(useAtlasStore.getState().selectedRoadId).toBe("park-approach");
    expect(useAtlasStore.getState().version).toBeGreaterThan(beforeUndo);
  });
  it("clamps supported coordinate and parameter edits and rejects nonfinite values", () => {
    const state = useAtlasStore.getState();
    state.setFlood([-160, 70], 100);
    expect(useAtlasStore.getState().floodCenter).toEqual([HOUSTON_BOUNDS[0], HOUSTON_BOUNDS[3]]);
    expect(useAtlasStore.getState().floodRadiusKm).toBe(15);
    state.setAssumption("intensity", 200);
    state.setAssumption("rainfallMm", -100);
    state.setAssumption("durationHours", 0);
    expect(useAtlasStore.getState().assumptions).toEqual({ intensity: 5, rainfallMm: 0, durationHours: 1 });
    const before = snapshotOf(useAtlasStore.getState());
    state.setFlood([Number.NaN, 29.76], 4);
    state.setTrack([[-95.4, 29.7], [Number.POSITIVE_INFINITY, 29.8]]);
    state.setAssumption("rainfallMm", Number.NaN);
    state.setProgress(Number.NaN);
    expect(snapshotOf(useAtlasStore.getState())).toEqual(before);
  });
  it("rejects unsupported road IDs and track sizes", () => {
    const state = useAtlasStore.getState();
    const before = snapshotOf(state);
    state.toggleClosure("unknown-road");
    state.selectRoad("unknown-road");
    state.setTrack([[-95.3, 29.7]]);
    state.setTrack(Array.from({ length: 9 }, () => [-95.3, 29.7]));
    expect(snapshotOf(useAtlasStore.getState())).toEqual(before);
    expect(useAtlasStore.getState().selectedRoadId).toBe("channel-bridge");
  });
  it("keeps scrubs out of undo history and versions every changed scenario", () => {
    const initial = useAtlasStore.getState();
    const version = initial.version;
    initial.setProgress(0.7);
    expect(useAtlasStore.getState().version).toBe(version + 1);
    expect(useAtlasStore.getState().history).toHaveLength(0);
    initial.toggleClosure("bayou-crossing");
    expect(useAtlasStore.getState().history).toHaveLength(1);
    initial.undo();
    expect(useAtlasStore.getState().closedRoadIds).toEqual(SEED_SCENARIO.closedRoadIds);
    expect(useAtlasStore.getState().progress).toBe(0.7);
  });
  it("restores the seed instantly and never mutates baseline fixture data", () => {
    const state = useAtlasStore.getState();
    state.moveTrackPoint(0, [-95.4, 29.8]);
    state.setMode("flood");
    state.setTool("flood");
    state.toggleClosure("channel-bridge");
    const version = useAtlasStore.getState().version;
    state.reset();
    expect(snapshotOf(useAtlasStore.getState())).toEqual(SEED_SCENARIO);
    expect(useAtlasStore.getState().version).toBe(version + 1);
    expect(useAtlasStore.getState().history).toHaveLength(0);
    expect(BASELINE.track[0]).toEqual([-95.085, 29.665]);
    expect(BASELINE.closedRoadIds).toEqual([]);
  });
  it("keeps display-only assumptions separate from intersection geometry", () => {
    const state = useAtlasStore.getState();
    const intersections = deriveAtlas(state).intersectedRoadIds;
    state.setAssumption("intensity", 5);
    state.setAssumption("rainfallMm", 300);
    expect(deriveAtlas(useAtlasStore.getState()).intersectedRoadIds).toEqual(intersections);
  });
});
