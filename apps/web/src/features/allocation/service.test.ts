import { describe, it, expect } from "vitest";
import type { AllocationRequest, AllocationResult } from "@earthlab/contracts";
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

function liveRun(
  request: AllocationRequest,
  result: AllocationResult,
  mode = "exploratory_what_if",
) {
  const graph = example(request.phase).geometry;
  const fetcher: typeof fetch = async (input) => {
    const catalog = String(input).includes("/network?");
    return Response.json({
      data: catalog ? graph : result,
      meta: {
        requestId: "allocation-test",
        mode: catalog ? "offline_example" : mode,
        sourceIds: catalog ? [result.graphSource] : result.sourceIds,
        warnings: [],
      },
      error: null,
    });
  };
  return runPlan(request, { fetcher });
}

describe("allocation response integrity", () => {
  for (const phase of ["mitigation", "response"] as const) {
    it(
      "accepts computed " + phase + " ledgers, frames and catalog paths",
      async () => {
        const demo = example(phase);
        expect((await liveRun(demo.request, demo.result)).offline).toBe(false);
      },
    );
  }
  it("allows positive mitigation mean access with an empty declared-realization path", async () => {
    const demo = example("mitigation");
    expect(demo.result.strategies[2].frames[0].access.clinic).toBeGreaterThan(
      0,
    );
    expect(demo.result.strategies[2].frames[0].serviceEdges.clinic).toEqual([]);
    await expect(liveRun(demo.request, demo.result)).resolves.toHaveProperty(
      "offline",
      false,
    );
  });

  const malformed: Record<
    string,
    (request: AllocationRequest, result: AllocationResult) => void
  > = {
    "shared budget": (request) => {
      request.totalBudget = 0;
    },
    "agency budget": (request) => {
      request.agencies.health.budget = 0;
    },
    "shared crews": (request) => {
      request.crewCapacity = 0;
    },
    "agency crews": (request) => {
      request.agencies.shelter.crewCapacity = 0;
    },
    "equipment capacity": (request) => {
      request.equipmentCapacity = 0;
    },
    "planning horizon": (request) => {
      request.horizonHours = 1;
    },
    "misreported spend": (_, result) => {
      result.strategies[2].spend.health = 0;
    },
    "misreported crews": (_, result) => {
      result.strategies[2].crewsUsed = 0;
    },
    "misreported equipment": (_, result) => {
      result.strategies[2].equipmentUsed = 0;
    },
    "intervention cost drift": (_, result) => {
      result.strategies[2].interventions[0].cost++;
    },
    "duplicate funding": (_, result) => {
      result.strategies[2].interventions.push(
        structuredClone(result.strategies[2].interventions[0]),
      );
    },
    "duplicate candidate IDs": (_, result) => {
      result.candidates[1].actionId = result.candidates[0].actionId;
    },
    "wrong disruption status": (_, result) => {
      result.candidates.find(
        (candidate) => candidate.status === "blocked",
      )!.status = "available";
    },
    "unattributed action source": (_, result) => {
      result.candidates[0].source = "unverified:costs";
    },
    "missing initial frame": (_, result) => {
      result.strategies[2].frames.shift();
    },
    "missing completion event": (_, result) => {
      result.strategies[2].frames.splice(1, 1);
    },
    "reordered frame events": (_, result) => {
      result.strategies[2].frames.reverse();
    },
    "duplicate frame hours": (_, result) => {
      result.strategies[2].frames[1].hour = 0;
    },
    "wrong initial access": (_, result) => {
      result.strategies[2].frames[0].access.clinic = 0;
    },
    "wrong final access": (_, result) => {
      result.strategies[2].frames.at(-1)!.access.shelter = 0.5;
    },
    "decreasing restoration access": (_, result) => {
      result.strategies[2].frames[1].access.clinic = 1;
    },
    "unadvertised path ID": (_, result) => {
      result.strategies[2].frames.at(-1)!.serviceEdges.shelter = [
        "local-fixture-road",
      ];
    },
    "disconnected advertised path": (_, result) => {
      result.strategies[2].frames.at(-1)!.serviceEdges.shelter = ["south-link"];
    },
    "wrong service destination": (_, result) => {
      result.strategies[1].frames.at(-1)!.serviceEdges.clinic = [
        "main-link",
        "south-link",
      ];
    },
    "premature blocked-edge use": (_, result) => {
      result.strategies[2].frames[0].serviceEdges.shelter = [
        "main-link",
        "south-link",
      ];
    },
    "inconsistent joint utility": (_, result) => {
      result.strategies[2].jointUtility++;
    },
    "inconsistent disagreement gains": (_, result) => {
      result.strategies[2].gains.health++;
    },
    "wrong bargaining product": (_, result) => {
      result.strategies[2].nashProduct++;
    },
    "false no-agreement fallback": (_, result) => {
      result.agreement = false;
    },
  };
  it.each(Object.entries(malformed))(
    "rejects %s instead of presenting it as the submitted live plan",
    async (_, mutate) => {
      const demo = structuredClone(example("mitigation"));
      mutate(demo.request, demo.result);
      await expect(liveRun(demo.request, demo.result)).rejects.toMatchObject({
        code: "invalid_response",
      });
    },
  );
  it("rejects positive response access without a computed service path", async () => {
    const demo = structuredClone(example("response"));
    demo.result.strategies[2].frames.at(-1)!.serviceEdges.shelter = [];
    await expect(liveRun(demo.request, demo.result)).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
  it("does not label a canned successful response as live computation", async () => {
    const demo = example("mitigation");
    await expect(
      liveRun(demo.request, demo.result, "offline_example"),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
