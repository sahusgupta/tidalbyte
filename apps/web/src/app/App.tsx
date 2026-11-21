import { lazy, Suspense, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { offlineEvaluation, type Scenario } from "@earthlab/contracts";
import { evaluateScenario } from "../services/evaluation";
import { counties, useConsoleStore } from "./store";

const Globe = lazy(() => import("../features/globe/Globe"));

export function App() {
  const { scenario, pinnedCounty, scene, rotating, overlayVisible, dispatch } = useConsoleStore();
  const analysis = useMutation({ mutationFn: (request: Scenario) => evaluateScenario(request) });
  const evaluation = analysis.data?.evaluation ?? offlineEvaluation;
  const prediction = evaluation.predictions.find((item) => item.countyFips === pinnedCounty);
  const county = counties.find((item) => item.fips === pinnedCounty)!;
  const isOffline = evaluation.predictions.every((item) => item.dataMode === "offline_example");

  const launchHouston = () => {
    dispatch({ action: "FLY_HOUSTON", args: {} });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat
        || target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key.toLowerCase() === "h") dispatch({ action: "FLY_HOUSTON", args: {} });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);

  return (
    <div className="console-shell">
      <a className="skip-link" href="#scenario-controls">Skip to scenario controls</a>
      <header className="console-header">
        <a className="wordmark" href="/" aria-label="EarthLab home"><span className="earth-mark" aria-hidden="true">⊕</span> EarthLab<span className="wordmark-note">Planning atlas</span></a>
        <span className="header-scope">Weather context <span aria-hidden="true">/</span> Houston Gulf Coast</span>
        <strong className={isOffline ? "data-flag" : "data-flag model-flag"}>{isOffline ? "OFFLINE EXAMPLE" : "CONDITIONAL MODEL"}</strong>
      </header>

      <main className="workspace">
        <Suspense fallback={<div className="globe-loading" role="status">Loading local Earth imagery…</div>}>
          <Globe predictions={evaluation.predictions} />
        </Suspense>

        <aside className="scenario-rail" id="scenario-controls" aria-label="Scenario controls">
          <div className="rail-heading"><span className="section-marker" aria-hidden="true" /><h1>Scenario console</h1></div>
          <p className="rail-intro">Explore a place.<br />Inspect the evidence.</p>
          <div className="rail-section">
            <h2>Study region</h2>
            <button className="houston-button" onClick={launchHouston} aria-keyshortcuts="H" title="Fly to Houston (H)">
              <span>Houston Gulf Coast</span><span className="button-coordinates">29.76° N &nbsp; 95.37° W</span><span className="button-action">Fly to Houston <span aria-hidden="true">↗</span></span>
            </button>
          </div>
          <div className="rail-section">
            <h2>Warning context</h2>
            <label className="field-label" htmlFor="event">Preset</label>
            <select id="event" value={scenario.presetEventId} onChange={(event) => dispatch({ action: "SELECT_PRESET", args: { presetEventId: event.target.value } })}>
              <option value={scenario.presetEventId}>Example warning fixture</option>
            </select>
            <p className="small-copy">Synthetic case for integration. No verified historical event is loaded.</p>
          </div>
          <div className="rail-section">
            <h2>Map layers</h2>
            <label className="layer-toggle"><input type="checkbox" checked={overlayVisible} onChange={(event) => dispatch({ action: "TOGGLE_OVERLAY", args: { visible: event.target.checked } })} /><span>Schematic counties</span></label>
            <p className="small-copy">Simplified shapes near Houston. These are not county boundaries.</p>
          </div>
          <div className="rail-section county-section">
            <h2>Inspect a county</h2>
            <div className="county-list">
              {counties.map((item) => <button key={item.fips} className={pinnedCounty === item.fips ? "county-row selected" : "county-row"} aria-pressed={pinnedCounty === item.fips} onClick={() => dispatch({ action: "PIN_COUNTY", args: { countyFips: item.fips } })}>
                <span>{item.name}</span><span>{item.fips}</span>
              </button>)}
            </div>
          </div>
          <p className="rail-footnote">Exploratory teaching prototype.<br />Not for emergency operations.</p>
        </aside>

        <section className="map-workspace" aria-label="Map navigation">
          <div className="map-heading"><span className="map-crosshair" aria-hidden="true">+</span><div><h2>{scene === "earth" ? "A global view. A bounded study." : "Houston Gulf Coast"}</h2><p>{scene === "earth" ? "Navigate Earth, then open the Houston example." : "Three schematic county shapes · demonstration only"}</p></div></div>
          <div className="map-controls">
            <button onClick={() => dispatch({ action: "VIEW_EARTH", args: {} })}>View Earth</button>
            <button aria-pressed={rotating} onClick={() => dispatch({ action: "SET_ROTATION", args: { rotating: !rotating } })}>{rotating ? "Pause orbit" : "Start orbit"}</button>
          </div>
          <div className="map-legend"><span className="legend-title">{isOffline ? "Example severity index" : "Conditional severity"}</span>{isOffline ? <div className="legend-items"><span><i className="swatch low" />1 · Lower</span><span><i className="swatch medium" />2 · Middle</span><span><i className="swatch high" />3 · Higher</span></div> : <div className="legend-items"><span><i className="swatch low" />Selected region · value in inspector</span></div>}<p>{isOffline ? "Invented fixture values · no outage probabilities" : "See model metadata for target units and validation."}</p></div>
          <div className="map-disclaimer">{isOffline ? "DEMO DATA" : "MODEL ESTIMATE"}<span>{isOffline ? "Illustrative values and geometry" : "Conditional on selected archive hours"}</span></div>
        </section>

        <aside className="evidence-rail" aria-label="County evidence inspector">
          <div className="inspector-heading"><span className="pin-mark" aria-hidden="true">⌖</span><span>County notebook</span></div>
          <h2>{county.name}<span>County, Texas</span></h2>
          <div className="county-id">FIPS <span>{county.fips}</span><span className="pinned-label">Pinned</span></div>
          <section className="evidence-section">
            <h3>{isOffline ? "Example severity" : "Modeled outage severity"}</h3>
            <div className="severity-readout"><span>{prediction?.predictedSeverity ?? "—"}</span><span>{isOffline ? "/ 3" : prediction?.severityUnit}</span></div>
            <p className="evidence-note">{isOffline ? "An invented index to exercise the interface. It is not a measured outage or a trained estimate." : "Severity conditional on selected positive-outage/warning hours. Not a probability of any outage."}</p>
          </section>
          <section className="evidence-section">
            <h3>Data & method</h3>
            <dl className="metadata-list"><div><dt>Mode</dt><dd>{isOffline ? "Offline example" : "Trained conditional"}</dd></div><div><dt>Model</dt><dd>{isOffline ? "Not trained" : prediction?.modelVersion}</dd></div><div><dt>Geometry</dt><dd>Schematic polygons</dd></div><div><dt>Scope</dt><dd>County-level severity only</dd></div></dl>
          </section>
          <section className="evidence-section source-section"><h3>Provenance</h3><p>{isOffline ? "Project-generated fixture. No observed weather or outage records." : prediction?.sourceIds.join(", ")}</p><p>Base globe: Natural Earth II via CesiumJS. Public-domain cartography.</p><details><summary>Read limitations</summary><p>{evaluation.disclaimers.join(" ")}</p><p>No asset failures, flood depths, or safety recommendations are inferred from the map.</p><p>Source IDs: {prediction?.sourceIds.join(", ") || "Project fixture"}</p></details></section>
        </aside>
      </main>

      <footer className="simulation-strip">
        <div className="strip-context"><span className="strip-label">Fixture timestamp</span><time dateTime={scenario.selection.eventTimeUtc}>01 Jan 2024 <span>00:00 UTC</span></time><span className="small-copy">Example time, not an observed warning.</span></div>
        <div className="strip-description"><strong>{isOffline ? "An honest starting point." : "Inspect the scope before comparing."}</strong><p>{isOffline ? "Explore the interface with fixed sample data. The model, network and voice workstreams connect here next." : "This estimate applies only to the archive’s selected positive-outage and warning hours."}</p><span className="connection-status" role="status">{analysis.isPending ? "Checking API…" : analysis.data?.message ?? "Bundled offline example · no API required"}</span></div>
        <button className="run-button" disabled={analysis.isPending} onClick={() => { launchHouston(); analysis.mutate(scenario); }}>{analysis.isPending ? "Loading example…" : "Run example"}<span aria-hidden="true">→</span></button>
      </footer>
    </div>
  );
}
