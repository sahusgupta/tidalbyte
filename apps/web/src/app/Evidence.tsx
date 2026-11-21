import type { Evaluation } from "@earthlab/contracts";
import { offlineCounties } from "@earthlab/contracts";
import { BASELINE, HOUSTON_ROADS, deriveAtlas, type Point } from "../atlas/domain";
import { useAtlasStore } from "./store";
import { Icon } from "./Icon";
import { RoadSketch, timeLabel } from "./FieldTools";
import { ScenarioComparisonMap } from "./ScenarioComparisonMap";

type Derived = ReturnType<typeof deriveAtlas>;
function coordinate(point: Point) {
  return `${point[1].toFixed(2)}° N, ${Math.abs(point[0]).toFixed(2)}° W`;
}

export function CountyEvidence({
  evaluation,
  serviceStatus,
}: {
  evaluation: Evaluation;
  serviceStatus: string;
}) {
  const trained = evaluation.modelMetadata.dataMode === "trained_conditional";
  const metrics = evaluation.modelMetadata.evaluation;
  return (
    <section className="county-evidence notebook-section">
      <h3>County outage severity</h3>
      <p className="notebook-note" role="status">
        {serviceStatus}
      </p>
      <p>
        {trained
          ? "Conditional severity for selected positive-outage warning hours."
          : "Fixed offline examples, not model estimates."}
      </p>
      <ul className="county-readings">
        {evaluation.predictions.map((prediction) => (
          <li key={prediction.countyFips}>
            <span>
              {offlineCounties.features.find((feature) => feature.id === prediction.countyFips)
                ?.properties.name ?? prediction.countyFips}
            </span>
            <strong>
              {prediction.predictedSeverity}{" "}
              <small>{trained ? prediction.severityUnit : "/ 3"}</small>
            </strong>
          </li>
        ))}
      </ul>
      <p className="notebook-note">
        {trained
          ? `Model ${evaluation.modelMetadata.modelVersion} · ${evaluation.modelMetadata.trainingDatasetIds.join(", ")}`
          : "The 0–3 fixture indices stay unchanged when this scenario is edited."}
      </p>
      <details className="notebook-disclosure model-evidence">
        <summary>
          {trained ? "Model evaluation & sources" : "Scope & sources"}
          <Icon name="down" size={16} />
        </summary>
        {trained && (
          <p>
            {evaluation.modelMetadata.target} · {evaluation.scenario.selection.eventTimeUtc}
          </p>
        )}
        {trained && metrics && (
          <p>
            {metrics.splitPolicy} · {metrics.testEventCount} test events. Mean absolute error{" "}
            {metrics.modelMae} {metrics.targetUnit}. {metrics.baselineName} baseline{" "}
            {metrics.baselineMae}.
          </p>
        )}
        {(trained ? evaluation.modelMetadata.limitations : evaluation.disclaimers).map(
          (limitation) => (
            <p key={limitation}>{limitation}</p>
          ),
        )}
        <p className="source-identifiers">
          {[...new Set(evaluation.predictions.flatMap((prediction) => prediction.sourceIds))].join(
            ", ",
          )}
        </p>
      </details>
    </section>
  );
}

