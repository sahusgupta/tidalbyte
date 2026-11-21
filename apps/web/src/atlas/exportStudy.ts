import type { Feature, FeatureCollection, Geometry } from "geojson";
import {
  GEOMETRY_ASSUMPTIONS,
  HOUSTON_ROADS,
  ROAD_PROVENANCE,
  getFloodPolygon,
  type AtlasSnapshot,
} from "./domain";

export function studyGeoJSON(study: AtlasSnapshot) {
  const hurricane = study.mode === "hurricane";
  const sketch: Feature<Geometry> = {
    type: "Feature",
    properties: {
      name: hurricane ? "Hypothetical storm track" : "Illustrative flood footprint",
      source: "User-authored scenario",
      mode: study.mode,
    },
    geometry: hurricane
      ? { type: "LineString", coordinates: study.track }
      : {
          type: "Polygon",
          coordinates: [getFloodPolygon(study.floodCenter, study.floodRadiusKm, study.progress)],
        },
  };
  const roads: Feature<Geometry>[] = HOUSTON_ROADS.map((road) => ({
    type: "Feature",
    id: road.id,
    properties: {
      name: road.name,
      source: road.sourceId,
      assumedClosed: study.closedRoadIds.includes(road.id),
      actualCondition: "unknown",
    },
    geometry: { type: "LineString", coordinates: road.points },
  }));
  return {
    type: "FeatureCollection",
    name: "Houston scenario study",
    mode: "illustrative",
    assumptions: study.assumptions,
    scenarioHours: study.progress * study.assumptions.durationHours,
    snapshot: study,
    geometryNotes: GEOMETRY_ASSUMPTIONS,
    roadSource: ROAD_PROVENANCE,
    features: [sketch, ...roads],
  } satisfies FeatureCollection & Record<string, unknown>;
}

export function downloadStudy(study: AtlasSnapshot) {
  const file = new Blob([JSON.stringify(studyGeoJSON(study), null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `houston-${study.mode}-study.geojson`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
