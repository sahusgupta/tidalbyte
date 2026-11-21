import type {
  ConnectivityMetrics,
  NetworkCompareRequest,
  PlanComparison,
} from "@earthlab/contracts";
import type { FeatureCollection } from "geojson";
import {
  finite,
  jsonPost,
  keys,
  record,
  requestEnvelope,
  ServiceError,
  strings,
  text,
  type ServiceOptions,
} from "./client";

export interface NetworkItem {
  id: string;
  name: string;
}
export interface NetworkCatalog {
  regionId: "houston-gulf-coast";
  graphSource: string;
  nodeIds: string[];
  edgeIds: string[];
  nodes: NetworkItem[];
  edges: NetworkItem[];
  geojson: FeatureCollection;
}
export type NetworkCatalogResult =
  | { status: "available"; catalog: NetworkCatalog; message: string }
  | { status: "unavailable"; catalog: null; message: string };
export type NetworkComparisonResult =
  | { status: "available"; comparison: PlanComparison; message: string }
  | { status: "unavailable"; comparison: null; message: string };

function isGeoJSON(value: unknown): value is FeatureCollection {
  const position = (point: unknown): boolean =>
    Array.isArray(point) &&
    point.length >= 2 &&
    finite(point[0]) &&
    Math.abs(point[0]) <= 180 &&
    finite(point[1]) &&
    Math.abs(point[1]) <= 90;
  const line = (points: unknown): boolean =>
    Array.isArray(points) && points.length >= 2 && points.every(position);
  const geometry = (value: unknown): boolean =>
    record(value) &&
    (value.type === "Point"
      ? position(value.coordinates)
      : value.type === "LineString"
        ? line(value.coordinates)
        : value.type === "MultiLineString" &&
          Array.isArray(value.coordinates) &&
          value.coordinates.length > 0 &&
          value.coordinates.every(line));
  return (
    record(value) &&
    value.type === "FeatureCollection" &&
    Array.isArray(value.features) &&
    value.features.length > 0 &&
    value.features.length <= 5000 &&
    value.features.every(
      (feature) =>
        record(feature) &&
        feature.type === "Feature" &&
        geometry(feature.geometry) &&
        record(feature.properties),
    )
  );
}

function catalogFrom(
  geojson: FeatureCollection,
  sourceIds: string[],
): NetworkCatalog {
  const value = geojson as unknown as Record<string, unknown>;
  const declaredSources = strings(value.sourceIds, 1, 1) ? value.sourceIds : [];
  const graphSource =
    typeof value.graphSource === "string"
      ? value.graphSource
      : typeof value.sourceId === "string"
        ? value.sourceId
        : declaredSources[0];
  if (!text(graphSource) || !sourceIds.includes(graphSource))
    throw new ServiceError(
      "invalid_response",
      "Network catalog omitted a matching, explicit graph source.",
    );
  const nodes: NetworkItem[] = [];
  const edges: NetworkItem[] = [];
  for (const feature of geojson.features) {
    const properties = feature.properties ?? {};
    const kind = feature.geometry?.type;
    if (!["Point", "LineString", "MultiLineString"].includes(kind)) continue;
    const itemId =
      kind === "Point"
        ? (properties.nodeId ?? feature.id)
        : (properties.edgeId ?? feature.id);
    if (
      !text(itemId) ||
      (properties.sourceId !== undefined && properties.sourceId !== graphSource)
    ) {
      throw new ServiceError(
        "invalid_response",
        "Network features need explicit IDs and consistent graph provenance.",
      );
    }
    const item = {
      id: itemId as string,
      name:
        typeof properties.name === "string"
          ? properties.name.slice(0, 200)
          : String(itemId).replaceAll("-", " "),
    };
    (kind === "Point" ? nodes : edges).push(item);
  }
  if (
    edges.length === 0 ||
    new Set(edges.map((item) => item.id)).size !== edges.length ||
    new Set(nodes.map((item) => item.id)).size !== nodes.length
  ) {
    throw new ServiceError(
      "invalid_response",
      "Network catalog contains no selectable edges or has duplicate identifiers.",
    );
  }
  return {
    regionId: "houston-gulf-coast",
    graphSource,
    nodeIds: nodes.map((item) => item.id),
    edgeIds: edges.map((item) => item.id),
    nodes,
    edges,
    geojson,
  };
}

export async function fetchNetworkCatalog(
  regionId: "houston-gulf-coast" = "houston-gulf-coast",
  options: ServiceOptions = {},
): Promise<NetworkCatalogResult> {
  try {
    const { data, meta } = await requestEnvelope(
      `/api/v1/network?regionId=${encodeURIComponent(regionId)}`,
      isGeoJSON,
      {},
      options,
    );
    return {
      status: "available",
      catalog: catalogFrom(data, meta.sourceIds),
      message: "Backend graph available · select its advertised edge IDs",
    };
  } catch (error) {
    if (error instanceof ServiceError && error.code === "cancelled")
      throw error;
    return {
      status: "unavailable",
      catalog: null,
      message:
        "Backend graph unavailable · use the separately labeled local illustrative network",
    };
  }
}

