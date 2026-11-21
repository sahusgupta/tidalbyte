import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { HOUSTON_ROADS, clamp, deriveAtlas, type AtlasSnapshot, type Point } from "../atlas/domain";
import { timeLabel } from "./FieldTools";
import aerialManifest from "../../public/map/provenance.json";
import "./comparison-map.css";

const WIDTH = 1000;
type Bounds = readonly [number, number, number, number];
const archives = aerialManifest.assets.map(({ file, bboxWgs84 }) => {
  const [west, south, east, north] = bboxWgs84;
  return { file, url: `/map/${file}`, bounds: [west, south, east, north] as const };
});

function projection(points: Point[], aspect: number, unitsPerPixel: number) {
  const height = WIDTH / aspect;
  const west = Math.min(...points.map(([longitude]) => longitude));
  const east = Math.max(...points.map(([longitude]) => longitude));
  const south = Math.min(...points.map(([, latitude]) => latitude));
  const north = Math.max(...points.map(([, latitude]) => latitude));
  const center: Point = [(west + east) / 2, (south + north) / 2];
  const longitudeScale = Math.cos((center[1] * Math.PI) / 180);
  let spanX = Math.max(east - west, 0.08) * 1.16;
  let spanY = Math.max(north - south, 0.06) * 1.16;
  // Keep local distances proportional while fitting both scenarios in one shared frame.
  if ((spanX * longitudeScale) / spanY < aspect) spanX = (spanY * aspect) / longitudeScale;
  else spanY = (spanX * longitudeScale) / aspect;
  const x = (longitude: number) => ((longitude - center[0]) / spanX + 0.5) * WIDTH;
  const y = (latitude: number) => (0.5 - (latitude - center[1]) / spanY) * height;
  return {
    height,
    unitsPerPixel,
    point: ([longitude, latitude]: Point) => `${x(longitude)},${y(latitude)}`,
    image: ([w, s, e, n]: Bounds) => ({
      x: x(w),
      y: y(n),
      width: x(e) - x(w),
      height: y(s) - y(n),
    }),
    scaleKm: (10 / (111.32 * longitudeScale * spanX)) * WIDTH,
  };
}

type Projection = ReturnType<typeof projection>;
function ScenarioOverlay({
  snapshot,
  project,
  side,
}: {
  snapshot: AtlasSnapshot;
  project: Projection;
  side: "baseline" | "edited";
}) {
  const derived = deriveAtlas(snapshot);
  const center = snapshot.mode === "hurricane" ? derived.stormPosition : snapshot.floodCenter;
  const [cx, cy] = project.point(center).split(",");
  return (
    <g data-comparison-side={side}>
      <polygon
        className={`comparison-footprint ${snapshot.mode}`}
        points={derived.footprint.map(project.point).join(" ")}
      />
      <g className="comparison-roads">
        {HOUSTON_ROADS.map((road) => {
          const closed = snapshot.closedRoadIds.includes(road.id);
          const disconnected = derived.network.disconnectedRoadIds.includes(road.id);
          const status = closed ? "closed" : disconnected ? "disconnected" : "open";
          return (
            <polyline
              key={road.id}
              data-road-id={road.id}
              data-road-state={status}
              className={`comparison-road ${status}`}
              points={road.points.map(project.point).join(" ")}
            />
          );
        })}
      </g>
      {snapshot.mode === "hurricane" && (
        <g className="comparison-track">
          <polyline points={snapshot.track.map(project.point).join(" ")} />
          {snapshot.track.map((point, index) => {
            const [x, y] = project.point(point).split(",");
            return <circle key={index} cx={x} cy={y} r={3 * project.unitsPerPixel} />;
          })}
        </g>
      )}
      <circle className="comparison-center" cx={cx} cy={cy} r={5 * project.unitsPerPixel} />
    </g>
  );
}

