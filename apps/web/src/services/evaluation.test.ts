import { describe, expect, it, vi } from "vitest";
import { offlineEvaluation, offlineScenario } from "@earthlab/contracts";
import { evaluateScenario } from "./evaluation";

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
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: offlineEvaluation })));
    const result = await evaluateScenario(offlineScenario, fetcher, "http://test");
    expect(result.transport).toBe("api");
    expect(result.evaluation.predictions).toEqual(offlineEvaluation.predictions);
    expect(fetcher).toHaveBeenCalledWith("http://test/api/v1/scenarios/evaluate", expect.objectContaining({ method: "POST" }));
  });
});
