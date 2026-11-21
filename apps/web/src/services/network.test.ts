import type {
  NetworkCompareRequest,
  PlanComparison,
} from "@earthlab/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  compareNetwork,
  fetchNetworkCatalog,
  fetchNetworkStrategy,
  previewNetwork,
  validateNetworkRequest,
} from "./network";

const graph = () => ({
  type: "FeatureCollection",
  graphSource: "project:graph-v1",
  features: [
    {
      type: "Feature",
      id: "actual-node-a",
      properties: { name: "Junction A" },
      geometry: { type: "Point", coordinates: [-95.4, 29.7] },
    },
    {
      type: "Feature",
      id: "actual-node-b",
      properties: { name: "Junction B" },
      geometry: { type: "Point", coordinates: [-95.3, 29.7] },
    },
    {
      type: "Feature",
      id: "actual-edge-a",
      properties: { name: "Advertised edge" },
      geometry: {
        type: "LineString",
        coordinates: [
          [-95.4, 29.7],
          [-95.3, 29.7],
        ],
      },
    },
  ],
});
const envelope = (data: unknown, source = "project:graph-v1") =>
  new Response(
    JSON.stringify({
      data,
      meta: {
        requestId: "test",
        mode: "offline_example",
        sourceIds: [source],
        warnings: [],
      },
      error: null,
    }),
  );
const request: NetworkCompareRequest = {
  regionId: "houston-gulf-coast",
  disabledEdgeIds: ["actual-edge-a"],
  disabledNodeIds: [],
  interventions: [],
};
const comparison: PlanComparison = {
  baseline: {
    connectedComponents: 1,
    reachableFacilities: 0,
    weightedAccessScore: 1,
  },
  proposal: {
    connectedComponents: 2,
    reachableFacilities: 0,
    weightedAccessScore: 0.5,
  },
  mode: "hypothetical_connectivity",
  graphSource: "project:graph-v1",
  limitations: ["Illustrative connectivity only"],
};

async function catalog() {
  const result = await fetchNetworkCatalog("houston-gulf-coast", {
    fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(graph())),
  });
  if (result.status !== "available")
    throw new Error("Test catalog did not load");
  return result.catalog;
}

describe("source-bound network adapters", () => {
  it("uses only the IDs explicitly advertised by the backend", async () => {
    const data = await catalog();
    expect(data.edgeIds).toEqual(["actual-edge-a"]);
    expect(data.nodes.map((node) => node.id)).toEqual([
      "actual-node-a",
      "actual-node-b",
    ]);
    expect(data.graphSource).toBe("project:graph-v1");
  });

  it.each(["source", "ids", "geometry"])(
    "does not accept a catalog with invalid %s",
    async (change) => {
      const data = graph();
      if (change === "source") data.graphSource = "different-source";
      if (change === "ids") data.features[2].id = "";
      if (change === "geometry")
        data.features[2].geometry.coordinates = [
          [999, 29],
          [998, 30],
        ];
      const result = await fetchNetworkCatalog("houston-gulf-coast", {
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(data)),
      });
      expect(result.status).toBe("unavailable");
    },
  );

  it("exposes unavailable backend state without inventing comparison numbers", async () => {
    const result = await fetchNetworkCatalog("houston-gulf-coast", {
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
    });
    expect(result.catalog).toBeNull();
    expect(result.message).toContain("local illustrative");
  });

  it("rejects local fixture IDs before making a backend request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      compareNetwork(
        { ...request, disabledEdgeIds: ["local-fictional-road"] },
        await catalog(),
        {
          fetcher,
        },
      ),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts a catalog-bound request and accepts matching source output", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope(comparison));
    const result = await compareNetwork(request, await catalog(), {
      fetcher,
      baseUrl: "http://test",
    });
    expect(result.status).toBe("available");
    expect(result.comparison).toEqual(comparison);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(request);
  });

  it("rejects a comparison when the source changed after catalog load", async () => {
    const result = await compareNetwork(request, await catalog(), {
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          envelope(
            { ...comparison, graphSource: "project:graph-v2" },
            "project:graph-v2",
          ),
        ),
    });
    expect(result.status).toBe("unavailable");
    expect(result.comparison).toBeNull();
  });

  it("rejects empty, conflicting, duplicate-ID and over-budget asset selections before requesting", async () => {
    const selected = await catalog();
    const intervention = {
      id: "one",
      graphEdgeIds: ["actual-edge-a"],
      graphNodeIds: [] as string[],
      action: "protect" as const,
    };
    expect(() =>
      validateNetworkRequest(
        { ...request, interventions: [{ ...intervention, graphEdgeIds: [] }] },
        selected,
      ),
    ).toThrow("needs an asset");
    expect(() =>
      validateNetworkRequest(
        { ...request, interventions: [intervention, intervention] },
        selected,
      ),
    ).toThrow("distinct plan ID");
    expect(() =>
      validateNetworkRequest(
        {
          ...request,
          interventions: [
            intervention,
            { ...intervention, id: "two", action: "disable" },
          ],
        },
        selected,
      ),
    ).toThrow("one action per asset");
  });
});

