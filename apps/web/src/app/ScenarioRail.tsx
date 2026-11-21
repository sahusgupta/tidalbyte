import { useId, useRef, useState } from "react";
import { useAtlasStore } from "./store";
import { Dial, timeLabel } from "./FieldTools";
import { Icon } from "./Icon";
import {
  ASSUMPTION_LIMITS,
  FLOOD_RADIUS_LIMITS,
  TRACK_POINT_LIMITS,
  getFloodPolygon,
  getFloodRadiusAtProgress,
  getStormPosition,
  type Point,
} from "../atlas/domain";
import "../styles/notebook.css";

export interface Layers {
  hazard: boolean;
  roads: boolean;
  outages: boolean;
}

/** The plate projects the editor's own geometry; it is not a forecast graphic. */
function ScenarioPlate({
  track,
  center,
  radius,
  progress,
  duration,
  hurricane,
}: {
  track: Point[];
  center: Point;
  radius: number;
  progress: number;
  duration: number;
  hurricane: boolean;
}) {
  const currentRadius = getFloodRadiusAtProgress(radius, progress);
  const shape = hurricane ? track : getFloodPolygon(center, radius);
  const xs = shape.map((point) => point[0]);
  const ys = shape.map((point) => point[1]);
  const mid: Point = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ];
  const longitudeFactor = Math.cos((mid[1] * Math.PI) / 180);
  const scale = Math.min(
    208 / Math.max((Math.max(...xs) - Math.min(...xs)) * longitudeFactor, 0.001),
    72 / Math.max(Math.max(...ys) - Math.min(...ys), 0.001),
  );
  const project = (point: Point) => [
    132 + (point[0] - mid[0]) * longitudeFactor * scale,
    60 - (point[1] - mid[1]) * scale,
  ];
  const line = (points: Point[]) => points.map((point) => project(point).join(",")).join(" ");
  const marker = project(hurricane ? getStormPosition(track, progress) : center);
  const first = project(track[0]);
  const last = project(track[track.length - 1]);
  return (
    <figure className="scenario-plate">
      <svg
        viewBox="0 0 264 128"
        role="img"
        aria-label={
          hurricane
            ? "Authored storm trajectory, start and end, with the selected timeline position"
            : "Illustrative circular footprint at the selected timeline position"
        }
      >
        {hurricane ? (
          <>
            <polyline
              points={line(track)}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {track.map((point, index) => {
              const [x, y] = project(point);
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="var(--paper)"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              );
            })}
            <text
              x={first[0]}
              y={Math.min(121, first[1] + 20)}
              textAnchor={first[0] > 132 ? "end" : "start"}
            >
              Start
            </text>
            <text
              x={last[0]}
              y={Math.max(12, last[1] - 12)}
              textAnchor={last[0] > 132 ? "end" : "start"}
            >
              End
            </text>
          </>
        ) : (
          <>
            <polygon
              points={line(shape)}
              fill="none"
              stroke="var(--rule)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <polygon
              points={line(getFloodPolygon(center, currentRadius))}
              fill="currentColor"
              fillOpacity=".07"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </>
        )}
        <circle
          cx={marker[0]}
          cy={marker[1]}
          r="6"
          fill="var(--paper)"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx={marker[0]} cy={marker[1]} r="2" fill="currentColor" />
      </svg>
      <figcaption>
        <span>
          {hurricane
            ? `${track.length} waypoints`
            : `${currentRadius.toFixed(1)} km illustrative radius`}
        </span>
        <time>T+{timeLabel(progress * duration)}</time>
      </figcaption>
    </figure>
  );
}

