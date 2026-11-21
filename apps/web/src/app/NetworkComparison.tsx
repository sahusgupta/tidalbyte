import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  compareNetwork,
  fetchNetworkCatalog,
  type NetworkCatalog,
} from "../services/network";

function LiveComparison({ catalog }: { catalog: NetworkCatalog }) {
  const [edge, setEdge] = useState(catalog.edges[0]?.id ?? "");
  const [requested, setRequested] = useState("");
  const result = useQuery({
    queryKey: ["graph-comparison", catalog.graphSource, requested],
    enabled: requested !== "" && catalog.edgeIds.includes(requested),
    queryFn: ({ signal }) =>
      compareNetwork(
        {
          regionId: catalog.regionId,
          disabledEdgeIds: [],
          disabledNodeIds: [],
          interventions: [
            {
              id: "atlas-assumed-closure",
              action: "disable",
              graphEdgeIds: [requested],
              graphNodeIds: [],
            },
          ],
        },
        catalog,
        { signal },
      ),
    retry: false,
  });
  const pair = requested === edge ? result.data?.comparison : null;
  return (
    <>
      <p>{catalog.graphSource}</p>
      <label>
        Backend segment
        <select
          value={edge}
          onChange={(e) => {
            setRequested("");
            setEdge(e.target.value);
          }}
        >
          {catalog.edges.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={!edge || result.isFetching}
        onClick={() => {
          if (requested === edge) void result.refetch();
          else setRequested(edge);
        }}
      >
        {result.isFetching ? "Comparing…" : "Compare assumed closure"}
      </button>
      {pair && (
        <>
          <table>
            <caption>Backend hypothetical network</caption>
            <thead>
              <tr>
                <th>Measure</th>
                <th>Base</th>
                <th>Edited</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Components", "connectedComponents"],
                  ["Reachable facilities", "reachableFacilities"],
                  ["Weighted access", "weightedAccessScore"],
                ] as const
              ).map(([label, key]) => (
                <tr key={key}>
                  <th>{label}</th>
                  <td>{pair.baseline[key]}</td>
                  <td>{pair.proposal[key]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>{pair.limitations.join(" ")}</p>
        </>
      )}
      {requested &&
        (result.data?.status === "unavailable" || result.isError) && (
          <p role="status">Backend comparison unavailable.</p>
        )}
    </>
  );
}

export function NetworkComparison() {
  const query = useQuery({
    queryKey: ["houston-graph"],
    queryFn: ({ signal }) =>
      fetchNetworkCatalog("houston-gulf-coast", { signal }),
    staleTime: 60_000,
    retry: false,
  });
  return (
    <section className="network-controls">
      <h3>Backend graph</h3>
      {query.data?.catalog ? (
        <LiveComparison
          key={query.data.catalog.graphSource}
          catalog={query.data.catalog}
        />
      ) : (
        <p>
          {query.isFetching
            ? "Checking graph availability…"
            : "Unavailable. The table above uses the local road fixture."}
        </p>
      )}
    </section>
  );
}
