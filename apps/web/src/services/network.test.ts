import type { NetworkCompareRequest, PlanComparison } from "@earthlab/contracts";
import { describe, expect, it, vi } from "vitest";
import { compareNetwork, fetchNetworkCatalog } from "./network";

const graph = () => ({ type: "FeatureCollection", graphSource: "project:graph-v1", features: [
  { type: "Feature", id: "actual-node-a", properties: { name: "Junction A" }, geometry: { type: "Point", coordinates: [-95.4, 29.7] } },
  { type: "Feature", id: "actual-node-b", properties: { name: "Junction B" }, geometry: { type: "Point", coordinates: [-95.3, 29.7] } },
  { type: "Feature", id: "actual-edge-a", properties: { name: "Advertised edge" }, geometry: { type: "LineString", coordinates: [[-95.4, 29.7], [-95.3, 29.7]] } },
] });
const envelope = (data: unknown, source = "project:graph-v1") => new Response(JSON.stringify({ data, meta: { requestId: "test", mode: "offline_example", sourceIds: [source], warnings: [] }, error: null }));
const request: NetworkCompareRequest = { regionId: "houston-gulf-coast", disabledEdgeIds: ["actual-edge-a"], disabledNodeIds: [], interventions: [] };
const comparison: PlanComparison = { baseline: { connectedComponents: 1, reachableFacilities: 0, weightedAccessScore: 1 }, proposal: { connectedComponents: 2, reachableFacilities: 0, weightedAccessScore: 0.5 }, mode: "hypothetical_connectivity", graphSource: "project:graph-v1", limitations: ["Illustrative connectivity only"] };

async function catalog() {
  const result = await fetchNetworkCatalog("houston-gulf-coast", { fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(graph())) });
  if (result.status !== "available") throw new Error("Test catalog did not load");
  return result.catalog;
}

describe("source-bound network adapters", () => {
  it("uses only the IDs explicitly advertised by the backend", async () => {
    const data = await catalog();
    expect(data.edgeIds).toEqual(["actual-edge-a"]);
    expect(data.nodes.map((node) => node.id)).toEqual(["actual-node-a", "actual-node-b"]);
    expect(data.graphSource).toBe("project:graph-v1");
  });

  it.each(["source", "ids", "geometry"])("does not accept a catalog with invalid %s", async (change) => {
    const data = graph();
    if (change === "source") data.graphSource = "different-source";
    if (change === "ids") data.features[2].id = "";
    if (change === "geometry") data.features[2].geometry.coordinates = [[999, 29], [998, 30]];
    const result = await fetchNetworkCatalog("houston-gulf-coast", { fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope(data)) });
    expect(result.status).toBe("unavailable");
  });

  it("exposes unavailable backend state without inventing comparison numbers", async () => {
    const result = await fetchNetworkCatalog("houston-gulf-coast", { fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")) });
    expect(result.catalog).toBeNull();
    expect(result.message).toContain("local illustrative");
  });

  it("rejects local fixture IDs before making a backend request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(compareNetwork({ ...request, disabledEdgeIds: ["local-fictional-road"] }, await catalog(), { fetcher })).rejects.toMatchObject({ code: "unsupported" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts a catalog-bound request and accepts matching source output", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(envelope(comparison));
    const result = await compareNetwork(request, await catalog(), { fetcher, baseUrl: "http://test" });
    expect(result.status).toBe("available");
    expect(result.comparison).toEqual(comparison);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(request);
  });

  it("rejects a comparison when the source changed after catalog load", async () => {
    const result = await compareNetwork(request, await catalog(), { fetcher: vi.fn<typeof fetch>().mockResolvedValue(envelope({ ...comparison, graphSource: "project:graph-v2" }, "project:graph-v2")) });
    expect(result.status).toBe("unavailable");
    expect(result.comparison).toBeNull();
  });
});