/** One geographic frame; the caller supplies baseline geometry at the edited scenario clock. */
export function ScenarioComparisonMap({
  baseline,
  edited,
}: {
  baseline: AtlasSnapshot;
  edited: AtlasSnapshot;
}) {
  const id = useId().replace(/:/g, "");
  const frame = useRef<HTMLDivElement>(null);
  const slider = useRef<HTMLInputElement>(null);
  const [split, setSplit] = useState(50);
  const [aspect, setAspect] = useState(1.6);
  const [unitsPerPixel, setUnitsPerPixel] = useState(1);
  const [failedArchives, setFailedArchives] = useState<string[]>([]);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setAspect(width / height);
        setUnitsPerPixel(WIDTH / width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const base = deriveAtlas(baseline);
  const current = deriveAtlas(edited);
  const points = [
    ...HOUSTON_ROADS.flatMap((road) => road.points),
    ...base.footprint,
    ...current.footprint,
    ...(edited.mode === "hurricane" ? [...baseline.track, ...edited.track] : []),
  ];
  const project = projection(points, aspect, unitsPerPixel);
  const baselineClip = `${id}-baseline`;
  const editedClip = `${id}-edited`;
  const time = timeLabel(edited.progress * edited.assumptions.durationHours);
  const moveDivider = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setSplit(clamp(Math.round(((event.clientX - bounds.left) / bounds.width) * 100), 0, 100));
  };
  const summary = `${split}% baseline, ${100 - split}% edited`;

  return (
    <figure className="scenario-comparison-map" aria-label="Baseline and edited scenario map">
      <div className="comparison-map-instruction">
        <p id={`${id}-help`}>Drag the divider or use arrow keys.</p>
        <span>T+{time}</span>
      </div>
      <div
        ref={frame}
        className="comparison-map-frame"
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          slider.current?.focus({ preventScroll: true });
          event.currentTarget.setPointerCapture(event.pointerId);
          moveDivider(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) moveDivider(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${project.height}`}
          role="img"
          aria-labelledby={`${id}-title ${id}-description`}
        >
          <title id={`${id}-title`}>Baseline and edited Houston scenario swipe map</title>
          <desc id={`${id}-description`}>
            Shared archival aerial, north up. Baseline on the left; edited geometry and assumed
            closures on the right, both at T+{time}. Use the divider to reveal either side. Roads
            are an authored schematic, not surveyed streets. No flood depth or road safety is
            inferred.
          </desc>
          <defs>
            <clipPath id={baselineClip}>
              <rect width={(split / 100) * WIDTH} height={project.height} />
            </clipPath>
            <clipPath id={editedClip}>
              <rect
                x={(split / 100) * WIDTH}
                width={((100 - split) / 100) * WIDTH}
                height={project.height}
              />
            </clipPath>
          </defs>
          <rect className="comparison-map-ground" width={WIDTH} height={project.height} />
          {archives
            .filter(({ file }) => !failedArchives.includes(file))
            .map((archive) => (
              <image
                key={archive.file}
                href={archive.url}
                {...project.image(archive.bounds)}
                preserveAspectRatio="none"
                onError={() =>
                  setFailedArchives((failed) => [...new Set([...failed, archive.file])])
                }
              />
            ))}
          <rect className="comparison-map-wash" width={WIDTH} height={project.height} />
          <g clipPath={`url(#${baselineClip})`}>
            <ScenarioOverlay snapshot={baseline} project={project} side="baseline" />
          </g>
          <g clipPath={`url(#${editedClip})`}>
            <ScenarioOverlay snapshot={edited} project={project} side="edited" />
          </g>
          <g
            className="comparison-map-scale"
            transform={`translate(${14 * unitsPerPixel} ${project.height - 16 * unitsPerPixel})`}
          >
            <path
              d={`M0 ${-6 * unitsPerPixel}v${6 * unitsPerPixel}h${project.scaleKm}v${-6 * unitsPerPixel}`}
            />
            <text x="0" y={-12 * unitsPerPixel} style={{ fontSize: 12 * unitsPerPixel }}>
              10 km
            </text>
          </g>
        </svg>
        <div className="comparison-map-sides" aria-hidden="true">
          <span>Baseline</span>
          <span>Edited</span>
        </div>
        <span className="comparison-map-north" aria-hidden="true">
          ↑ N
        </span>
        <span className="comparison-map-divider" style={{ left: `${split}%` }} aria-hidden="true">
          <span>↔</span>
        </span>
        <input
          ref={slider}
          id={`${id}-slider`}
          className="comparison-map-slider"
          style={{ left: `${split}%` }}
          type="range"
          min="0"
          max="100"
          step="1"
          value={split}
          aria-label="Baseline and edited map divider"
          aria-valuetext={summary}
          aria-describedby={`${id}-help ${id}-scope`}
          onChange={(event) => setSplit(Number(event.target.value))}
        />
        {failedArchives.length > 0 && (
          <span className="comparison-map-fallback" role="status">
            {failedArchives.length === archives.length
              ? "Archival aerial unavailable"
              : "Some archival imagery unavailable"}
            ; geometry remains geographically aligned.
          </span>
        )}
      </div>
      <figcaption>
        <div className="comparison-map-credit">
          <span id={`${id}-scope`}>Illustrative scenarios</span>
          <a href={aerialManifest.serviceUrl} target="_blank" rel="noreferrer">
            USDA / USGS aerial
          </a>
        </div>
        <details className="comparison-map-disclosure">
          <summary>Legend &amp; sources</summary>
          <ul className="comparison-map-key" aria-label="Map legend">
            <li>
              <i className={`key-geometry ${edited.mode}`} />
              {edited.mode === "hurricane"
                ? "Hypothetical track & 6 km footprint"
                : "Illustrative flood footprint"}
            </li>
            <li>
              <i className="key-road" />
              Open schematic link
            </li>
            <li>
              <i className="key-closure" />
              Assumed closure
            </li>
            <li>
              <i className="key-disconnected" />
              Disconnected open link
            </li>
          </ul>
          <p>
            Seeded geometry and open sample roads versus your edits and
            {` ${edited.closedRoadIds.length} assumed ${edited.closedRoadIds.length === 1 ? "closure" : "closures"}`}
            . Same scenario clock; road flood exposure is unknown.
          </p>
          <p>{aerialManifest.sourcePeriod}. Same imagery on both sides, not observed change.</p>
        </details>
      </figcaption>
    </figure>
  );
}
