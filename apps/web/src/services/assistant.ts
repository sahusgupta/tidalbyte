import type { CommandProposal, Interpretation, ResponseMeta, Scenario } from "@earthlab/contracts";
import {
  jsonPost,
  keys,
  record,
  requestEnvelope,
  ServiceError,
  strings,
  text,
  type ServiceOptions,
} from "./client";
import { isScenario, sameScenario } from "./validation";

export interface AssistantCapabilities {
  presetEventIds: readonly string[];
  overlayIds: readonly string[];
  canRunAnalysis: boolean;
  canExplain?: boolean;
  canPlan?: boolean;
  selectedPlanningEdge?: string | null;
}
export type PlanningCommandArgs =
  | { intent: "compare" | "prioritize_hospitals" | "assume_blocked" | "explain" }
  | { intent: "resources"; totalBudget: number; crewCapacity: number };
export type ApprovedCommand = Omit<CommandProposal, "action" | "args"> &
  (
    | { action: "SELECT_REGION"; args: { regionId: "houston-gulf-coast" } }
    | { action: "SELECT_PRESET"; args: { presetEventId: string } }
    | { action: "RUN_ANALYSIS"; args: Record<string, never> }
    | {
        action: "TOGGLE_OVERLAY";
        args: { overlayId: string; visible: boolean };
      }
    | { action: "EXPLAIN_RESULT"; args: Record<string, never> }
    | { action: "COMPARE_INTERVENTION"; args: PlanningCommandArgs }
  );

const actions = [
  "SELECT_REGION",
  "SELECT_PRESET",
  "SET_PARAMETER",
  "RUN_ANALYSIS",
  "TOGGLE_OVERLAY",
  "COMPARE_INTERVENTION",
  "EXPLAIN_RESULT",
];
function isProposal(value: unknown): value is CommandProposal {
  return (
    record(value) &&
    keys(
      value,
      ["commandId", "scenarioVersion", "action", "args", "requiresConfirmation"],
      ["clarification"],
    ) &&
    text(value.commandId, 100) &&
    Number.isInteger(value.scenarioVersion) &&
    Number(value.scenarioVersion) >= 1 &&
    actions.includes(String(value.action)) &&
    record(value.args) &&
    Object.keys(value.args).length <= 16 &&
    typeof value.requiresConfirmation === "boolean" &&
    (value.clarification === undefined ||
      (typeof value.clarification === "string" && value.clarification.length <= 2000))
  );
}
function isInterpretation(value: unknown): value is Interpretation {
  return (
    record(value) &&
    keys(value, ["proposal", "clarifications"]) &&
    (value.proposal === null || isProposal(value.proposal)) &&
    strings(value.clarifications, 0, 10)
  );
}

export function validateProposal(
  proposal: CommandProposal,
  interpretedScenario: Scenario,
  currentScenario: Scenario,
  capabilities: AssistantCapabilities,
  interpretedPlanningEdge?: string | null,
): ApprovedCommand {
  if (!isProposal(proposal) || !isScenario(interpretedScenario) || !isScenario(currentScenario))
    throw new ServiceError(
      "unsupported",
      "The proposed command does not match the supported contract.",
    );
  if (
    proposal.scenarioVersion !== currentScenario.scenarioVersion ||
    !sameScenario(interpretedScenario, currentScenario)
  ) {
    throw new ServiceError(
      "stale",
      "The scenario changed. Request a new proposal before applying a command.",
    );
  }
  if (proposal.clarification?.trim()) throw new ServiceError("unsupported", proposal.clarification);
  // The published county-only interpreter uses {visible}. Normalize only that
  // documented form; all other overlay IDs still need an explicit allowlist match.
  const args =
    proposal.action === "TOGGLE_OVERLAY" && keys(proposal.args, ["visible"])
      ? { overlayId: "outages", visible: proposal.args.visible }
      : proposal.args;
  let allowed = false;
  switch (proposal.action) {
    case "SELECT_REGION":
      allowed = keys(args, ["regionId"]) && args.regionId === "houston-gulf-coast";
      break;
    case "SELECT_PRESET":
      allowed =
        keys(args, ["presetEventId"]) &&
        typeof args.presetEventId === "string" &&
        capabilities.presetEventIds.includes(args.presetEventId);
      break;
    case "TOGGLE_OVERLAY":
      allowed =
        keys(args, ["overlayId", "visible"]) &&
        typeof args.overlayId === "string" &&
        capabilities.overlayIds.includes(args.overlayId) &&
        typeof args.visible === "boolean";
      break;
    case "RUN_ANALYSIS":
      allowed =
        keys(args, []) &&
        capabilities.canRunAnalysis &&
        currentScenario.modelMode === "historical_context" &&
        Object.keys(currentScenario.perturbations ?? {}).length === 0;
      break;
    case "EXPLAIN_RESULT":
      allowed = keys(args, []) && capabilities.canExplain === true;
      break;
    case "COMPARE_INTERVENTION":
      allowed =
        capabilities.canPlan === true &&
        proposal.requiresConfirmation === true &&
        ((keys(args, ["intent"]) &&
          ["compare", "prioritize_hospitals", "assume_blocked", "explain"].includes(
            String(args.intent),
          )) ||
          (keys(args, ["intent", "totalBudget", "crewCapacity"]) &&
            args.intent === "resources" &&
            Number.isInteger(args.totalBudget) &&
            Number(args.totalBudget) >= 0 &&
            Number(args.totalBudget) <= 200 &&
            Number.isInteger(args.crewCapacity) &&
            Number(args.crewCapacity) >= 0 &&
            Number(args.crewCapacity) <= 6));
      if (allowed && args.intent === "assume_blocked") {
        if (
          !text(capabilities.selectedPlanningEdge, 200) ||
          !capabilities.selectedPlanningEdge?.trim()
        )
          throw new ServiceError(
            "unsupported",
            "Select a planning link before proposing an assumed blockage.",
          );
        if (
          interpretedPlanningEdge !== undefined &&
          interpretedPlanningEdge !== capabilities.selectedPlanningEdge
        )
          throw new ServiceError(
            "stale",
            "The selected planning link changed. Request a new proposal before applying it.",
          );
      }
      break;
  }
  if (!allowed)
    throw new ServiceError(
      "unsupported",
      "This command or its arguments are not supported by the current controls. Use the manual controls.",
    );
  return structuredClone({ ...proposal, args }) as ApprovedCommand;
}

