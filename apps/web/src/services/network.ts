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

function catalogFrom(geojson: FeatureCollection, sourceIds: string[]): NetworkCatalog {
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
      kind === "Point" ? (properties.nodeId ?? feature.id) : (properties.edgeId ?? feature.id);
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
      name: typeof properties.name === "string" ? properties.name.slice(0, 200) : String(itemId),
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
    if (error instanceof ServiceError && error.code === "cancelled") throw error;
    return {
      status: "unavailable",
      catalog: null,
      message: "Backend graph unavailable · use the separately labeled local illustrative network",
    };
  }
}

function metrics(value: unknown): value is ConnectivityMetrics {
  return (
    record(value) &&
    keys(value, ["reachableFacilities", "connectedComponents", "weightedAccessScore"]) &&
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
    keys(value, ["baseline", "proposal", "limitations", "graphSource", "mode"]) &&
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
    !keys(request, ["regionId", "disabledNodeIds", "disabledEdgeIds", "interventions"]) ||
    request.regionId !== catalog.regionId ||
    !validIds(request.disabledNodeIds, catalog.nodeIds, 100) ||
    !validIds(request.disabledEdgeIds, catalog.edgeIds, 100) ||
    !Array.isArray(request.interventions) ||
    request.interventions.length > 3 ||
    request.interventions.some(
      (intervention) =>
        !record(intervention) ||
        !keys(intervention, ["id", "graphEdgeIds", "graphNodeIds", "action"], ["budgetUnits"]) ||
        !text(intervention.id) ||
        !["protect", "disable", "inspect"].includes(intervention.action) ||
        !validIds(intervention.graphEdgeIds, catalog.edgeIds, 3) ||
        !validIds(intervention.graphNodeIds, catalog.nodeIds, 3) ||
        intervention.graphEdgeIds.length + intervention.graphNodeIds.length > 3 ||
        (intervention.budgetUnits !== undefined &&
          (!finite(intervention.budgetUnits) || intervention.budgetUnits < 0)),
    )
  ) {
    throw new ServiceError(
      "unsupported",
      "Select only IDs advertised by this backend graph. Local fixture IDs cannot be sent to the live comparison.",
    );
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
    if (data.graphSource !== catalog.graphSource || !meta.sourceIds.includes(catalog.graphSource)) {
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
    if (error instanceof ServiceError && ["cancelled", "unsupported"].includes(error.code))
      throw error;
    return {
      status: "unavailable",
      comparison: null,
      message:
        "Backend comparison unavailable or graph source changed · local fixture remains separate",
    };
  }
}
