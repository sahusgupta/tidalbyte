import type { Evaluation } from "@earthlab/contracts";
import { offlineCounties } from "@earthlab/contracts";
import {
  BASELINE,
  HOUSTON_ROADS,
  deriveAtlas,
  type Point,
} from "../atlas/domain";
import { useAtlasStore } from "./store";
import { Icon } from "./Icon";
import { RoadSketch, timeLabel } from "./FieldTools";

type Derived = ReturnType<typeof deriveAtlas>;
type Props = {
  current: Derived;
  onSources: () => void;
};
function coordinate(point: Point) {
  return `${point[1].toFixed(2)}° N, ${Math.abs(point[0]).toFixed(2)}° W`;
}
export function CountyEvidence({ evaluation, serviceStatus }: { evaluation: Evaluation; serviceStatus:string }) {
  const trained = evaluation.modelMetadata.dataMode === "trained_conditional";
  const metrics = evaluation.modelMetadata.evaluation;
  return (
    <section className="county-evidence">
      <h3>County outage severity</h3>
      <p className="county-status">{serviceStatus}</p>
      <p>
        {trained
          ? "Historical context · model estimate for selected positive-outage warning hours."
          : "Offline fixture indices · 0–3"}
      </p>
      <ul>
        {evaluation.predictions.map((p) => (
          <li key={p.countyFips}>
            <span>
              {offlineCounties.features.find((f) => f.id === p.countyFips)
                ?.properties.name ?? p.countyFips}
            </span>
            <strong>
              {p.predictedSeverity} {trained ? p.severityUnit : "/ 3"}
            </strong>
          </li>
        ))}
      </ul>
      <small>
        {trained
          ? `Model ${evaluation.modelMetadata.modelVersion} · ${evaluation.modelMetadata.trainingDatasetIds.join(", ")}`
          : "Fixed county examples. Scenario edits do not change these values."}
      </small>
      {trained && (
        <details className="model-evidence">
          <summary>Model evaluation & sources</summary>
          <p>
            {evaluation.modelMetadata.target} ·{" "}
            {evaluation.scenario.selection.eventTimeUtc}
          </p>
          {metrics && (
            <p>
              {metrics.splitPolicy} · {metrics.testEventCount} test events. Mean
              absolute error {metrics.modelMae} {metrics.targetUnit}.{" "}
              {metrics.baselineName} baseline {metrics.baselineMae}.
            </p>
          )}
          {evaluation.modelMetadata.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>
            {[
              ...new Set(evaluation.predictions.flatMap((p) => p.sourceIds)),
            ].join(", ")}
          </p>
        </details>
      )}
    </section>
  );
}
export function RoadInspector({ current, onSources }: Props) {
  const state = useAtlasStore();
  const road =
    HOUSTON_ROADS.find((r) => r.id === state.selectedRoadId) ??
    HOUSTON_ROADS[0];
  const closed = state.closedRoadIds.includes(road.id);
  const disconnected = current.network.disconnectedRoadIds.includes(road.id);
  const intersects = current.intersectedRoadIds.includes(road.id);
  return (
    <section className="notebook" aria-label="Road inspector">
      <div className="panel-caption">
        <Icon name="pin" size={15} />
        Road inspector
      </div>
      <div className="segment-id">{road.id}</div>
      <h2>{road.name}</h2>
      <RoadSketch points={road.points} closed={closed} />
      <label className="road-picker">
        Inspect segment
        <select
          value={road.id}
          onChange={(e) => state.selectRoad(e.target.value)}
        >
          {HOUSTON_ROADS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <section className="notebook-block">
        <h3>Scenario intersection</h3>
        <div className="finding">
          <span className={"status-dot " + (intersects ? "warm" : "")} />
          {intersects ? "Intersects drawn area" : "Outside drawn area"}
        </div>
        <p>
          {state.mode === "flood"
            ? `Illustrative footprint · ${current.currentFloodRadiusKm.toFixed(1)} km radius`
            : "Drawn storm center · 6 km inspection radius"}{" "}
          at T+{timeLabel(state.progress * state.assumptions.durationHours)}.
        </p>
        <div className="unknown">
          <Icon name="info" size={14} />
          Flood exposure unknown
        </div>
      </section>
      <section className="notebook-block">
        <h3>Hypothetical closure</h3>
        <p>
          {closed
            ? "This segment is removed from the alternative sample network."
            : disconnected
              ? "This open segment has lost its connection to the sample reference node."
              : "The segment is available in the sample network."}
        </p>
        <button
          className={"closure-button" + (closed ? " applied" : "")}
          onClick={() => {
            state.toggleClosure(road.id);
          }}
        >
          <Icon name="closure" size={16} />
          {closed ? "Remove closure" : "Add closure"}
        </button>
      </section>
      <div className="notebook-source">
        <span className="kicker">Geometry source</span>
        <p>{road.provenance}</p>
        <button onClick={onSources}>
          View sources <span aria-hidden="true">↗</span>
        </button>
      </div>
    </section>
  );
}
export function Comparison({
  current,
  evaluation,
  serviceStatus,
  children,
}: {
  current: Derived;
  evaluation: Evaluation;
  serviceStatus:string;
  children: React.ReactNode;
}) {
  const s = useAtlasStore();
  const base = deriveAtlas({ ...BASELINE, mode: s.mode, progress: s.progress });
  const rows = [
    [
      s.mode === "hurricane" ? "Track points" : "Current footprint",
      s.mode === "hurricane"
        ? BASELINE.track.length
        : `${base.currentFloodRadiusKm.toFixed(1)} km`,
      s.mode === "hurricane"
        ? s.track.length
        : `${current.currentFloodRadiusKm.toFixed(1)} km`,
    ],
    [
      s.mode === "hurricane" ? "Storm center" : "Footprint center",
      coordinate(
        s.mode === "hurricane" ? base.stormPosition : BASELINE.floodCenter,
      ),
      coordinate(
        s.mode === "hurricane" ? current.stormPosition : s.floodCenter,
      ),
    ],
    [
      "Road intersections",
      base.intersectedRoadIds.length,
      current.intersectedRoadIds.length,
    ],
    ["Closed segments", 0, s.closedRoadIds.length],
    [
      "Reachable nodes",
      base.network.reachableNodeCount,
      current.network.reachableNodeCount,
    ],
    [
      "Components",
      base.network.connectedComponents,
      current.network.connectedComponents,
    ],
  ];
  return (
    <section
      className="notebook compare-panel"
      aria-label="Baseline and alternative comparison"
    >
      <div className="panel-caption">
        <Icon name="compare" size={15} />
        Scenario comparison
      </div>
      <h2>Before & after</h2>
      <p>
        Baseline uses the seeded geometry and open sample roads. Both columns
        use the selected timeline position.
      </p>
      <table>
        <caption>Hypothetical fixture</caption>
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Base</th>
            <th scope="col">Edited</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, b, a]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{b}</td>
              <td>{a}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        Reachability starts at the fixture reference node. Highlighted links
        show the consequences of assumed closures within this sample.
      </p>
      {children}
      <CountyEvidence evaluation={evaluation} serviceStatus={serviceStatus} />
    </section>
  );
}
