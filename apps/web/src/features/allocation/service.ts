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
import {
  fetchNetworkCatalog,
  type NetworkCatalog,
} from "../../services/network";
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

const agencies = ["health", "shelter"] as const;
const facilities = ["clinic", "shelter"] as const;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-8;
const sameAccess = (
  a: AllocationResult["baselineAccess"],
  b: AllocationResult["baselineAccess"],
) => facilities.every((id) => close(a[id], b[id]));

/** Check ledger/time/path consistency, leaving optimization to the server. */
function coherentPlans(
  request: AllocationRequest,
  result: AllocationResult,
  catalog: NetworkCatalog,
): boolean {
  const candidates = new Map(
    result.candidates.map((candidate) => [candidate.actionId, candidate]),
  );
  if (
    candidates.size !== result.candidates.length ||
    !result.sourceIds.includes(result.graphSource) ||
    !result.sourceIds.includes(result.assumptionSetId) ||
    result.candidates.some((candidate) => {
      const expected = request.blockedEdgeIds.includes(candidate.assetId)
        ? "blocked"
        : request.impairedEdgeIds.includes(candidate.assetId)
          ? "impaired"
          : null;
      return (
        !result.sourceIds.includes(candidate.source) ||
        (expected
          ? candidate.status !== expected
          : ["blocked", "impaired"].includes(candidate.status)) ||
        (!request.footprint && candidate.exposed)
      );
    })
  )
    return false;
  const endpoints = new Map<string, [string, string]>();
  let origin: string | undefined;
  for (const feature of catalog.geojson.features) {
    const props = feature.properties ?? {};
    if (feature.geometry.type === "Point" && props.role === "origin")
      origin = String(props.nodeId ?? feature.id);
    if (feature.geometry.type !== "Point") {
      if (
        typeof props.from !== "string" ||
        typeof props.to !== "string" ||
        !catalog.nodeIds.includes(props.from) ||
        !catalog.nodeIds.includes(props.to)
      )
        return false;
      endpoints.set(String(props.edgeId ?? feature.id), [props.from, props.to]);
    }
  }
  if (
    !origin ||
    !catalog.nodeIds.includes(origin) ||
    !facilities.every((id) => catalog.nodeIds.includes(id))
  )
    return false;
  const independent = result.strategies.find(
    (strategy) => strategy.id === "independent",
  )!;
  for (const strategy of result.strategies) {
    const selected = strategy.interventions.map(
      (action) => candidates.get(action.actionId)!,
    );
    if (
      new Set(selected.map((action) => action.assetId)).size !==
        selected.length ||
      strategy.interventions.some(
        (action, index) =>
          action.cost !== selected[index].cost ||
          action.crews !== selected[index].crews,
      ) ||
      agencies.some((agency) => {
        const own = selected.filter((action) => action.agency === agency);
        const spend = own.reduce((sum, action) => sum + action.cost, 0);
        return (
          strategy.spend[agency] !== spend ||
          spend > request.agencies[agency].budget ||
          own.reduce((sum, action) => sum + action.crews, 0) >
            request.agencies[agency].crewCapacity ||
          !close(
            strategy.gains[agency],
            strategy.utilities[agency] - independent.utilities[agency],
          )
        );
      }) ||
      strategy.spend.health + strategy.spend.shelter > request.totalBudget ||
      strategy.crewsUsed !==
        selected.reduce((sum, action) => sum + action.crews, 0) ||
      strategy.crewsUsed > request.crewCapacity ||
      strategy.equipmentUsed !==
        selected.reduce((sum, action) => sum + action.equipment, 0) ||
      strategy.equipmentUsed > request.equipmentCapacity ||
      !close(
        strategy.completionHours,
        Math.max(0, ...selected.map((action) => action.hours)),
      ) ||
      strategy.completionHours > request.horizonHours ||
      !close(
        strategy.jointUtility,
        strategy.utilities.health + strategy.utilities.shelter,
      )
    )
      return false;
    const gains = strategy.gains;
    const weightedProduct = (offset: number) =>
      Math.max(0, gains.health + offset) ** (request.bargainingWeight / 10) *
      Math.max(0, gains.shelter + offset) **
        (1 - request.bargainingWeight / 10);
    // Serialized gains are rounded; near zero, powers amplify that rounding.
    const positive = gains.health > 0 && gains.shelter > 0;
    if (
      strategy.nashProduct < 0 ||
      (positive
        ? strategy.nashProduct < weightedProduct(-1e-8) - 1e-8 ||
          strategy.nashProduct > weightedProduct(1e-8) + 1e-8
        : !close(strategy.nashProduct, 0))
    )
      return false;
    const times = [
      ...new Set([0, ...selected.map((action) => action.hours)]),
    ].sort((a, b) => a - b);
    if (
      strategy.frames.length !== times.length ||
      strategy.frames.some(
        (frame, index) => !close(frame.hour, times[index]),
      ) ||
      !sameAccess(strategy.frames[0].access, result.baselineAccess) ||
      !sameAccess(strategy.frames.at(-1)!.access, strategy.access)
    )
      return false;
    for (const [index, frame] of strategy.frames.entries()) {
      const completed = new Set(
        selected
          .filter(
            (action) => action.hours <= frame.hour && request.effectPercent > 0,
          )
          .map((action) => action.assetId),
      );
      for (const facility of facilities) {
        if (
          index &&
          frame.access[facility] + 1e-8 <
            strategy.frames[index - 1].access[facility]
        )
          return false;
        const path = frame.serviceEdges[facility];
        if (!path.length) {
          if (request.phase === "response" && frame.access[facility] > 0)
            return false;
          continue; // Mitigation mean access can be positive with no declared-realization path.
        }
        if (frame.access[facility] <= 0) return false;
        let node = origin;
        const visited = new Set([node]);
        for (const edge of path) {
          const ends = endpoints.get(edge);
          if (
            !ends ||
            !ends.includes(node) ||
            (request.blockedEdgeIds.includes(edge) && !completed.has(edge))
          )
            return false;
          node = ends[0] === node ? ends[1] : ends[0];
          if (visited.has(node)) return false;
          visited.add(node);
        }
        if (node !== facility) return false;
      }
    }
  }
  const bargaining = result.strategies.find(
    (strategy) => strategy.id === "bargaining",
  )!;
  return result.agreement
    ? agencies.every((agency) => bargaining.gains[agency] > 0)
    : agencies.every((agency) =>
        close(bargaining.utilities[agency], independent.utilities[agency]),
      ) &&
        JSON.stringify(
          bargaining.interventions.map((action) => action.actionId).sort(),
        ) ===
          JSON.stringify(
            independent.interventions.map((action) => action.actionId).sort(),
          ) &&
        !result.strategies.some((strategy) =>
          agencies.every((agency) => strategy.gains[agency] > 0),
        );
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
    reply.meta.mode !== "exploratory_what_if" ||
    graph.catalog.graphSource !== result.graphSource ||
    !reply.meta.sourceIds.includes(result.graphSource) ||
    !result.sourceIds.every((source) =>
      reply.meta.sourceIds.includes(source),
    ) ||
    result.regionId !== scenario.regionId ||
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
    ) ||
    !coherentPlans(scenario, result, graph.catalog)
  ) {
    throw new ServiceError(
      "invalid_response",
      "The returned plan does not match the submitted resources, graph or playback. Retry the comparison.",
    );
  }
  return {
    request: scenario,
    result,
    geometry: graph.catalog.geojson,
    offline: false,
  };
}
