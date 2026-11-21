import type { Point } from "../../atlas/domain";
import type { PlanningAsset } from "./map";
export function FlatPlanningLayer({
  assets,
  select,
  x,
  y,
  scale,
}: {
  assets: PlanningAsset[];
  select: (id: string) => void;
  x: (p: Point) => number;
  y: (p: Point) => number;
  scale: number;
}) {
  return (
    <g aria-label="Illustrative allocation network">
      {[...assets]
        .sort((a, b) => Number(a.kind !== "road") - Number(b.kind !== "road"))
        .map((asset) => {
          const road = asset.kind === "road",
            points = asset.points.map((p) => x(p) + "," + y(p)).join(" ");
          const middle = asset.points[0];
          const last = asset.points.at(-1)!;
          return (
            <g
              key={asset.id}
              role="button"
              tabIndex={0}
              aria-label={asset.name + ". " + asset.caption}
              style={{ cursor: "pointer" }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                select(asset.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(asset.id);
                }
              }}
            >
              <title>
                {asset.name} · {asset.caption}
              </title>
              {road ? (
                <>
                  <polyline
                    points={points}
                    stroke="#19271c"
                    strokeWidth="7"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    points={points}
                    stroke={asset.color}
                    strokeWidth={asset.selected ? 4.5 : 2.7}
                    fill="none"
                    strokeDasharray={asset.dashed ? "7 5" : undefined}
                    vectorEffect="non-scaling-stroke"
                  />
                  <polyline
                    points={points}
                    stroke="transparent"
                    strokeWidth="18"
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                  />
                  {asset.selected && (
                    <circle
                      cx={(x(middle) + x(last)) / 2}
                      cy={(y(middle) + y(last)) / 2}
                      r={5 / scale}
                      fill={asset.color}
                      stroke="#263c27"
                      strokeWidth={2 / scale}
                    />
                  )}
                </>
              ) : (
                <>
                  <circle
                    cx={x(middle)}
                    cy={y(middle)}
                    r={(asset.kind === "facility" ? 6 : 3) / scale}
                    fill={asset.color}
                    stroke="#203322"
                    strokeWidth={2 / scale}
                  />
                  {asset.kind === "facility" && (
                    <text x={x(middle) + 10 / scale} y={y(middle) - 8 / scale}>
                      {asset.name}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
    </g>
  );
}
