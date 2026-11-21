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
}
export type ApprovedCommand = Omit<CommandProposal, "action" | "args"> &
  (
    | { action: "SELECT_REGION"; args: { regionId: "houston-gulf-coast" } }
    | { action: "SELECT_PRESET"; args: { presetEventId: string } }
    | { action: "RUN_ANALYSIS"; args: Record<string, never> }
    | { action: "TOGGLE_OVERLAY"; args: { overlayId: string; visible: boolean } }
    | { action: "EXPLAIN_RESULT"; args: Record<string, never> }
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
  const args = proposal.args;
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
  }
  if (!allowed)
    throw new ServiceError(
      "unsupported",
      "This command or its arguments are not supported by the current controls. Use the manual controls.",
    );
  return structuredClone(proposal) as ApprovedCommand;
}

export interface InterpretationResult {
  interpretation: Interpretation;
  mode: ResponseMeta["mode"];
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
  return { interpretation: data, mode: meta.mode };
}

export async function transcribeAudio(audio: Blob, options: ServiceOptions = {}): Promise<string> {
  if (audio.size === 0 || audio.size > 10 * 1024 * 1024)
    throw new ServiceError("unsupported", "Record a short nonempty clip under 10 MB.");
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
    Boolean(value.transcript.trim()) &&
    value.transcript.length <= 2000;
  const { data } = await requestEnvelope(
    "/api/v1/voice/transcribe",
    isTranscript,
    { method: "POST", body: form },
    { ...options, timeoutMs: options.timeoutMs ?? 20000 },
  );
  return data.transcript.trim();
}