function preview() {
  return {
    ...graph(),
    features: graph().features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        baselineActive: false,
        proposalActive: true,
        baselineBridge: false,
        proposalBridge: true,
        intervention: "protect",
      },
    })),
    paths: {
      baseline: {},
      proposal: {
        "actual-node-b": { edgeIds: ["actual-edge-a"], travelCost: 3 },
      },
    },
  };
}
function strategy() {
  const row = {
    actions: ["pass", "actual-edge-a"],
    payoffs: [4, 1.5],
    totalPayoff: 5.5,
    reachableFacilities: ["actual-node-b"],
  };
  return {
    mode: "hypothetical_connectivity",
    graphSource: "project:graph-v1",
    agencies: [
      {
        id: "health",
        budgetUnits: 1,
        facilityUtilities: { "actual-node-b": 4 },
      },
      {
        id: "shelter",
        budgetUnits: 1,
        facilityUtilities: { "actual-node-b": 4 },
      },
    ],
    disabledEdgeIds: ["actual-edge-a"],
    actions: [
      { id: "pass", budgetUnits: 0 },
      { id: "actual-edge-a", budgetUnits: 1 },
    ],
    protectionUtilityCost: 2.5,
    payoffRule: "Reachable utility minus protection cost.",
    payoffTable: [row],
    independentEquilibria: [row],
    coordinatedOptima: [row],
    limitations: ["Fixed hypothetical example."],
  };
}
describe("catalog-bound previews and strategy", () => {
  it("accepts advertised activity flags and fictional travel costs", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope(preview()));
    const result = await previewNetwork(request, await catalog(), { fetcher });
    expect(result.status).toBe("available");
    expect(result.preview?.paths.proposal["actual-node-b"].travelCost).toBe(3);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(request);
  });
  it.each(["source", "asset", "flags", "path", "cost"])(
    "rejects preview drift in %s",
    async (change) => {
      const value = preview();
      if (change === "source") value.graphSource = "project:other";
      if (change === "asset") value.features[2].id = "unadvertised-edge";
      if (change === "flags")
        (
          value.features[0].properties as Record<string, unknown>
        ).proposalActive = "yes";
      if (change === "path")
        value.paths.proposal["actual-node-b"].edgeIds = ["invented-edge"];
      if (change === "cost")
        value.paths.proposal["actual-node-b"].travelCost = -1;
      expect(
        (
          await previewNetwork(request, await catalog(), {
            fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(value)),
          })
        ).status,
      ).toBe("unavailable");
    },
  );
  it("accepts the strategy table and accepts equivalent row key order", async () => {
    const value = strategy();
    const row = value.independentEquilibria[0];
    value.independentEquilibria = [
      {
        totalPayoff: row.totalPayoff,
        reachableFacilities: row.reachableFacilities,
        actions: row.actions,
        payoffs: row.payoffs,
      },
    ];
    expect(
      (
        await fetchNetworkStrategy(await catalog(), {
          fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(value)),
        })
      ).strategy?.payoffTable[0].totalPayoff,
    ).toBe(5.5);
  });
  it.each(["source", "asset", "utility", "payoff", "equilibrium"])(
    "rejects strategy drift in %s",
    async (change) => {
      const value = strategy();
      if (change === "source") value.graphSource = "project:other";
      if (change === "asset") value.actions[1].id = "invented-edge";
      if (change === "utility")
        Object.assign(value.agencies[0].facilityUtilities, {
          "not-in-catalog": 4,
        });
      if (change === "payoff") value.payoffTable[0].totalPayoff = 999;
      if (change === "equilibrium")
        value.independentEquilibria = [
          { ...value.payoffTable[0], actions: ["pass", "pass"] },
        ];
      expect(
        (
          await fetchNetworkStrategy(await catalog(), {
            fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(value)),
          })
        ).status,
      ).toBe("unavailable");
    },
  );
});
