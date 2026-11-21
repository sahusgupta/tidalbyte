import type { AllocationStrategy } from "@earthlab/contracts";
import type { Point } from "../../atlas/domain";
import type { PlanRun } from "./service";

export interface PlanningAsset {
  id: string;
  name: string;
  points: Point[];
  kind: "road" | "facility" | "junction";
  caption: string;
  color: string;
  dashed: boolean;
  selected: boolean;
}

export function planningAssets(
  run: PlanRun,
  strategy: AllocationStrategy,
  hour: number,
): PlanningAsset[] {
  const frame =
    strategy.frames.filter((f) => f.hour <= hour).at(-1) ?? strategy.frames[0];
  return run.geometry.features.flatMap((feature): PlanningAsset[] => {
    const { geometry, properties } = feature;
    const id = String(properties?.edgeId ?? properties?.nodeId ?? feature.id);
    const name = String(properties?.name ?? id.replaceAll("-", " "));
    if (geometry.type === "Point") {
      const facility = properties?.role === "facility";
      const access =
        id === "clinic" || id === "shelter"
          ? Math.round(100 * frame.access[id])
          : null;
      return [
        {
          id,
          name,
          points: [geometry.coordinates as Point],
          kind: facility ? "facility" : "junction",
          caption:
            facility && access !== null
              ? access + "% modeled access"
              : "Schematic network point",
          color: facility ? "#dcead1" : "#d1cbb9",
          dashed: false,
          selected: false,
        },
      ];
    }
    if (geometry.type !== "LineString") return [];
    const action = strategy.interventions.find((i) => i.assetId === id);
    const candidate = run.result.candidates.find((c) =>
      action ? c.actionId === action.actionId : c.assetId === id,
    );
    const selected = Boolean(
      action && candidate && candidate.hours <= hour && hour > 0,
    );
    const status = candidate?.status ?? "unknown";
    const services = (["clinic", "shelter"] as const).filter((name) =>
      frame.serviceEdges[name].includes(id),
    );
    const caption =
      (selected ? "Modeled action complete" : "Assumed " + status) +
      (services.length ? " · " + services.join(" and ") + " access path" : "");
    return [
      {
        id,
        name,
        points: geometry.coordinates as Point[],
        kind: "road",
        caption,
        color: selected
          ? "#cdecc4"
          : services.length
            ? "#a5d2cf"
            : status === "blocked"
              ? "#e7a48d"
              : status === "impaired"
                ? "#e6c58a"
                : "#c1c6c0",
        dashed: !selected && (status === "blocked" || status === "impaired"),
        selected,
      },
    ];
  });
}
