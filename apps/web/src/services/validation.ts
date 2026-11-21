import type { Evaluation, ModelMetadata, Prediction, Scenario } from "@earthlab/contracts";
import { finite, keys, record, strings, text } from "./client";

const scope = "selected_positive_outage_warning_hours";
const unique = (values: string[]) => new Set(values).size === values.length;

export function isScenario(value: unknown): value is Scenario {
  if (
    !record(value) ||
    !keys(
      value,
      ["id", "regionId", "presetEventId", "scenarioVersion", "selection", "modelMode"],
      ["perturbations"],
    )
  )
    return false;
  const selection = value.selection;
  return (
    text(value.id, 100) &&
    value.regionId === "houston-gulf-coast" &&
    text(value.presetEventId, 100) &&
    Number.isInteger(value.scenarioVersion) &&
    Number(value.scenarioVersion) >= 1 &&
    ["historical_context", "exploratory_what_if"].includes(String(value.modelMode)) &&
    record(selection) &&
    keys(selection, ["countyFips", "warningTypes", "eventTimeUtc"]) &&
    strings(selection.countyFips, 1, 50) &&
    unique(selection.countyFips) &&
    selection.countyFips.every((id) => /^\d{5}$/.test(id)) &&
    strings(selection.warningTypes, 1, 10) &&
    unique(selection.warningTypes) &&
    selection.warningTypes.every((warning) => warning.length <= 100) &&
    typeof selection.eventTimeUtc === "string" &&
    selection.eventTimeUtc.endsWith("Z") &&
    Number.isFinite(Date.parse(selection.eventTimeUtc)) &&
    (value.perturbations === undefined ||
      (record(value.perturbations) &&
        Object.keys(value.perturbations).length <= 16 &&
        Object.values(value.perturbations).every(finite)))
  );
}

export function isModelMetadata(value: unknown): value is ModelMetadata {
  if (
    !record(value) ||
    !keys(value, [
      "modelVersion",
      "dataMode",
      "status",
      "target",
      "severityUnit",
      "scope",
      "featureSchema",
      "trainingDatasetIds",
      "evaluation",
      "limitations",
    ])
  )
    return false;
  if (
    !text(value.modelVersion) ||
    !text(value.target) ||
    !text(value.severityUnit) ||
    value.scope !== scope ||
    !strings(value.trainingDatasetIds, 0, 100) ||
    !strings(value.limitations, 1, 30) ||
    !Array.isArray(value.featureSchema) ||
    value.featureSchema.length > 16 ||
    !value.featureSchema.every(
      (feature) =>
        record(feature) &&
        keys(feature, ["name", "unit", "min", "max"]) &&
        text(feature.name) &&
        text(feature.unit) &&
        finite(feature.min) &&
        finite(feature.max) &&
        feature.min <= feature.max,
    )
  )
    return false;
  if (value.dataMode === "offline_example")
    return (
      value.status === "not_trained" &&
      value.evaluation === null &&
      value.trainingDatasetIds.length === 0 &&
      value.featureSchema.length === 0
    );
  const metrics = value.evaluation;
  return (
    value.dataMode === "trained_conditional" &&
    value.status === "trained" &&
    value.trainingDatasetIds.length > 0 &&
    record(metrics) &&
    keys(metrics, [
      "splitPolicy",
      "baselineName",
      "baselineMae",
      "modelMae",
      "targetUnit",
      "trainEventCount",
      "testEventCount",
    ]) &&
    text(metrics.splitPolicy) &&
    text(metrics.baselineName) &&
    text(metrics.targetUnit) &&
    finite(metrics.baselineMae) &&
    metrics.baselineMae >= 0 &&
    finite(metrics.modelMae) &&
    metrics.modelMae >= 0 &&
    Number.isInteger(metrics.trainEventCount) &&
    Number(metrics.trainEventCount) >= 1 &&
    Number.isInteger(metrics.testEventCount) &&
    Number(metrics.testEventCount) >= 1
  );
}

function isPrediction(value: unknown): value is Prediction {
  return (
    record(value) &&
    keys(
      value,
      [
        "countyFips",
        "predictedSeverity",
        "severityUnit",
        "modelVersion",
        "dataMode",
        "scope",
        "notes",
        "sourceIds",
      ],
      ["baselineSeverity"],
    ) &&
    typeof value.countyFips === "string" &&
    /^\d{5}$/.test(value.countyFips) &&
    finite(value.predictedSeverity) &&
    value.predictedSeverity >= 0 &&
    text(value.severityUnit) &&
    text(value.modelVersion) &&
    ["trained_conditional", "offline_example"].includes(String(value.dataMode)) &&
    value.scope === scope &&
    strings(value.notes, 1, 30) &&
    strings(value.sourceIds, 1, 30) &&
    (value.baselineSeverity === undefined ||
      (finite(value.baselineSeverity) && value.baselineSeverity >= 0))
  );
}

export function isEvaluation(value: unknown): value is Evaluation {
  return (
    record(value) &&
    keys(value, ["scenario", "predictions", "modelMetadata", "disclaimers"]) &&
    isScenario(value.scenario) &&
    isModelMetadata(value.modelMetadata) &&
    strings(value.disclaimers, 1, 30) &&
    Array.isArray(value.predictions) &&
    value.predictions.length > 0 &&
    value.predictions.length <= 50 &&
    value.predictions.every(isPrediction)
  );
}

const sameValues = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((item, index) => item === [...b].sort()[index]);
export function sameScenario(a: Scenario, b: Scenario): boolean {
  const parameters = (value: Scenario) =>
    JSON.stringify(
      Object.entries(value.perturbations ?? {}).sort(([a], [b]) => a.localeCompare(b)),
    );
  return (
    a.id === b.id &&
    a.regionId === b.regionId &&
    a.presetEventId === b.presetEventId &&
    a.scenarioVersion === b.scenarioVersion &&
    a.modelMode === b.modelMode &&
    Date.parse(a.selection.eventTimeUtc) === Date.parse(b.selection.eventTimeUtc) &&
    sameValues(a.selection.countyFips, b.selection.countyFips) &&
    sameValues(a.selection.warningTypes, b.selection.warningTypes) &&
    parameters(a) === parameters(b)
  );
}