export interface InterpretationResult {
  interpretation: Interpretation;
  mode: ResponseMeta["mode"];
  warnings: string[];
}
export async function interpretText(
  input: string,
  scenario: Scenario,
  options: ServiceOptions = {},
): Promise<InterpretationResult> {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2000 || !isScenario(scenario))
    throw new ServiceError(
      "unsupported",
      "Enter a request of 1–2,000 characters for the current supported scenario.",
    );
  const { data, meta } = await requestEnvelope(
    "/api/v1/ai/interpret",
    isInterpretation,
    jsonPost({ text: trimmed, scenarioSummary: scenario }),
    { ...options, timeoutMs: options.timeoutMs ?? 12000 },
  );
  return { interpretation: data, mode: meta.mode, warnings: meta.warnings };
}

export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export interface TranscriptionResult {
  transcript: string;
  mode: ResponseMeta["mode"];
  warnings: string[];
}
export async function transcribeAudio(
  audio: Blob,
  options: ServiceOptions = {},
): Promise<TranscriptionResult> {
  if (audio.size === 0 || audio.size > MAX_AUDIO_BYTES)
    throw new ServiceError("unsupported", "Record a short nonempty clip under 4 MiB.");
  const form = new FormData();
  const extension = audio.type.includes("mp4")
    ? "m4a"
    : audio.type.includes("ogg")
      ? "ogg"
      : "webm";
  form.append("audio", audio, `request.${extension}`);
  const isTranscript = (value: unknown): value is { transcript: string } =>
    record(value) &&
    keys(value, ["transcript"]) &&
    typeof value.transcript === "string" &&
    value.transcript.length <= 2000;
  const { data, meta } = await requestEnvelope(
    "/api/v1/voice/transcribe",
    isTranscript,
    { method: "POST", body: form },
    { ...options, timeoutMs: options.timeoutMs ?? 20000 },
  );
  return {
    transcript: data.transcript.trim(),
    mode: meta.mode,
    warnings: meta.warnings,
  };
}

/** Narration reads caller-supplied computed text; it never supplies model results. */
export async function speakPlanSummary(input: string, options: ServiceOptions = {}): Promise<Blob> {
  const summary = input.trim();
  if (!summary || summary.length > 2000)
    throw new ServiceError("unsupported", "A computed summary of 1–2,000 characters is required.");
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) throw new ServiceError("cancelled", "Narration cancelled.");
  options.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, options.timeoutMs ?? 25000);
  try {
    const base = options.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
    const response = await (options.fetcher ?? fetch)(
      `${base.replace(/\/$/, "")}/api/v1/voice/speak`,
      {
        ...jsonPost({ text: summary }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message =
        record(body) && record(body.error) && text(body.error.message, 4000)
          ? String(body.error.message)
          : "Speech narration is unavailable. The computed summary remains available as text.";
      throw new ServiceError(
        response.status === 422 ? "unsupported" : "unavailable",
        message,
        response.status,
      );
    }
    if (response.headers.get("content-type")?.split(";")[0] !== "audio/mpeg")
      throw new ServiceError(
        "invalid_response",
        "The narration service returned an unsupported audio response.",
      );
    const audio = await response.blob();
    if (!audio.size || audio.size > MAX_AUDIO_BYTES)
      throw new ServiceError("invalid_response", "The narration audio is empty or exceeds 4 MiB.");
    if (controller.signal.aborted)
      throw new ServiceError("unavailable", "Speech narration timed out.");
    return audio;
  } catch (error) {
    if (options.signal?.aborted) throw new ServiceError("cancelled", "Narration cancelled.");
    if (error instanceof ServiceError) throw error;
    throw new ServiceError(
      "unavailable",
      controller.signal.aborted
        ? "Speech narration timed out."
        : "Speech narration could not be reached.",
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}
