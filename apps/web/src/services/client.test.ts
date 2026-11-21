import { afterEach, describe, expect, it, vi } from "vitest";
import { requestEnvelope } from "./client";

const isValue = (value: unknown): value is { value: string } => Boolean(value && typeof value === "object" && "value" in value && typeof value.value === "string");
afterEach(() => vi.useRealTimers());

describe("bounded service requests", () => {
  it("rejects a success response carrying an error instead of trusting the data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: { value: "untrusted" }, error: { code: "bad", message: "error" }, meta: { requestId: "test", mode: "offline_example", sourceIds: [], warnings: [] } })));
    await expect(requestEnvelope("/test", isValue, {}, { fetcher })).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("times out an unresponsive provider request", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const assertion = expect(requestEnvelope("/test", isValue, {}, { fetcher, timeoutMs: 50 })).rejects.toMatchObject({ code: "unavailable", message: "The service timed out." });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("honors cancellation without converting it into a provider outage", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true })));
    const pending = requestEnvelope("/test", isValue, {}, { fetcher, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
  });
});
