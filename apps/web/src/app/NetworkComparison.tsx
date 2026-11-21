import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  NetworkCompareRequest,
  PlanComparison,
} from "@earthlab/contracts";
import {
  compareNetwork,
  fetchNetworkCatalog,
  fetchNetworkStrategy,
  previewNetwork,
  type NetworkCatalog,
  type NetworkStrategy,
  type StrategyProfile,
} from "../services/network";
import { NetworkGraphPreview } from "./NetworkGraphPreview";
import "./network-controls.css";

type Action = "disable" | "protect" | "inspect";
type PlanAsset = {
  kind: "edge" | "node";
  id: string;
  action: Action;
  disrupted: boolean;
};
function Metrics({ comparison }: { comparison: PlanComparison }) {
  return (
    <table className="notebook-table">
      <caption>Backend hypothetical connectivity</caption>
      <thead>
        <tr>
          <th scope="col">Measure</th>
          <th scope="col">Baseline</th>
          <th scope="col">Proposal</th>
        </tr>
      </thead>
      <tbody>
        {(
          [
            ["Components", "connectedComponents"],
            ["Reachable facilities", "reachableFacilities"],
            ["Weighted access (fixture points)", "weightedAccessScore"],
          ] as const
        ).map(([label, key]) => (
          <tr key={key}>
            <th scope="row">{label}</th>
            <td>{comparison.baseline[key]}</td>
            <td>{comparison.proposal[key]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InterventionPlan({ catalog }: { catalog: NetworkCatalog }) {
  const [assets, setAssets] = useState<PlanAsset[]>([
    {
      kind: "edge",
      id: catalog.edgeIds[0],
      action: "disable",
      disrupted: false,
    },
  ]);
  const [submitted, setSubmitted] = useState<NetworkCompareRequest | null>(
    null,
  );
  const plan: NetworkCompareRequest = {
    regionId: catalog.regionId,
    disabledEdgeIds: assets
      .filter((asset) => asset.kind === "edge" && asset.disrupted)
      .map((asset) => asset.id),
    disabledNodeIds: assets
      .filter((asset) => asset.kind === "node" && asset.disrupted)
      .map((asset) => asset.id),
    interventions: assets.map((asset, index) => ({
      id: `atlas-intervention-${index + 1}`,
      action: asset.action,
      graphEdgeIds: asset.kind === "edge" ? [asset.id] : [],
      graphNodeIds: asset.kind === "node" ? [asset.id] : [],
    })),
  };
  const query = useQuery({
    queryKey: ["backend-network-plan", catalog.graphSource, submitted],
    enabled: submitted !== null,
    queryFn: async ({ signal }) => {
      if (!submitted) throw new Error("Choose a plan first.");
      const [comparison, preview] = await Promise.all([
        compareNetwork(submitted, catalog, { signal }),
        previewNetwork(submitted, catalog, { signal }),
      ]);
      return { comparison, preview };
    },
    retry: false,
  });
  const unchanged = JSON.stringify(plan) === JSON.stringify(submitted);
  const result = unchanged ? query.data : undefined;
  const update = (index: number, changes: Partial<PlanAsset>) =>
    setAssets((current) =>
      current.map((asset, i) =>
        i === index ? { ...asset, ...changes } : asset,
      ),
    );
  const options = (kind: "edge" | "node", index: number) =>
    (kind === "edge" ? catalog.edges : catalog.nodes).filter(
      (item) => !assets.some((asset, i) => i !== index && asset.id === item.id),
    );
  const add = () => {
    const edge = catalog.edges.find(
      (item) => !assets.some((asset) => asset.id === item.id),
    );
    const node = catalog.nodes.find(
      (item) => !assets.some((asset) => asset.id === item.id),
    );
    if (edge || node)
      setAssets([
        ...assets,
        {
          kind: edge ? "edge" : "node",
          id: (edge ?? node)!.id,
          action: "inspect",
          disrupted: false,
        },
      ]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (unchanged) void query.refetch();
    else setSubmitted(plan);
  };
  return (
    <div className="network-plan">
      <p>
        Compare up to three catalog assets. A baseline disruption is an
        assumption; protection cancels it, disable removes an asset, and inspect
        leaves connectivity unchanged.
      </p>
      <form onSubmit={submit}>
        {assets.map((asset, index) => (
          <fieldset key={index} className="network-asset">
            <legend>Asset {index + 1}</legend>
            <div className="network-fields">
              <label>
                Asset type
                <select
                  aria-label={`Asset type ${index + 1}`}
                  value={asset.kind}
                  onChange={(event) => {
                    const kind = event.target.value as PlanAsset["kind"];
                    update(index, {
                      kind,
                      id: options(kind, index)[0]?.id ?? "",
                    });
                  }}
                >
                  <option value="edge">Link</option>
                  <option value="node">Node</option>
                </select>
              </label>
              <label>
                Catalog asset
                <select
                  aria-label={`Catalog asset ${index + 1}`}
                  value={asset.id}
                  onChange={(event) =>
                    update(index, { id: event.target.value })
                  }
                  required
                >
                  {!asset.id && <option value="">No unused assets</option>}
                  {options(asset.kind, index).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Proposal action
                <select
                  aria-label={`Proposal action ${index + 1}`}
                  value={asset.action}
                  onChange={(event) => {
                    const action = event.target.value as Action;
                    update(index, {
                      action,
                      ...(action === "protect" ? { disrupted: true } : {}),
                    });
                  }}
                >
                  <option value="disable">Disable</option>
                  <option value="protect">Protect</option>
                  <option value="inspect">Inspect</option>
                </select>
              </label>
            </div>
            <label className="network-check">
              <input
                type="checkbox"
                checked={asset.disrupted}
                onChange={(event) =>
                  update(index, { disrupted: event.target.checked })
                }
              />
              Assume this asset is disrupted in the baseline
            </label>
            {assets.length > 1 && (
              <button
                type="button"
                className="network-text-button"
                onClick={() => setAssets(assets.filter((_, i) => i !== index))}
              >
                Remove asset {index + 1}
              </button>
            )}
          </fieldset>
        ))}
        <div className="network-actions">
          <button
            type="button"
            onClick={add}
            disabled={
              assets.length >= 3 ||
              assets.length >= catalog.edgeIds.length + catalog.nodeIds.length
            }
          >
            Add asset
          </button>
          <button
            type="submit"
            className="notebook-primary"
            disabled={query.isFetching || assets.some((asset) => !asset.id)}
          >
            {query.isFetching ? "Comparing…" : "Compare interventions"}
          </button>
        </div>
      </form>
      {submitted && !unchanged && (
        <p role="status">Plan edited. Compare again to refresh the results.</p>
      )}
      {query.isError && unchanged && (
        <p role="status">
          {query.error instanceof Error
            ? query.error.message
            : "Comparison unavailable."}
        </p>
      )}
      {result?.comparison.status === "available" && (
        <>
          <Metrics comparison={result.comparison.comparison} />
          {result.preview.status === "available" ? (
            <NetworkGraphPreview
              catalog={catalog}
              preview={result.preview.preview}
            />
          ) : (
            <p role="status">{result.preview.message}</p>
          )}
          <details className="network-disclosure">
            <summary>Connectivity assumptions</summary>
            {result.comparison.comparison.limitations.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </details>
        </>
      )}
      {result?.comparison.status === "unavailable" && (
        <p role="status">{result.comparison.message}</p>
      )}
    </div>
  );
}

function StrategyGame({
  catalog,
  strategy,
}: {
  catalog: NetworkCatalog;
  strategy: NetworkStrategy;
}) {
  const [choices, setChoices] = useState(
    strategy.agencies.map(() => strategy.actions[0].id),
  );
  const name = (id: string) =>
    id === "pass"
      ? "Pass"
      : ([...catalog.edges, ...catalog.nodes].find((item) => item.id === id)
          ?.name ?? id);
  const profile = strategy.payoffTable.find((row) =>
    row.actions.every((action, index) => action === choices[index]),
  );
  const profileLabel = (row: StrategyProfile) =>
    row.actions
      .map((action, i) => `${strategy.agencies[i].id}: ${name(action)}`)
      .join(" · ");
  return (
    <div className="network-strategy">
      <p>
        Choose what each agency protects. This example assumes disruptions on
        the {strategy.disabledEdgeIds.map(name).join(" and ")}.
      </p>
      <div className="network-fields">
        {strategy.agencies.map((agency, index) => (
          <label key={agency.id}>
            {agency.id} · budget {agency.budgetUnits} unit
            {agency.budgetUnits === 1 ? "" : "s"}
            <select
              aria-label={`${agency.id} protection action`}
              value={choices[index]}
              onChange={(event) =>
                setChoices(
                  choices.map((choice, i) =>
                    i === index ? event.target.value : choice,
                  ),
                )
              }
            >
              {strategy.actions
                .filter((action) => action.budgetUnits <= agency.budgetUnits)
                .map((action) => (
                  <option key={action.id} value={action.id}>
                    {name(action.id)} · {action.budgetUnits}{" "}
                    {action.budgetUnits === 1 ? "unit" : "units"}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      {profile ? (
        <div className="network-payoffs" role="status">
          {strategy.agencies.map((agency, index) => (
            <div key={agency.id}>
              <span>{agency.id} payoff</span>
              <strong>
                {profile.payoffs[index]} <small>utility points</small>
              </strong>
            </div>
          ))}
          <div>
            <span>Joint payoff</span>
            <strong>
              {profile.totalPayoff} <small>utility points</small>
            </strong>
          </div>
        </div>
      ) : (
        <p role="status">This profile was not returned by the backend.</p>
      )}
      <dl className="network-outcomes">
        <div>
          <dt>Independent equilibria</dt>
          <dd>
            {strategy.independentEquilibria.length
              ? strategy.independentEquilibria.map((row) => (
                  <p key={row.actions.join("|")}>
                    {profileLabel(row)} · joint payoff {row.totalPayoff}
                  </p>
                ))
              : "No pure equilibrium returned."}
          </dd>
        </div>
        <div>
          <dt>Coordinated optima</dt>
          <dd>
            {strategy.coordinatedOptima.map((row) => (
              <p key={row.actions.join("|")}>
                {profileLabel(row)} · joint payoff {row.totalPayoff}
              </p>
            ))}
          </dd>
        </div>
      </dl>
      <details className="network-disclosure">
        <summary>Payoff rule, utilities &amp; full table</summary>
        <p>{strategy.payoffRule}</p>
        {strategy.agencies.map((agency) => (
          <p key={agency.id}>
            {agency.id} facility utilities:{" "}
            {Object.entries(agency.facilityUtilities)
              .map(([id, utility]) => `${name(id)} ${utility}`)
              .join("; ")}
            .
          </p>
        ))}
        <div className="network-table-wrap">
          <table className="notebook-table">
            <caption>All backend action profiles · utility points</caption>
            <thead>
              <tr>
                {strategy.agencies.map((agency) => (
                  <th key={agency.id} scope="col">
                    {agency.id} action
                  </th>
                ))}
                {strategy.agencies.map((agency) => (
                  <th key={agency.id} scope="col">
                    {agency.id} payoff
                  </th>
                ))}
                <th scope="col">Joint</th>
              </tr>
            </thead>
            <tbody>
              {strategy.payoffTable.map((row) => (
                <tr key={row.actions.join("|")}>
                  {row.actions.map((action, i) => (
                    <td key={`action-${i}`}>{name(action)}</td>
                  ))}
                  {row.payoffs.map((payoff, i) => (
                    <td key={`payoff-${i}`}>{payoff}</td>
                  ))}
                  <td>{row.totalPayoff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {strategy.limitations.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </details>
    </div>
  );
}

function Strategy({ catalog }: { catalog: NetworkCatalog }) {
  const result = useQuery({
    queryKey: ["backend-strategy", catalog.graphSource],
    queryFn: ({ signal }) => fetchNetworkStrategy(catalog, { signal }),
    retry: false,
  });
  return result.data?.strategy ? (
    <StrategyGame catalog={catalog} strategy={result.data.strategy} />
  ) : (
    <p role="status">
      {result.isFetching
        ? "Loading the backend strategy example…"
        : (result.data?.message ?? "Strategy unavailable.")}
    </p>
  );
}
function Workspace({ catalog }: { catalog: NetworkCatalog }) {
  const [page, setPage] = useState<"interventions" | "strategy">(
    "interventions",
  );
  const [strategyOpened, setStrategyOpened] = useState(false);
  return (
    <>
      <p>
        Explore how assumed closures and protection affect access to a fictional
        clinic and shelter.
      </p>
      <div
        className="network-tabs"
        role="group"
        aria-label="Backend network analysis"
      >
        <button
          type="button"
          aria-pressed={page === "interventions"}
          onClick={() => setPage("interventions")}
        >
          Interventions
        </button>
        <button
          type="button"
          aria-pressed={page === "strategy"}
          onClick={() => {
            setStrategyOpened(true);
            setPage("strategy");
          }}
        >
          Two-agency strategy
        </button>
      </div>
      <div hidden={page !== "interventions"}>
        <InterventionPlan catalog={catalog} />
      </div>
      {strategyOpened && (
        <div hidden={page !== "strategy"}>
          <Strategy catalog={catalog} />
        </div>
      )}
      <details className="network-disclosure">
        <summary>Network source</summary>
        <p>This planning example uses its own schematic network.</p>
        <p className="source-identifiers">{catalog.graphSource}</p>
      </details>
    </>
  );
}
export function NetworkComparison() {
  const [opened, setOpened] = useState(false);
  const query = useQuery({
    queryKey: ["houston-graph"],
    queryFn: ({ signal }) =>
      fetchNetworkCatalog("houston-gulf-coast", { signal }),
    staleTime: 60_000,
    enabled: opened,
    retry: false,
  });
  return (
    <details
      className="comparison-detail"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>Infrastructure network</summary>
      <section
        className="network-controls notebook-section"
        aria-label="Infrastructure network planning"
      >
        {query.data?.catalog ? (
          <Workspace
            key={query.data.catalog.graphSource}
            catalog={query.data.catalog}
          />
        ) : (
          <>
            <p role="status">
              {!opened || query.isFetching
                ? "Opening the network…"
                : "The network service is unavailable. You can still compare roads on the atlas."}
            </p>
            {!query.isFetching && (
              <button
                type="button"
                className="network-text-button"
                onClick={() => void query.refetch()}
              >
                Retry connection
              </button>
            )}
          </>
        )}
      </section>
    </details>
  );
}
