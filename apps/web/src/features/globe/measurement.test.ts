import { describe, expect, it } from "vitest";
import { addMeasurementPoint, parseMeasurementPoint } from "./measurement";
import { distanceKm } from "./mapGeometry";

describe("local map measurements", () => {
  it("takes two points and starts a new measurement on the third", () => {
    const first = addMeasurementPoint([], [-95.4, 29.75]);
    const second = addMeasurementPoint(first, [-95.3, 29.75]);
    expect(second).toEqual([
      [-95.4, 29.75],
      [-95.3, 29.75],
    ]);
    expect(distanceKm(second[0], second[1])).toBeCloseTo(9.654, 2);
    expect(addMeasurementPoint(second, [-95.2, 29.8])).toEqual([[-95.2, 29.8]]);
    expect(first).toEqual([[-95.4, 29.75]]);
  });

  it("rejects empty, nonfinite and out-of-study-area coordinates", () => {
    expect(parseMeasurementPoint("", "29.75")).toBeNull();
    expect(parseMeasurementPoint("-95.4", "Infinity")).toBeNull();
    expect(parseMeasurementPoint("-96", "29.75")).toBeNull();
    expect(parseMeasurementPoint("-95.4", "30.2")).toBeNull();
    expect(parseMeasurementPoint("-95.4", "29.75")).toEqual([-95.4, 29.75]);
    expect(addMeasurementPoint([], [NaN, 29.75])).toEqual([]);
  });
});
