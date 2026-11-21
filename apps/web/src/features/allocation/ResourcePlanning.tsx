import { useEffect, useRef } from "react";
import type { AllocationRequest } from "@earthlab/contracts";
import { PlanningInputs } from "./PlanningInputs";
import { SpeakPlanSummary } from "../assistant/SpeakPlanSummary";
import { agencyNames, strategyNames, type Planner } from "./usePlanner";
import { Icon } from "../../app/Icon";
import "./planning.css";

const percent = (value: number) => Math.round(value * 100) + "%";
const score = (value: number) => value.toFixed(2);
export function Playback({ p }: { p: Planner }) {
  return (
    <div className="plan-playback" role="group" aria-label="Plan playback">
      <button
        aria-label={p.playing ? "Pause plan playback" : "Play selected plan"}
        disabled={!p.end}
        onClick={p.play}
      >
        <Icon name={p.playing ? "pause" : "play"} size={15} />
      </button>
      <button aria-pressed={p.hour === 0} onClick={() => p.seek(0)}>
        Before
      </button>
      <input
        type="range"
        min={0}
        max={p.end || 1}
        step="any"
        value={p.hour}
        disabled={!p.end}
        aria-label="Modeled plan hour"
        onChange={(e) => p.seek(Number(e.target.value))}
      />
      <button
        aria-pressed={p.hour === p.end && p.end > 0}
        onClick={() => p.seek(null)}
      >
        After
      </button>
      <output>{Number(p.hour.toFixed(1))} h</output>
    </div>
  );
}

