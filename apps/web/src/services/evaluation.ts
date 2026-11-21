import { offlineEvaluation, type Evaluation, type Scenario } from "@earthlab/contracts";

export type EvaluationResult = {
  evaluation: Evaluation;
  transport: "api" | "local";
  message: string;
};

function isEvaluation(value: unknown): value is Evaluation {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<Evaluation>;
  return Boolean(data.scenario && data.modelMetadata && Array.isArray(data.disclaimers)
    && Array.isArray(data.predictions) && data.predictions.length > 0
    && data.predictions.every((prediction) =>
      typeof prediction.countyFips === "string"
      && Number.isFinite(prediction.predictedSeverity)
      && typeof prediction.severityUnit === "string"
      && typeof prediction.modelVersion === "string"
      && ["offline_example", "trained_conditional"].includes(prediction.dataMode)
      && prediction.scope === "selected_positive_outage_warning_hours"
      && Array.isArray(prediction.notes) && Array.isArray(prediction.sourceIds)));
}

export async function evaluateScenario(
  scenario: Scenario,
  fetcher: typeof fetch = fetch,
  baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
): Promise<EvaluationResult> {
  try {
    const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/api/v1/scenarios/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenario),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`API status ${response.status}`);
    const envelope: unknown = await response.json();
    if (!envelope || typeof envelope !== "object" || !("data" in envelope)
      || !isEvaluation(envelope.data)) throw new Error("Invalid evaluation envelope");
    return { evaluation: envelope.data, transport: "api", message: "API connected" };
  } catch {
    return {
      evaluation: { ...structuredClone(offlineEvaluation), scenario: structuredClone(scenario) },
      transport: "local",
      message: "API unavailable · bundled offline example",
    };
  }
}
