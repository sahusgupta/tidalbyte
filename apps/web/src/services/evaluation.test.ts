import { describe, expect, it, vi } from "vitest";
import { offlineEvaluation, offlineScenario } from "@earthlab/contracts";
import { evaluateScenario } from "./evaluation";

const envelope = (data: unknown, sourceIds = ["project:offline-fixture-v1"]) => ({ data, meta: { requestId: "test", mode: "offline_example", sourceIds, warnings: [] }, error: null });

describe("evaluation transport", () => {
  it("falls back to explicitly offline data when the API is unavailable", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Network error"));
    const result = await evaluateScenario(offlineScenario, fetcher, "http://test");
    expect(result.transport).toBe("local");
    expect(result.evaluation.predictions.every((item) => item.dataMode === "offline_example")).toBe(true);
    expect(result.message).toContain("offline example");
  });

  it("does not trust malformed success responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { predictions: [] } })));
    const result = await evaluateScenario(offlineScenario, fetcher, "http://test");
    expect(result.transport).toBe("local");
  });

  it("preserves a valid enveloped API response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(envelope(offlineEvaluation))));
    const result = await evaluateScenario(offlineScenario, fetcher, "http://test");
    expect(result.transport).toBe("api");
    expect(result.evaluation.predictions).toEqual(offlineEvaluation.predictions);
    expect(fetcher).toHaveBeenCalledWith("http://test/api/v1/scenarios/evaluate", expect.objectContaining({ method: "POST" }));
  });

  it("filters fallback to the requested county without reinterpreting the fixture", async () => {
    const scenario = structuredClone(offlineScenario);
    scenario.scenarioVersion = 9;
    scenario.selection.countyFips = ["48157"];
    const result = await evaluateScenario(scenario, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")), "http://test");
    expect(result.evaluation.predictions.map((item) => item.countyFips)).toEqual(["48157"]);
    expect(result.evaluation.scenario.scenarioVersion).toBe(9);
    expect(offlineEvaluation.predictions).toHaveLength(3);
  });

  it.each(["scenario", "source", "unit", "version", "scope", "counties"])("rejects %s drift in a success response", async (change) => {
    const data = structuredClone(offlineEvaluation);
    const sources = ["project:offline-fixture-v1"];
    if (change === "scenario") data.scenario.scenarioVersion++;
    if (change === "source") sources[0] = "unrelated-source";
    if (change === "unit") data.predictions[0].severityUnit = "probability";
    if (change === "version") data.predictions[0].modelVersion = "unknown-model";
    if (change === "scope") Object.assign(data.predictions[0], { scope: "road_failure" });
    if (change === "counties") data.predictions[0].countyFips = "99999";
    const result = await evaluateScenario(offlineScenario, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(envelope(data, sources)))), "http://test");
    expect(result.transport).toBe("local");
    expect(result.evaluation.predictions).toEqual(offlineEvaluation.predictions);
  });

  it("does not substitute canned values for altered weather inputs", async () => {
    const scenario = { ...structuredClone(offlineScenario), modelMode: "exploratory_what_if" as const, perturbations: { rainfall: 50 } };
    await expect(evaluateScenario(scenario, vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")), "http://test")).rejects.toThrow("No compatible offline example");
  });

  it("preserves a server validation refusal instead of falling back", async () => {
    const body = { ...envelope(null), error: { code: "unsupported_input", message: "Unknown event", details: [] } };
    await expect(evaluateScenario(offlineScenario, vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 422 })), "http://test")).rejects.toMatchObject({ code: "unsupported", status: 422 });
  });

  it("does not return fixtures after explicit cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(evaluateScenario(offlineScenario, vi.fn<typeof fetch>(), "http://test", controller.signal)).rejects.toMatchObject({ code: "cancelled" });
  });
});
