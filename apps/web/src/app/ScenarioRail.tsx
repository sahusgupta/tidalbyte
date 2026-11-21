import { useState } from "react";
import { useAtlasStore } from "./store";
import { Dial, LayerToggle } from "./FieldTools";
import { Icon } from "./Icon";
import { type Point } from "../atlas/domain";

export interface Layers {
  hazard: boolean;
  roads: boolean;
  outages: boolean;
}
export function ScenarioRail({
  layers,
  onLayer,
  inspectMode,
}: {
  layers: Layers;
  onLayer: (id: keyof Layers, value: boolean) => void;
  inspectMode: () => void;
}) {
  const state = useAtlasStore();
  const hurricane = state.mode === "hurricane";
  const [pointIndex, setPointIndex] = useState(0);
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
    onLayer("hazard", true);
    inspectMode();
  }
  return (
    <aside className="scenario-rail" aria-label="Scenario editor">
      <div className="rail-title">
        <Icon name="layers" />
        <span>Scenario editor</span>
      </div>
      <div className="mode-pair" role="group" aria-label="Scenario type">
        <button
          aria-pressed={hurricane}
          onClick={() => chooseMode("hurricane")}
        >
          <Icon name="hurricane" size={25} />
          Hurricane
        </button>
        <button aria-pressed={!hurricane} onClick={() => chooseMode("flood")}>
          <Icon name="flood" size={25} />
          Flood
        </button>
      </div>
      <div className="scenario-name">
        <div className="kicker">Training scenario</div>
        <h2>{hurricane ? "Gulf approach" : "Bayou footprint"}</h2>
        <p>
          {hurricane
            ? "Chart a hypothetical storm through Greater Houston."
            : "Explore how a drawn footprint intersects the road sample."}
        </p>
      </div>
      <section className="rail-section assumptions">
        <h3>Scenario assumptions</h3>
        {hurricane ? (
          <Dial
            label="Intensity class"
            unit="/ 5"
            value={state.assumptions.intensity}
            min={1}
            max={5}
            onChange={(v) => state.setAssumption("intensity", v)}
          />
        ) : (
          <Dial
            label="Final radius"
            unit="km"
            value={state.floodRadiusKm}
            min={0.5}
            max={15}
            step={0.25}
            onChange={(v) => state.setFlood(state.floodCenter, v)}
          />
        )}
        <Dial
          label="Rainfall"
          unit="mm"
          value={state.assumptions.rainfallMm}
          min={0}
          max={300}
          step={5}
          onChange={(v) => state.setAssumption("rainfallMm", v)}
        />
        <Dial
          label="Duration"
          unit="h"
          value={state.assumptions.durationHours}
          min={1}
          max={48}
          onChange={(v) => state.setAssumption("durationHours", v)}
        />
        <p className="hint">
          Rainfall
          {hurricane
            ? " and intensity are scenario notes."
            : " is a scenario note."}{" "}
          Duration sets the timeline.
        </p>
      </section>
      <section className="rail-section">
        <h3>Map layers</h3>
        <LayerToggle
          label={hurricane ? "Storm track & radius" : "Flood footprint"}
          styleName="hazard"
          value={layers.hazard}
          set={(v) => onLayer("hazard", v)}
        />
        <LayerToggle
          label="Sample road network"
          styleName="road"
          value={layers.roads}
          set={(v) => onLayer("roads", v)}
        />
        <LayerToggle
          label="County severity"
          styleName="county"
          value={layers.outages}
          set={(v) => onLayer("outages", v)}
        />
      </section>
      <details className="rail-section geometry">
        <summary>
          <Icon name="edit" size={15} />
          Coordinate editor
          <Icon name="down" size={13} />
        </summary>
        <p className="hint">Nudge a handle by 0.01° using the arrow buttons.</p>
        {hurricane && (
          <label>
            Waypoint
            <select
              value={idx}
              onChange={(e) => setPointIndex(Number(e.target.value))}
            >
              {state.track.map((_, i) => (
                <option value={i} key={i}>
                  Waypoint {i + 1}
                </option>
              ))}
            </select>
          </label>
        )}
        <output className="position-readout" aria-label="Handle coordinates">
          {position[1].toFixed(3)}° N · {Math.abs(position[0]).toFixed(3)}° W
        </output>
        <div className="nudge">
          {[
            ["West", -0.01, 0],
            ["East", 0.01, 0],
            ["North", 0, 0.01],
            ["South", 0, -0.01],
          ].map(([name, x, y]) => (
            <button key={name} onClick={() => nudge(Number(x), Number(y))}>
              {name}
            </button>
          ))}
        </div>
        {hurricane && (
          <div className="row-buttons">
            <button
              disabled={state.track.length >= 8}
              onClick={() => {
                const p = state.track.at(-1)!;
                state.setTrack([...state.track, [p[0] - 0.02, p[1] + 0.02]]);
                setPointIndex(state.track.length);
              }}
            >
              Add point
            </button>
            <button
              disabled={state.track.length <= 2}
              onClick={() =>
                state.setTrack(state.track.filter((_, i) => i !== idx))
              }
            >
              Remove point
            </button>
          </div>
        )}
      </details>
      <div className="rail-actions">
        <button onClick={() => state.undo()} disabled={!state.history.length}>
          <Icon name="undo" size={14} />
          Undo edit
        </button>
        <button
          onClick={() => {
            state.reset();
            setPointIndex(0);
            inspectMode();
            onLayer("hazard", true);
            onLayer("roads", true);
            onLayer("outages", false);
          }}
        >
          <Icon name="reset" size={14} />
          Reset demo
        </button>
      </div>
    </aside>
  );
}