function metrics(value: unknown): value is ConnectivityMetrics {
  return (
    record(value) &&
    keys(value, [
      "reachableFacilities",
      "connectedComponents",
      "weightedAccessScore",
    ]) &&
    Number.isInteger(value.reachableFacilities) &&
    Number(value.reachableFacilities) >= 0 &&
    Number.isInteger(value.connectedComponents) &&
    Number(value.connectedComponents) >= 0 &&
    finite(value.weightedAccessScore) &&
    value.weightedAccessScore >= 0
  );
}
function isComparison(value: unknown): value is PlanComparison {
  return (
    record(value) &&
    keys(value, [
      "baseline",
      "proposal",
      "limitations",
      "graphSource",
      "mode",
    ]) &&
    metrics(value.baseline) &&
    metrics(value.proposal) &&
    strings(value.limitations, 1, 30) &&
    text(value.graphSource) &&
    value.mode === "hypothetical_connectivity"
  );
}

export function validateNetworkRequest(
  request: NetworkCompareRequest,
  catalog: NetworkCatalog,
): void {
  const validIds = (ids: unknown, allowed: string[], max: number) =>
    strings(ids, 0, max) &&
    new Set(ids).size === ids.length &&
    ids.every((id) => allowed.includes(id));
  if (
    !record(request) ||
    !keys(request, [
      "regionId",
      "disabledNodeIds",
      "disabledEdgeIds",
      "interventions",
    ]) ||
    request.regionId !== catalog.regionId ||
    !validIds(request.disabledNodeIds, catalog.nodeIds, 100) ||
    !validIds(request.disabledEdgeIds, catalog.edgeIds, 100) ||
    !Array.isArray(request.interventions) ||
    request.interventions.length > 3 ||
    request.interventions.some(
      (intervention) =>
        !record(intervention) ||
        !keys(
          intervention,
          ["id", "graphEdgeIds", "graphNodeIds", "action"],
          ["budgetUnits"],
        ) ||
        !text(intervention.id) ||
        !["protect", "disable", "inspect"].includes(intervention.action) ||
        !validIds(intervention.graphEdgeIds, catalog.edgeIds, 3) ||
        !validIds(intervention.graphNodeIds, catalog.nodeIds, 3) ||
        intervention.graphEdgeIds.length + intervention.graphNodeIds.length >
          3 ||
        (intervention.budgetUnits !== undefined &&
          (!finite(intervention.budgetUnits) || intervention.budgetUnits < 0)),
    )
  ) {
    throw new ServiceError(
      "unsupported",
      "Select only IDs advertised by this backend graph. Local fixture IDs cannot be sent to the live comparison.",
    );
  }
  const actions = new Map<string, string>();
  const interventionIds = new Set<string>();
  for (const intervention of request.interventions) {
    const assets = [...intervention.graphEdgeIds, ...intervention.graphNodeIds];
    if (!assets.length || interventionIds.has(intervention.id))
      throw new ServiceError(
        "unsupported",
        "Each intervention needs an asset and a distinct plan ID.",
      );
    interventionIds.add(intervention.id);
    for (const asset of assets) {
      if (actions.has(asset) && actions.get(asset) !== intervention.action)
        throw new ServiceError("unsupported", "Choose one action per asset.");
      actions.set(asset, intervention.action);
    }
  }
  if (actions.size > 3)
    throw new ServiceError(
      "unsupported",
      "Select at most three distinct intervention assets.",
    );
}

export interface NetworkPath {
  edgeIds: string[];
  travelCost: number;
}
export interface NetworkPreview {
  geojson: FeatureCollection;
  paths: {
    baseline: Record<string, NetworkPath>;
    proposal: Record<string, NetworkPath>;
  };
}
export type NetworkPreviewResult =
  | { status: "available"; preview: NetworkPreview; message: string }
  | { status: "unavailable"; preview: null; message: string };

