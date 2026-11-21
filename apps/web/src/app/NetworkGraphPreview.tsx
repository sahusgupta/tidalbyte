import { useState } from "react";
import type { Feature, Geometry } from "geojson";
import type { NetworkCatalog, NetworkPreview } from "../services/network";

function lines(feature: Feature<Geometry>): number[][][] {
  const geometry = feature.geometry;
  return geometry.type === "LineString"
    ? [geometry.coordinates]
    : geometry.type === "MultiLineString"
      ? geometry.coordinates
      : [];
}
export function NetworkGraphPreview({
  catalog,
  preview,
}: {
  catalog: NetworkCatalog;
  preview: NetworkPreview;
}) {
  const [side, setSide] = useState<"baseline" | "proposal">("proposal");
  const points = preview.geojson.features.flatMap((feature) =>
    feature.geometry.type === "Point"
      ? [feature.geometry.coordinates]
      : lines(feature).flat(),
  );
  const west = Math.min(...points.map((point) => point[0])),
    east = Math.max(...points.map((point) => point[0]));
  const south = Math.min(...points.map((point) => point[1])),
    north = Math.max(...points.map((point) => point[1]));
  const cosine = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const scale = Math.min(
    380 / Math.max((east - west) * cosine, 0.001),
    180 / Math.max(north - south, 0.001),
  );
  const x = (point: number[]) =>
    250 + (point[0] - (west + east) / 2) * cosine * scale;
  const y = (point: number[]) => 130 - (point[1] - (north + south) / 2) * scale;
  const name = (id: string) =>
    [...catalog.nodes, ...catalog.edges].find((item) => item.id === id)?.name ??
    id;
  return (
    <div className="network-preview">
      <div
        className="network-tabs"
        role="group"
        aria-label="Connection preview case"
      >
        {(["baseline", "proposal"] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={side === value}
            onClick={() => setSide(value)}
          >
            {value === "baseline" ? "Baseline" : "Proposal"}
          </button>
        ))}
      </div>
      <svg
        viewBox="0 0 500 260"
        role="img"
        aria-label={`Fictional backend network, ${side}. Dashed links are removed; node positions use the catalog's schematic WGS84 geometry.`}
      >
        {preview.geojson.features.flatMap((feature) =>
          lines(feature).map((line, index) => (
            <polyline
              key={`${feature.id}-${index}`}
              className={
                feature.properties?.[`${side}Active`]
                  ? "network-link active"
                  : "network-link removed"
              }
              points={line.map((point) => `${x(point)},${y(point)}`).join(" ")}
            >
              <title>
                {name(String(feature.id))} ·{" "}
                {feature.properties?.[`${side}Active`] ? "active" : "removed"}
                {feature.properties?.[`${side}Bridge`]
                  ? " · graph cut edge"
                  : ""}
              </title>
            </polyline>
          )),
        )}
        {preview.geojson.features
          .filter((feature) => feature.geometry.type === "Point")
          .map((feature) => {
            if (feature.geometry.type !== "Point") return null;
            const point = feature.geometry.coordinates;
            return (
              <g
                key={feature.id}
                className={
                  feature.properties?.[`${side}Active`]
                    ? "network-node active"
                    : "network-node removed"
                }
              >
                <circle
                  cx={x(point)}
                  cy={y(point)}
                  r={feature.properties?.role === "facility" ? 7 : 5}
                >
                  <title>
                    {name(String(feature.id))} ·{" "}
                    {feature.properties?.[`${side}Active`]
                      ? "active"
                      : "removed"}
                  </title>
                </circle>
                <text x={x(point)} y={y(point) - 14} textAnchor="middle">
                  {name(String(feature.id)).slice(0, 25)}
                </text>
              </g>
            );
          })}
      </svg>
      <p className="network-small">
        Solid: active · dashed: removed. Fictional schematic positions; no
        road-condition or navigation claim.
      </p>
      <details className="network-disclosure">
        <summary>Access paths &amp; fictional costs</summary>
        {Object.entries(preview.paths[side]).length ? (
          <ul>
            {Object.entries(preview.paths[side]).map(([facility, path]) => (
              <li key={facility}>
                <strong>{name(facility)}</strong>:{" "}
                {path.edgeIds.map(name).join(" → ") || "At the origin"} ·{" "}
                {path.travelCost} fictional travel-cost units
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No facilities reachable from the fixture staging point in this case.
          </p>
        )}
      </details>
    </div>
  );
}
