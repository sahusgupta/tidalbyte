import { describe, expect, it } from "vitest";
import { HOUSTON_ROADS, SEED_SCENARIO, getFloodPolygon, type AtlasSnapshot } from "./domain";
import { studyGeoJSON } from "./exportStudy";

describe("exported Houston study", () => {
  it("records the edited track and assumed closures in geographic coordinates", () => {
    const study: AtlasSnapshot = {
      ...SEED_SCENARIO,
      track: [
        [-95.5, 29.8],
        [-95.2, 29.7],
      ],
      closedRoadIds: ["midtown-link"],
    };
    const output = studyGeoJSON(study);
    expect(output.features[0].geometry).toEqual({ type: "LineString", coordinates: study.track });
    expect(output.features).toHaveLength(1 + HOUSTON_ROADS.length);
    expect(output.features.filter((f) => f.properties?.assumedClosed).map((f) => f.id)).toEqual([
      "midtown-link",
    ]);
    expect(output.features.find((f) => f.id === "midtown-link")?.properties?.actualCondition).toBe(
      "unknown",
    );
  });

  it("exports the flood footprint at the displayed simulation time", () => {
    const study: AtlasSnapshot = {
      ...SEED_SCENARIO,
      mode: "flood",
      floodRadiusKm: 12,
      progress: 0.25,
    };
    const output = studyGeoJSON(study);
    expect(output.scenarioHours).toBe(3);
    expect(output.features[0].geometry).toEqual({
      type: "Polygon",
      coordinates: [getFloodPolygon(study.floodCenter, 12, 0.25)],
    });
    expect(output.mode).toBe("illustrative");
  });
});