function previewFrom(
  value: FeatureCollection,
  catalog: NetworkCatalog,
): NetworkPreview {
  const parsed = catalogFrom(value, [catalog.graphSource]);
  const idsMatch = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id) => b.includes(id));
  if (
    parsed.graphSource !== catalog.graphSource ||
    !idsMatch(parsed.nodeIds, catalog.nodeIds) ||
    !idsMatch(parsed.edgeIds, catalog.edgeIds)
  )
    throw new ServiceError(
      "invalid_response",
      "Preview assets differ from the selected graph.",
    );
  for (const feature of value.features) {
    const properties = feature.properties ?? {};
    if (
      ![
        "baselineActive",
        "proposalActive",
        "baselineBridge",
        "proposalBridge",
      ].every((key) => typeof properties[key] === "boolean") ||
      ![null, "protect", "disable", "inspect"].includes(properties.intervention)
    )
      throw new ServiceError(
        "invalid_response",
        "Preview omitted asset activity or intervention flags.",
      );
  }
  const paths = (value as unknown as Record<string, unknown>).paths;
  const isPaths = (items: unknown): items is Record<string, NetworkPath> =>
    record(items) &&
    Object.keys(items).every((id) => catalog.nodeIds.includes(id)) &&
    Object.values(items).every(
      (path) =>
        record(path) &&
        keys(path, ["edgeIds", "travelCost"]) &&
        strings(path.edgeIds, 0, 5000) &&
        path.edgeIds.every((id) => catalog.edgeIds.includes(id)) &&
        finite(path.travelCost) &&
        path.travelCost >= 0,
    );
  if (
    !record(paths) ||
    !keys(paths, ["baseline", "proposal"]) ||
    !isPaths(paths.baseline) ||
    !isPaths(paths.proposal)
  )
    throw new ServiceError(
      "invalid_response",
      "Preview paths do not belong to the selected graph.",
    );
  return {
    geojson: value,
    paths: { baseline: paths.baseline, proposal: paths.proposal },
  };
}

export async function previewNetwork(
  request: NetworkCompareRequest,
  catalog: NetworkCatalog,
  options: ServiceOptions = {},
): Promise<NetworkPreviewResult> {
  validateNetworkRequest(request, catalog);
  try {
    const { data, meta } = await requestEnvelope(
      "/api/v1/network/preview",
      isGeoJSON,
      jsonPost(request),
      options,
    );
    if (!meta.sourceIds.includes(catalog.graphSource))
      throw new ServiceError(
        "invalid_response",
        "Preview graph source changed.",
      );
    return {
      status: "available",
      preview: previewFrom(data, catalog),
      message: "Backend schematic preview",
    };
  } catch (error) {
    if (
      error instanceof ServiceError &&
      ["cancelled", "unsupported"].includes(error.code)
    )
      throw error;
    return {
      status: "unavailable",
      preview: null,
      message: "Connection preview unavailable; no paths are inferred locally.",
    };
  }
}

export interface StrategyProfile {
  actions: string[];
  payoffs: number[];
  totalPayoff: number;
  reachableFacilities: string[];
}
export interface NetworkStrategy {
  mode: "hypothetical_connectivity";
  graphSource: string;
  agencies: {
    id: string;
    budgetUnits: number;
    facilityUtilities: Record<string, number>;
  }[];
  disabledEdgeIds: string[];
  actions: { id: string; budgetUnits: number }[];
  protectionUtilityCost: number;
  payoffRule: string;
  payoffTable: StrategyProfile[];
  independentEquilibria: StrategyProfile[];
  coordinatedOptima: StrategyProfile[];
  limitations: string[];
}
export type NetworkStrategyResult =
  | { status: "available"; strategy: NetworkStrategy; message: string }
  | { status: "unavailable"; strategy: null; message: string };