export function ResourcePlanning({
  p,
  footprint,
  onMap,
}: {
  p: Planner;
  footprint: AllocationRequest["footprint"];
  onMap: () => void;
}) {
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => {
    if (p.assetId) {
      inspector.current?.scrollIntoView({ block: "nearest" });
      inspector.current?.focus({ preventScroll: true });
    }
  }, [p.assetId]);
  const { run, draft, strategy } = p;
  if (!run || !draft || !strategy)
    return (
      <p className="planning-ledger" role="status">
        {p.notice || "Loading Houston planning scenario…"}
      </p>
    );
  const { result } = run;
  const strategyName = strategyNames[strategy.id];
  const chosen = p.assets.find((a) => a.id === p.assetId);
  const actions = result.candidates.filter((c) => c.assetId === chosen?.id);
  const selectedAction = strategy.interventions.find(
    (i) => i.assetId === chosen?.id,
  );
  const options = strategy.interventions.map((i) =>
    result.candidates.find((c) => c.actionId === i.actionId)!,
  );
  const planSummary =
    strategyName +
    ". " +
    strategy.explanation +
    " Modeled clinic access " +
    percent(strategy.access.clinic) +
    ", shelter access " +
    percent(strategy.access.shelter) +
    ".";
  const actionLabels = (ids: string[]) =>
    ids
      .map(
        (id) => result.candidates.find((c) => c.actionId === id)?.assetId ?? id,
      )
      .join(", ") || "Pass";
  return (
    <section
      className="planning-ledger"
      aria-label="Houston allocation ledger"
      aria-busy={p.pending}
    >
      <div className="plan-modes" role="group" aria-label="Planning phase">
        {(["mitigation", "response"] as const).map((phase) => (
          <button
            key={phase}
            disabled={p.pending}
            aria-pressed={draft.phase === phase}
            onClick={() => p.compare({ ...draft, phase })}
          >
            {phase === "mitigation" ? "Mitigation" : "Response"}
          </button>
        ))}
      </div>
      <p className="plan-context">
        {run.offline ? "Offline example" : "Illustrative Houston network"} ·{" "}
        {result.phase === "mitigation"
          ? "Before the flood"
          : "After assumed disruption"}
      </p>
      <h3>
        {result.phase === "mitigation"
          ? "Preserve service access"
          : "Restore service access"}
      </h3>
      <p className="plan-limits">
        {draft.totalBudget} budget units <span>·</span> {draft.crewCapacity}{" "}
        crews <span>·</span> {draft.horizonHours} h window
      </p>
      <PlanningInputs planner={p} footprint={footprint} />
      <div className="plan-run">
        <button disabled={p.pending} onClick={() => p.compare()}>
          {p.pending ? "Comparing…" : "Compare strategies"}
        </button>
        <button className="plan-map-link" onClick={onMap}>
          <Icon name="atlas" size={16} /> Inspect plan on map
        </button>
        {p.dirty && (
          <small>Edits pending. Results use the last computed inputs.</small>
        )}
        {run.offline && (
          <small role="status">
            Bundled {result.phase} case. {p.notice} Retry to compute edited
            inputs.
          </small>
        )}
      </div>
      <table className="plan-matrix">
        <caption>Weighted access &amp; agency utility points</caption>
        <thead>
          <tr>
            <th scope="col">Strategy</th>
            <th scope="col">Access</th>
            <th scope="col">Health</th>
            <th scope="col">Shelter</th>
          </tr>
        </thead>
        <tbody>
          {result.strategies.map((s) => (
            <tr key={s.id} data-selected={s.id === strategy.id}>
              <th scope="row">
                <button
                  aria-pressed={strategy.id === s.id}
                  onClick={() => p.selectStrategy(s.id)}
                >
                  {strategyNames[s.id]}
                </button>
              </th>
              <td>
                {percent(s.weightedAccess)}
                <span className="plan-access-meter" aria-hidden="true">
                  <i style={{ width: percent(s.weightedAccess) }} />
                </span>
              </td>
              <td>{score(s.utilities.health)}</td>
              <td>{score(s.utilities.shelter)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="plan-detail">
        <p className="plan-stamp">{strategyName} · selected portfolio</p>
        <h4>
          {strategy.id === "bargaining" && !result.agreement
            ? "No mutually beneficial agreement"
            : options.length
              ? options.length +
                (options.length === 1
                  ? " proposed intervention"
                  : " proposed interventions")
              : "Hold available resources"}
        </h4>
        <p>{strategy.explanation}</p>
        {options.length > 0 && (
          <ol className="plan-actions">
            {options.map((action) => (
              <li key={action.actionId}>
                <button onClick={() => p.selectAsset(action.assetId)}>
                  <span>
                    {p.assets.find((asset) => asset.id === action.assetId)
                      ?.name ?? action.assetId}
                    <small>
                      {agencyNames[action.agency]} · {action.cost} units ·{" "}
                      {action.crews} crew · {action.hours} h
                    </small>
                  </span>
                  <Icon name="arrow" size={14} />
                </button>
              </li>
            ))}
          </ol>
        )}
        <dl className="plan-totals">
          <div>
            <dt>Health / shelter spend</dt>
            <dd>
              {strategy.spend.health} / {strategy.spend.shelter} units
            </dd>
          </div>
          <div>
            <dt>Crews / equipment</dt>
            <dd>
              {strategy.crewsUsed} / {strategy.equipmentUsed}
            </dd>
          </div>
          <div>
            <dt>Completion window</dt>
            <dd>{strategy.completionHours} h</dd>
          </div>
          <div>
            <dt>Clinic access</dt>
            <dd>
              {percent(result.baselineAccess.clinic)} →{" "}
              {percent(strategy.access.clinic)}
            </dd>
          </div>
          <div>
            <dt>Shelter access</dt>
            <dd>
              {percent(result.baselineAccess.shelter)} →{" "}
              {percent(strategy.access.shelter)}
            </dd>
          </div>
        </dl>
        <label className="plan-asset-picker">
          Inspect a map asset{" "}
          <select
            value={p.assetId ?? ""}
            onChange={(e) => p.selectAsset(e.target.value || null)}
          >
            <option value="">Choose a link or facility</option>
            {p.assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {chosen && (
        <section
          ref={inspector}
          tabIndex={-1}
          className="plan-inspection"
          aria-label="Planning asset details"
        >
          <div>
            <h4>{chosen.name}</h4>
            <button
              aria-label="Clear inspected asset"
              onClick={() => p.selectAsset(null)}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          <p>
            {chosen.caption}
            {actions[0]?.exposed ? " · intersects the exposure circle" : ""}
          </p>
          {selectedAction && (
            <p>
              With this action removed, modeled clinic access changes from{" "}
              {percent(strategy.access.clinic)} to{" "}
              {percent(selectedAction.accessWithout.clinic)} and shelter access
              from {percent(strategy.access.shelter)} to{" "}
              {percent(selectedAction.accessWithout.shelter)}.
            </p>
          )}
          {actions.map((a) => (
            <p key={a.actionId}>
              <strong>{agencyNames[a.agency]}</strong> · {a.cost} units ·{" "}
              {a.hours} h. {a.effectAssumption}
            </p>
          ))}
          {chosen.kind === "facility" && (
            <p>
              Access is measured from the staging point along the modeled
              network.
            </p>
          )}
          <small>Source · {actions[0]?.source ?? result.graphSource}</small>
        </section>
      )}
      <details className="plan-fold">
        <summary>Payoffs &amp; method</summary>
        <p>
          {result.equilibriumVerified
            ? "The independent outcome passed the unilateral-deviation check under shared resource constraints."
            : "The independent outcome is an approximate best response."}
        </p>
        <p>
          Coordination maximizes combined utility. Bargaining maximizes the
          weighted product of gains over the independent outcome. Health weight{" "}
          {run.request.bargainingWeight * 10}%.
        </p>
        <p>
          Selected gains · health {score(strategy.gains.health)}, shelter{" "}
          {score(strategy.gains.shelter)}. Nash product{" "}
          {score(strategy.nashProduct)}.
        </p>
        <table className="plan-matrix">
          <caption>Computed payoff examples</caption>
          <thead>
            <tr>
              <th>Health action</th>
              <th>Shelter action</th>
              <th>Payoffs (H, S)</th>
            </tr>
          </thead>
          <tbody>
            {result.payoffMatrix.map((row, i) => (
              <tr key={i}>
                <td>{actionLabels(row.healthActions)}</td>
                <td>{actionLabels(row.shelterActions)}</td>
                <td>
                  {row.feasible
                    ? score(row.utilities.health) +
                      ", " +
                      score(row.utilities.shelter)
                    : "Infeasible"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details className="plan-fold">
        <summary>Sources &amp; limitations</summary>
        <p>{result.scenarioLabel}</p>
        <ul>
          {[...result.assumptions, ...result.limitations].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p>
          {result.graphVersion} · {result.assumptionSetId} · scenario v
          {result.scenarioVersion}
        </p>
        <p>
          {result.sourceIds.join(" · ")} · {result.timestampUtc}
        </p>
      </details>
      <details className="plan-fold">
        <summary>Plan summary</summary>
        <p>{planSummary}</p>
        <SpeakPlanSummary text={planSummary} />
      </details>
    </section>
  );
}
