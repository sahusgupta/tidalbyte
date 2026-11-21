import Ajv2020 from "ajv/dist/2020";
import type { AllocationRequest, AllocationResult } from "@earthlab/contracts";
import schema from "../../../../../contracts/api.schema.json";
import rawGraph from "../../../../../data/fixtures/network-houston.geojson?raw";
import type { FeatureCollection } from "geojson";
import {
  requestEnvelope,
  jsonPost,
  ServiceError,
  type ServiceOptions,
} from "../../services/client";
import { fetchNetworkCatalog } from "../../services/network";
import responseRequest from "../../../../../data/fixtures/allocation/response-request.json";
import responseResult from "../../../../../data/fixtures/allocation/response-result.json";
import mitigationRequest from "../../../../../data/fixtures/allocation/mitigation-request.json";
import mitigationResult from "../../../../../data/fixtures/allocation/mitigation-result.json";

const planningDefinitions = Object.fromEntries(
  Object.entries(schema.$defs).filter(([key]) => key.startsWith("Allocation")),
);
const validators = new Ajv2020({
  strict: false,
  validateFormats: false,
}).addSchema({ $id: schema.$id, $defs: planningDefinitions });
const requestCheck = validators.getSchema(
  schema.$id + "#/$defs/AllocationRequest",
)!;
const resultCheck = validators.getSchema(
  schema.$id + "#/$defs/AllocationResult",
)!;
const isRequest = (v: unknown): v is AllocationRequest =>
  requestCheck(v) === true;
const isResult = (v: unknown): v is AllocationResult => resultCheck(v) === true;
const base = "/api/v1/allocation";
export const bundledGraph = JSON.parse(rawGraph) as FeatureCollection & {
  sourceId: string;
};
const examples: Record<
  AllocationRequest["phase"],
  readonly [unknown, unknown]
> = {
  response: [responseRequest, responseResult],
  mitigation: [mitigationRequest, mitigationResult],
} as const;

export interface PlanRun {
  request: AllocationRequest;
  result: AllocationResult;
  geometry: FeatureCollection;
  offline: boolean;
}

export function example(phase: AllocationRequest["phase"]): PlanRun {
  const [request, result] = examples[phase];
  if (!isRequest(request) || !isResult(result))
    throw new Error("Invalid bundled allocation example.");
  return { request, result, geometry: bundledGraph, offline: true };
}

export async function runPlan(
  request?: AllocationRequest,
  options: ServiceOptions = {},
): Promise<PlanRun> {
  const scenario =
    request ??
    (await requestEnvelope(base + "/demo", isRequest, {}, options)).data;
  if (!isRequest(scenario))
    throw new ServiceError(
      "unsupported",
      "Check the planning limits before comparing.",
    );
  const [reply, graph] = await Promise.all([
    requestEnvelope(
      base + "/plans/compare",
      isResult,
      jsonPost(scenario),
      options,
    ),
    fetchNetworkCatalog(scenario.regionId, options),
  ]);
  const result = reply.data;
  if (
    !graph.catalog ||
    graph.catalog.graphSource !== result.graphSource ||
    !reply.meta.sourceIds.includes(result.graphSource) ||
    result.phase !== scenario.phase ||
    result.scenarioVersion !== scenario.scenarioVersion ||
    new Set(result.strategies.map((s) => s.id)).size !== 3 ||
    result.candidates.some(
      (c) => !graph.catalog!.edgeIds.includes(c.assetId),
    ) ||
    result.strategies.some((s) =>
      s.interventions.some(
        (i) =>
          !result.candidates.some(
            (c) =>
              c.actionId === i.actionId &&
              c.assetId === i.assetId &&
              c.agency === i.agency,
          ),
      ),
    )
  ) {
    throw new ServiceError(
      "invalid_response",
      "The computed plans and map do not share a valid catalog.",
    );
  }
  return {
    request: scenario,
    result,
    geometry: graph.catalog.geojson,
    offline: false,
  };
}