export function ScenarioRail({
  onLiveWeather,
  onEnsureHazard,
  onResetLayers,
  inspectMode,
  onEditMap,
}: {
  onLiveWeather: () => void;
  onEnsureHazard: () => void;
  onResetLayers: () => void;
  inspectMode: () => void;
  onEditMap: () => void;
}) {
  const state = useAtlasStore();
  const hurricane = state.mode === "hurricane";
  const [pointIndex, setPointIndex] = useState(0);
  const typeTitleId = useId();
  const coordinates = useRef<HTMLDetailsElement>(null);
  const idx = Math.min(pointIndex, state.track.length - 1);
  const position = hurricane ? state.track[idx] : state.floodCenter;
  function nudge(lon: number, lat: number) {
    const point = hurricane ? state.track[idx] : state.floodCenter;
    const next: Point = [point[0] + lon, point[1] + lat];
    if (hurricane) state.moveTrackPoint(idx, next);
    else state.setFlood(next, state.floodRadiusKm);
  }
  function chooseMode(mode: "flood" | "hurricane") {
    state.setMode(mode);
    onEnsureHazard();
    inspectMode();
  }
  return (
    <aside className="notebook-page scenario-page" aria-label="Scenario editor">
      <header className="notebook-heading">
        <h2>{hurricane ? "Gulf approach" : "Bayou footprint"}</h2>
        <p>
          {hurricane
            ? "Draw a hypothetical storm path through Greater Houston."
            : "Draw a flood area to see which sample roads it crosses."}
        </p>
      </header>
      <div className="scenario-fields">
        <section className="scenario-geometry" aria-labelledby={typeTitleId}>
          <h3 id={typeTitleId}>Scenario type</h3>
          <div className="scenario-choice" role="group" aria-label="Scenario type">
            <button type="button" aria-pressed={hurricane} onClick={() => chooseMode("hurricane")}>
              Hurricane
            </button>
            <button type="button" aria-pressed={!hurricane} onClick={() => chooseMode("flood")}>
              Flood
            </button>
            <button type="button" onClick={onLiveWeather}>
              Live weather
            </button>
          </div>
          <ScenarioPlate
            track={state.track}
            center={state.floodCenter}
            radius={state.floodRadiusKm}
            progress={state.progress}
            duration={state.assumptions.durationHours}
            hurricane={hurricane}
          />
          <button
            type="button"
            className="notebook-primary"
            onClick={() => {
              onEnsureHazard();
              onEditMap();
            }}
          >
            <Icon name="edit" size={16} />
            {hurricane ? "Edit track on map" : "Edit footprint on map"}
          </button>
        </section>
        <section className="notebook-section assumptions">
          <h3>Scenario parameters</h3>
          {hurricane ? (
            <Dial
              label="Intensity class"
              unit="/ 5"
              value={state.assumptions.intensity}
              min={ASSUMPTION_LIMITS.intensity.min}
              max={ASSUMPTION_LIMITS.intensity.max}
              step={ASSUMPTION_LIMITS.intensity.step}
              onChange={(value) => state.setAssumption("intensity", value)}
            />
          ) : (
            <Dial
              label="Final radius"
              unit="km"
              value={state.floodRadiusKm}
              min={FLOOD_RADIUS_LIMITS.min}
              max={FLOOD_RADIUS_LIMITS.max}
              step={0.25}
              onChange={(value) => state.setFlood(state.floodCenter, value)}
            />
          )}
          <Dial
            label="Rainfall"
            unit="mm"
            value={state.assumptions.rainfallMm}
            min={ASSUMPTION_LIMITS.rainfallMm.min}
            max={ASSUMPTION_LIMITS.rainfallMm.max}
            step={ASSUMPTION_LIMITS.rainfallMm.step}
            onChange={(value) => state.setAssumption("rainfallMm", value)}
          />
          <Dial
            label="Duration"
            unit="h"
            value={state.assumptions.durationHours}
            min={ASSUMPTION_LIMITS.durationHours.min}
            max={ASSUMPTION_LIMITS.durationHours.max}
            step={ASSUMPTION_LIMITS.durationHours.step}
            onChange={(value) => state.setAssumption("durationHours", value)}
          />
          <p className="notebook-note">
            {hurricane
              ? "Rainfall and intensity are scenario notes."
              : "Rainfall is a scenario note."}{" "}
            Duration sets the timeline.
          </p>
        </section>
      </div>
      <details ref={coordinates} className="notebook-section coordinate-editor">
        <summary>
          Coordinate editor
          <Icon name="down" size={16} />
        </summary>
        <p className="notebook-note">Nudge a handle by 0.01° with the arrow buttons.</p>
        {hurricane && (
          <label className="notebook-field">
            Waypoint
            <select value={idx} onChange={(event) => setPointIndex(Number(event.target.value))}>
              {state.track.map((_, index) => (
                <option value={index} key={index}>
                  Waypoint {index + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <output className="coordinate-readout" aria-label="Handle coordinates">
          {position[1].toFixed(3)}° N · {Math.abs(position[0]).toFixed(3)}° W
        </output>
        <div className="coordinate-nudge">
          {[
            ["West", -0.01, 0],
            ["East", 0.01, 0],
            ["North", 0, 0.01],
            ["South", 0, -0.01],
          ].map(([name, x, y]) => (
            <button type="button" key={name} onClick={() => nudge(Number(x), Number(y))}>
              {name}
            </button>
          ))}
        </div>
        {hurricane && (
          <div className="coordinate-actions">
            <button
              type="button"
              disabled={state.track.length >= TRACK_POINT_LIMITS.max}
              onClick={() => {
                const point = state.track.at(-1)!;
                state.setTrack([...state.track, [point[0] - 0.02, point[1] + 0.02]]);
                setPointIndex(state.track.length);
              }}
            >
              Add point
            </button>
            <button
              type="button"
              disabled={state.track.length <= TRACK_POINT_LIMITS.min}
              onClick={() => state.setTrack(state.track.filter((_, index) => index !== idx))}
            >
              Remove point
            </button>
          </div>
        )}
      </details>
      <details className="notebook-section notebook-disclosure scenario-method">
        <summary>
          Method & limitations
          <Icon name="down" size={16} />
        </summary>
        <p>
          {hurricane
            ? "The track is manually authored. Its marker follows the drawn path across the timeline, with a fixed 6 km inspection circle."
            : "The footprint is an illustrative circle. It grows from 35% to 100% of the final radius across the timeline."}
        </p>
        <p>
          Rainfall{hurricane ? " and intensity are annotations" : " is an annotation"}, not inputs
          to a weather or flood model. No flood depth, asset damage or road safety is inferred.
        </p>
        <p>
          County outage estimates use a separate supported warning preset. Editing this geometry
          does not change those results. Road intersections use the schematic sample network.
        </p>
      </details>
      <footer className="notebook-actions">
        <button type="button" onClick={() => state.undo()} disabled={!state.history.length}>
          <Icon name="undo" size={16} />
          Undo edit
        </button>
        <button
          type="button"
          onClick={() => {
            state.reset();
            if (coordinates.current) coordinates.current.open = false;
            setPointIndex(0);
            inspectMode();
            onResetLayers();
          }}
        >
          <Icon name="reset" size={16} />
          Reset demo
        </button>
      </footer>
    </aside>
  );
}
