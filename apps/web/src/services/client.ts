import type { Envelope, ResponseMeta } from "@earthlab/contracts";

export type ServiceErrorCode = "unavailable" | "invalid_response" | "unsupported" | "stale" | "cancelled";
export class ServiceError extends Error {
  constructor(public readonly code: ServiceErrorCode, message: string, public readonly status?: number) {
    super(message);
    this.name = "ServiceError";
  }
}

export interface ServiceOptions {
  fetcher?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
export const text = (value: unknown, max = 200) => typeof value === "string" && value.length > 0 && value.length <= max;
export function strings(value: unknown, min = 0, max = 100): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every((item) => text(item));
}
export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isMeta(value: unknown): value is ResponseMeta {
  return record(value) && keys(value, ["requestId", "mode", "sourceIds", "warnings"])
    && text(value.requestId) && ["historical_context", "exploratory_what_if", "offline_example"].includes(String(value.mode))
    && strings(value.sourceIds, 0, 30) && strings(value.warnings, 0, 30);
}

export async function requestEnvelope<T>(
  path: string,
  isData: (value: unknown) => value is T,
  init: RequestInit = {},
  options: ServiceOptions = {},
): Promise<Extract<Envelope<T>, { error: null }>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) throw new ServiceError("cancelled", "Request cancelled.");
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, options.timeoutMs ?? 6000);
  try {
    const base = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
    const response = await (options.fetcher ?? fetch)(`${base.replace(/\/$/, "")}${path}`, { ...init, signal: controller.signal });
    const envelope: unknown = await response.json().catch(() => null);
    if (options.signal?.aborted) throw new ServiceError("cancelled", "Request cancelled.");
    if (controller.signal.aborted) throw new ServiceError("unavailable", "The service timed out.");
    if (!record(envelope) || !keys(envelope, ["data", "meta", "error"]) || !isMeta(envelope.meta)) {
      throw new ServiceError(response.ok ? "invalid_response" : "unavailable", "The service returned an invalid response envelope.", response.status);
    }
    if (!response.ok || envelope.error !== null) {
      const error = envelope.error;
      if (envelope.data !== null || !record(error) || !keys(error, ["code", "message"], ["details"]) || !text(error.code)
        || typeof error.message !== "string" || error.message.length > 4000 || (error.details !== undefined && !Array.isArray(error.details))) {
        throw new ServiceError("invalid_response", "The service returned an invalid error envelope.", response.status);
      }
      throw new ServiceError(response.status === 404 || response.status === 422 ? "unsupported" : "unavailable", error.message || "The service is unavailable.", response.status);
    }
    if (!isData(envelope.data)) throw new ServiceError("invalid_response", "The service response does not match the supported contract.", response.status);
    return { data: envelope.data, meta: envelope.meta, error: null };
  } catch (error) {
    if (options.signal?.aborted) throw new ServiceError("cancelled", "Request cancelled.");
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("unavailable", controller.signal.aborted ? "The service timed out." : "The service could not be reached.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export const jsonPost = (data: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
