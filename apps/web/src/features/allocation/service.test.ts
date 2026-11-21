import { describe, it, expect } from "vitest";
import { example, runPlan } from "./service";
import { planningAssets } from "./map";

describe("Houston planning map", () => {
  for (const phase of ["mitigation", "response"] as const) {
    it(
      "bundles the computed " + phase + " portfolio and matching graph",
      () => {
        const run = example(phase);
        expect(run.offline).toBe(true);
        expect(run.request.phase).toBe(phase);
        const strategy = run.result.strategies.find(
          (s) => s.id === "bargaining",
        )!;
        const before = planningAssets(run, strategy, 0);
        expect(before.filter((a) => a.selected)).toHaveLength(0);
        const after = planningAssets(run, strategy, strategy.completionHours);
        expect(
          after
            .filter((a) => a.selected)
            .map((a) => a.id)
            .sort(),
        ).toEqual(strategy.interventions.map((i) => i.assetId).sort());
        const clinic = after.find((a) => a.id === "clinic");
        expect(clinic?.caption).toBe(
          Math.round(strategy.access.clinic * 100) + "% modeled access",
        );
      },
    );
  }
  it("rejects a malformed service response", async () => {
    const demo = example("mitigation");
    const fetcher = async () =>
      Response.json({
        data: { ...demo.result, strategies: [] },
        meta: {
          requestId: "fixture",
          mode: "exploratory_what_if",
          warnings: [],
          sourceIds: demo.result.sourceIds,
        },
        error: null,
      });
    await expect(runPlan(demo.request, { fetcher })).rejects.toThrow(
      /contract/,
    );
  });
});
