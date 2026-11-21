import type { AllocationRequest } from "@earthlab/contracts";
import { agencyNames, type Planner } from "./usePlanner";

function Quantity({
  label,
  value,
  max,
  min = 0,
  change,
}: {
  label: string;
  value: number;
  max: number;
  min?: number;
  change: (value: number) => void;
}) {
  return (
    <label className="plan-quantity">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(event) => {
          const n = event.target.valueAsNumber;
          if (Number.isInteger(n) && n >= min && n <= max) change(n);
        }}
      />
    </label>
  );
}

export function PlanningInputs({
  planner,
  footprint,
}: {
  planner: Planner;
  footprint: AllocationRequest["footprint"];
}) {
  const { draft, run, update } = planner;
  if (!draft || !run) return null;
  const patch = (value: Partial<AllocationRequest>) =>
    update({ ...draft, ...value });
  const edges = planner.assets.filter((asset) => asset.kind === "road");
  function setStatus(id: string, next: string) {
    if (!draft) return;
    const blockedEdgeIds = draft.blockedEdgeIds.filter((e) => e !== id);
    const impairedEdgeIds = draft.impairedEdgeIds.filter((e) => e !== id);
    if (next === "blocked") blockedEdgeIds.push(id);
    if (next === "impaired") impairedEdgeIds.push(id);
    patch({ blockedEdgeIds, impairedEdgeIds });
  }
  return (
    <details className="plan-fold">
      <summary>Resources &amp; assumptions</summary>
      <fieldset disabled={planner.pending}>
        <legend>Shared resources</legend>
        <div className="plan-fields">
          <Quantity
            label="Budget units"
            max={200}
            value={draft.totalBudget}
            change={(totalBudget) => patch({ totalBudget })}
          />
          <Quantity
            label="Crews"
            max={6}
            value={draft.crewCapacity}
            change={(crewCapacity) => patch({ crewCapacity })}
          />
          <Quantity
            label="Equipment units"
            max={10}
            value={draft.equipmentCapacity}
            change={(equipmentCapacity) => patch({ equipmentCapacity })}
          />
          <Quantity
            label="Window (hours)"
            min={1}
            max={48}
            value={draft.horizonHours}
            change={(horizonHours) => patch({ horizonHours })}
          />
        </div>
      </fieldset>
      {(["health", "shelter"] as const).map((id) => {
        const agency = draft.agencies[id];
        const edit = (key: keyof typeof agency, value: number) =>
          patch({
            agencies: { ...draft.agencies, [id]: { ...agency, [key]: value } },
          });
        return (
          <fieldset key={id} disabled={planner.pending}>
            <legend>{agencyNames[id]} agency</legend>
            <div className="plan-fields">
              <Quantity
                label="Agency budget"
                max={100}
                value={agency.budget}
                change={(v) => edit("budget", v)}
              />
              <Quantity
                label="Agency crews"
                max={6}
                value={agency.crewCapacity}
                change={(v) => edit("crewCapacity", v)}
              />
              <Quantity
                label="Clinic priority"
                max={10}
                value={agency.clinicWeight}
                change={(v) => edit("clinicWeight", v)}
              />
              <Quantity
                label="Shelter priority"
                max={10}
                value={agency.shelterWeight}
                change={(v) => edit("shelterWeight", v)}
              />
            </div>
          </fieldset>
        );
      })}
      <fieldset disabled={planner.pending}>
        <legend>Scenario assumptions</legend>
        <div className="plan-fields">
          <Quantity
            label="Action effect (%)"
            max={100}
            value={draft.effectPercent}
            change={(effectPercent) => patch({ effectPercent })}
          />
          <Quantity
            label="Health bargaining weight (tenths)"
            min={1}
            max={9}
            value={draft.bargainingWeight}
            change={(bargainingWeight) => patch({ bargainingWeight })}
          />
        </div>
        <p>
          Shelter receives the remaining {100 - draft.bargainingWeight * 10}% of
          bargaining weight.
        </p>
        <div className="plan-road-status">
          {edges.map((edge) => (
            <label key={edge.id}>
              <span>{edge.name}</span>
              <select
                aria-label={edge.name + " assumed condition"}
                value={
                  draft.blockedEdgeIds.includes(edge.id)
                    ? "blocked"
                    : draft.impairedEdgeIds.includes(edge.id)
                      ? "impaired"
                      : "available"
                }
                onChange={(e) => setStatus(edge.id, e.target.value)}
              >
                <option value="available">Available</option>
                <option value="impaired">Impaired</option>
                <option value="blocked">Blocked</option>
              </select>
            </label>
          ))}
        </div>
        <p>
          {draft.footprint
            ? "Exposure circle · " +
              draft.footprint.radiusKm.toFixed(1) +
              " km radius"
            : "No exposure circle"}
          . Road conditions are set above.
        </p>
        <div className="plan-buttons">
          <button disabled={!footprint} onClick={() => patch({ footprint })}>
            Use atlas flood circle
          </button>
          {draft.footprint && (
            <button onClick={() => patch({ footprint: null })}>
              Clear circle
            </button>
          )}
        </div>
        {!footprint && (
          <p>Draw a flood footprint in the atlas to use its circle here.</p>
        )}
      </fieldset>
    </details>
  );
}