function isStrategy(value: unknown): value is NetworkStrategy {
  if (
    !record(value) ||
    !keys(value, [
      "mode",
      "graphSource",
      "agencies",
      "disabledEdgeIds",
      "actions",
      "protectionUtilityCost",
      "payoffRule",
      "payoffTable",
      "independentEquilibria",
      "coordinatedOptima",
      "limitations",
    ]) ||
    value.mode !== "hypothetical_connectivity" ||
    !text(value.graphSource) ||
    !strings(value.disabledEdgeIds) ||
    !finite(value.protectionUtilityCost) ||
    value.protectionUtilityCost < 0 ||
    !text(value.payoffRule, 4000) ||
    !strings(value.limitations, 1, 30)
  )
    return false;
  const nonnegative = (n: unknown): n is number => finite(n) && n >= 0;
  if (
    !Array.isArray(value.agencies) ||
    value.agencies.length !== 2 ||
    !value.agencies.every(
      (agency) =>
        record(agency) &&
        keys(agency, ["id", "budgetUnits", "facilityUtilities"]) &&
        text(agency.id) &&
        nonnegative(agency.budgetUnits) &&
        record(agency.facilityUtilities) &&
        Object.keys(agency.facilityUtilities).length <= 100 &&
        Object.values(agency.facilityUtilities).every(nonnegative),
    ) ||
    new Set(value.agencies.map((agency) => agency.id)).size !== 2
  )
    return false;
  if (
    !Array.isArray(value.actions) ||
    !value.actions.length ||
    value.actions.length > 20 ||
    !value.actions.every(
      (action) =>
        record(action) &&
        keys(action, ["id", "budgetUnits"]) &&
        text(action.id) &&
        nonnegative(action.budgetUnits),
    ) ||
    new Set(value.actions.map((action) => action.id)).size !==
      value.actions.length
  )
    return false;
  const choices = value.actions.map((action) => action.id);
  const row = (profile: unknown): profile is StrategyProfile =>
    record(profile) &&
    keys(profile, [
      "actions",
      "payoffs",
      "totalPayoff",
      "reachableFacilities",
    ]) &&
    strings(profile.actions, 2, 2) &&
    profile.actions.every((action) => choices.includes(action)) &&
    Array.isArray(profile.payoffs) &&
    profile.payoffs.length === 2 &&
    profile.payoffs.every(finite) &&
    finite(profile.totalPayoff) &&
    Math.abs(profile.payoffs[0] + profile.payoffs[1] - profile.totalPayoff) <
      1e-8 &&
    strings(profile.reachableFacilities, 0, 100);
  if (
    !Array.isArray(value.payoffTable) ||
    !value.payoffTable.length ||
    value.payoffTable.length > 400 ||
    !value.payoffTable.every(row)
  )
    return false;
  const rows = value.payoffTable;
  const sameProfile = (a: StrategyProfile, b: StrategyProfile) =>
    a.totalPayoff === b.totalPayoff &&
    JSON.stringify(a.actions) === JSON.stringify(b.actions) &&
    JSON.stringify(a.payoffs) === JSON.stringify(b.payoffs) &&
    JSON.stringify(a.reachableFacilities) ===
      JSON.stringify(b.reachableFacilities);
  return (
    new Set(rows.map((profile) => JSON.stringify(profile.actions))).size ===
      rows.length &&
    [value.independentEquilibria, value.coordinatedOptima].every(
      (profiles) =>
        Array.isArray(profiles) &&
        profiles.length <= rows.length &&
        profiles.every(
          (profile) =>
            row(profile) &&
            rows.some((candidate) => sameProfile(candidate, profile)),
        ),
    )
  );
}

export async function fetchNetworkStrategy(
  catalog: NetworkCatalog,
  options: ServiceOptions = {},
): Promise<NetworkStrategyResult> {
  try {
    const { data, meta } = await requestEnvelope(
      `/api/v1/network/strategy?regionId=${encodeURIComponent(catalog.regionId)}`,
      isStrategy,
      {},
      options,
    );
    if (
      data.graphSource !== catalog.graphSource ||
      !meta.sourceIds.includes(catalog.graphSource) ||
      !data.disabledEdgeIds.every((id) => catalog.edgeIds.includes(id)) ||
      !data.actions.every(
        (action) => action.id === "pass" || catalog.edgeIds.includes(action.id),
      ) ||
      !data.agencies.every((agency) =>
        Object.keys(agency.facilityUtilities).every((id) =>
          catalog.nodeIds.includes(id),
        ),
      ) ||
      !data.payoffTable.every((profile) =>
        profile.reachableFacilities.every((id) => catalog.nodeIds.includes(id)),
      )
    )
      throw new ServiceError(
        "invalid_response",
        "Strategy assets or source differ from the selected catalog.",
      );
    return {
      status: "available",
      strategy: data,
      message: "Fixed two-agency teaching example",
    };
  } catch (error) {
    if (error instanceof ServiceError && error.code === "cancelled")
      throw error;
    return {
      status: "unavailable",
      strategy: null,
      message:
        "The backend strategy example is unavailable; no payoffs are invented locally.",
    };
  }
}

export async function compareNetwork(
  request: NetworkCompareRequest,
  catalog: NetworkCatalog,
  options: ServiceOptions = {},
): Promise<NetworkComparisonResult> {
  validateNetworkRequest(request, catalog);
  try {
    const { data, meta } = await requestEnvelope(
      "/api/v1/network/compare",
      isComparison,
      jsonPost(request),
      options,
    );
    if (
      data.graphSource !== catalog.graphSource ||
      !meta.sourceIds.includes(catalog.graphSource)
    ) {
      throw new ServiceError(
        "invalid_response",
        "The comparison belongs to a different graph source; refresh the catalog.",
      );
    }
    return {
      status: "available",
      comparison: data,
      message: "Backend comparison · hypothetical connectivity only",
    };
  } catch (error) {
    if (
      error instanceof ServiceError &&
      ["cancelled", "unsupported"].includes(error.code)
    )
      throw error;
    return {
      status: "unavailable",
      comparison: null,
      message:
        "Backend comparison unavailable or graph source changed · local fixture remains separate",
    };
  }
}
