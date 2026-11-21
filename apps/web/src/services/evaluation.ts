import { offlineEvaluation, type Evaluation, type Scenario } from "@earthlab/contracts";
import { jsonPost, requestEnvelope, ServiceError, type ServiceOptions } from "./client";
import { isEvaluation, isScenario, sameScenario } from "./validation";

export type EvaluationResult = {
  evaluation: Evaluation;
  transport: "api" | "local";
  message: string;
};

function compatibleFixture(scenario: Scenario): boolean {
  const preset = offlineEvaluation.scenario;
  return (
    scenario.regionId === preset.regionId &&
    scenario.presetEventId === preset.presetEventId &&
    scenario.modelMode === "historical_context" &&
    Object.keys(scenario.perturbations ?? {}).length === 0 &&
    Date.parse(scenario.selection.eventTimeUtc) === Date.parse(preset.selection.eventTimeUtc) &&
    scenario.selection.warningTypes.length === preset.selection.warningTypes.length &&
    scenario.selection.warningTypes.every((warning) =>
      preset.selection.warningTypes.includes(warning),
    ) &&
    scenario.selection.countyFips.every((id) =>
      offlineEvaluation.predictions.some((prediction) => prediction.countyFips === id),
    )
  );
}

export async function evaluateScenario(
  scenario: Scenario,
  fetcher: typeof fetch = fetch,
  baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  signal?: AbortSignal,
): Promise<EvaluationResult> {
  if (!isScenario(scenario))
    throw new ServiceError(
      "unsupported",
      "The county analysis request does not match the supported scenario contract.",
    );
  const request = structuredClone(scenario);
  const options: ServiceOptions = { fetcher, baseUrl, signal };
  try {
    const { data, meta } = await requestEnvelope(
      "/api/v1/scenarios/evaluate",
      isEvaluation,
      jsonPost(request),
      options,
    );
    const selected = new Set(request.selection.countyFips);
    if (
      !sameScenario(data.scenario, request) ||
      data.predictions.length !== selected.size ||
      new Set(data.predictions.map((prediction) => prediction.countyFips)).size !== selected.size ||
      data.predictions.some(
        (prediction) =>
          !selected.has(prediction.countyFips) ||
          prediction.modelVersion !== data.modelMetadata.modelVersion ||
          prediction.severityUnit !== data.modelMetadata.severityUnit ||
          prediction.dataMode !== data.modelMetadata.dataMode ||
          prediction.sourceIds.some((source) => !meta.sourceIds.includes(source)),
      ) ||
      meta.mode !==
        (data.modelMetadata.dataMode === "offline_example" ? "offline_example" : request.modelMode)
    ) {
      throw new ServiceError(
        "invalid_response",
        "The county response has mismatched scenario, model, scope, or provenance.",
      );
    }
    return {
      evaluation: data,
      transport: "api",
      message:
        data.modelMetadata.dataMode === "offline_example"
          ? "API connected · offline example"
          : "API connected · conditional county severity",
    };
  } catch (error) {
    if (error instanceof ServiceError && ["unsupported", "cancelled"].includes(error.code))
      throw error;
    if (!compatibleFixture(request))
      throw new ServiceError(
        "unavailable",
        "County analysis is unavailable for these inputs. No compatible offline example exists.",
      );
    const evaluation = structuredClone(offlineEvaluation);
    evaluation.scenario = request;
    evaluation.predictions = request.selection.countyFips.map((id) =>
      evaluation.predictions.find((prediction) => prediction.countyFips === id)!,
    );
    return {
      evaluation,
      transport: "local",
      message: "API unavailable or response rejected · bundled offline example",
    };
  }
}