export function RoadInspector({ current, onSources }: { current: Derived; onSources: () => void }) {
  const state = useAtlasStore();
  const road = HOUSTON_ROADS.find((item) => item.id === state.selectedRoadId) ?? HOUSTON_ROADS[0];
  const closed = state.closedRoadIds.includes(road.id);
  const disconnected = current.network.disconnectedRoadIds.includes(road.id);
  const intersects = current.intersectedRoadIds.includes(road.id);
  return (
    <section className="notebook-page road-page" aria-label="Road inspector">
      <header className="notebook-heading">
        <h2>{road.name}</h2>
        <p>Schematic road · actual condition unknown</p>
      </header>
      <RoadSketch points={road.points} closed={closed} />
      <label className="notebook-field road-picker">
        Inspect segment
        <select value={road.id} onChange={(event) => state.selectRoad(event.target.value)}>
          {HOUSTON_ROADS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <section className="notebook-section">
        <h3>Scenario intersection</h3>
        <p className="notebook-finding">
          <span
            className={intersects ? "finding-mark intersects" : "finding-mark"}
            aria-hidden="true"
          />
          {intersects ? "Intersects drawn area" : "Outside drawn area"}
        </p>
        <p>
          {state.mode === "flood"
            ? `Illustrative footprint · ${current.currentFloodRadiusKm.toFixed(1)} km radius`
            : "Drawn storm center · 6 km inspection radius"}{" "}
          at T+{timeLabel(state.progress * state.assumptions.durationHours)}.
        </p>
        <p className="notebook-note exposure-note">
          <Icon name="info" size={16} />
          Flood exposure unknown
        </p>
      </section>
      <section className="notebook-section">
        <h3>Hypothetical closure</h3>
        <p>
          {closed
            ? "Removed from the alternative sample network."
            : disconnected
              ? "This open link is disconnected from the sample reference node."
              : "Available in the sample network."}
        </p>
        <button
          type="button"
          className={`closure-button notebook-primary ${closed ? "applied" : ""}`}
          onClick={() => state.toggleClosure(road.id)}
        >
          <Icon name="closure" size={16} />
          {closed ? "Remove closure" : "Add closure"}
        </button>
      </section>
      <details className="notebook-section notebook-disclosure notebook-source">
        <summary>
          Geometry & provenance
          <Icon name="down" size={16} />
        </summary>
        <p className="source-identifiers">{road.id}</p>
        <p>{road.provenance}</p>
        <button type="button" className="notebook-text-action" onClick={onSources}>
          View sources
          <Icon name="book" size={16} />
        </button>
      </details>
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
  serviceStatus: string;
  children: React.ReactNode;
}) {
  const state = useAtlasStore();
  const baseline = {
    ...BASELINE,
    mode: state.mode,
    progress: state.progress,
    assumptions: { ...BASELINE.assumptions, durationHours: state.assumptions.durationHours },
  };
  const base = deriveAtlas(baseline);
  const rows = [
    [
      state.mode === "hurricane" ? "Track points" : "Current footprint",
      state.mode === "hurricane"
        ? BASELINE.track.length
        : `${base.currentFloodRadiusKm.toFixed(1)} km`,
      state.mode === "hurricane"
        ? state.track.length
        : `${current.currentFloodRadiusKm.toFixed(1)} km`,
    ],
    ["Road intersections", base.intersectedRoadIds.length, current.intersectedRoadIds.length],
    ["Closed segments", 0, state.closedRoadIds.length],
    ["Reachable nodes", base.network.reachableNodeCount, current.network.reachableNodeCount],
    ["Components", base.network.connectedComponents, current.network.connectedComponents],
  ];
  return (
    <section
      className="notebook-page comparison-page"
      aria-label="Baseline and alternative comparison"
    >
      <ScenarioComparisonMap baseline={baseline} edited={state} />
      <details className="comparison-detail">
        <summary>Comparison details &amp; evidence</summary>
        <table className="notebook-table">
          <caption>
            Hypothetical fixture · T+{timeLabel(state.progress * state.assumptions.durationHours)}
          </caption>
          <thead>
            <tr>
              <th scope="col">Measure</th>
              <th scope="col">Base</th>
              <th scope="col">Edited</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, baseline, edited]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{baseline}</td>
                <td className={baseline !== edited ? "changed-value" : undefined}>{edited}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="comparison-coordinates">
          <div>
            <dt>{state.mode === "hurricane" ? "Storm center" : "Footprint center"} · base</dt>
            <dd>
              {coordinate(state.mode === "hurricane" ? base.stormPosition : BASELINE.floodCenter)}
            </dd>
          </div>
          <div>
            <dt>Edited center</dt>
            <dd>
              {coordinate(state.mode === "hurricane" ? current.stormPosition : state.floodCenter)}
            </dd>
          </div>
        </dl>
        <p className="notebook-note">
          Reachability starts at the fixture reference node. Assumed closures change connections in
          this sample; they do not establish road safety.
        </p>
        {children}
        <CountyEvidence
          evaluation={evaluation}
          serviceStatus={`Both cases use the same county preset. ${serviceStatus}`}
        />
      </details>
    </section>
  );
}
