import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { offlineEvaluation, offlineScenario, type Scenario } from "@earthlab/contracts";
import {
  BASELINE,
  HOUSTON_ROADS,
  HOUSTON_BOOKMARKS,
  analyzeRoadNetwork,
  deriveAtlas,
  type BookmarkId,
  type EditorTool,
  type Point,
} from "../atlas/domain";
import { evaluateScenario } from "../services/evaluation";
import { CommandBar } from "../features/assistant/CommandBar";
import { NetworkComparison } from "./NetworkComparison";
import { useAtlasStore } from "./store";
import { CountyEvidence, Comparison, RoadInspector } from "./Evidence";
import { ScenarioRail, type Layers } from "./ScenarioRail";
import { Icon } from "./Icon";
import { Timeline } from "./FieldTools";
import { Sources } from "./Sources";

const Globe = lazy(() => import("../features/globe/Globe"));
const fallbackText = "ILLUSTRATIVE FLOOD EXTENT — NOT A FLOOD FORECAST";
const makeScenario = (version: number): Scenario => ({
  ...offlineScenario,
  scenarioVersion: version,
});

export function App({ onEarth }: { onEarth?: () => void } = {}) {
  const s = useAtlasStore();
  const hurricane = s.mode === "hurricane";
  const [layers, setLayers] = useState<Layers>({
    hazard: true,
    roads: true,
    outages: false,
  });
  const [sources, setSources] = useState(false);
  const [legend, setLegend] = useState(false);
  const [countyOpen, setCountyOpen] = useState(false);
  const [drawer, setDrawer] = useState<"editor" | "evidence" | null>(null);
  const [mapNotice, setMapNotice] = useState("");
  const editorPane = useRef<HTMLDivElement>(null);
  const evidencePane = useRef<HTMLElement>(null);
  useEffect(() => {
    if (drawer === "editor") editorPane.current?.scrollTo(0, 0);
    else if (drawer === "evidence") evidencePane.current?.scrollTo(0, 0);
  }, [drawer, countyOpen, s.comparison]);
  // Keep static road entities in place while the storm moves.
  const network = useMemo(() => analyzeRoadNetwork(s.closedRoadIds), [s.closedRoadIds]);
  const current = useMemo(
    () => deriveAtlas(s, network),
    [s.mode, s.track, s.progress, s.floodRadiusKm, s.floodCenter, network, s.assumptions],
  );
  const base = useMemo(
    () => deriveAtlas({ ...BASELINE, mode: s.mode, progress: s.progress }),
    [s.mode, s.progress],
  );
  const scenario = useMemo(() => makeScenario(s.version), [s.version]);
  // Local trajectory and footprint edits do not change the historical model input.
  const evaluationQuery = useQuery({
    queryKey: ["houston-county-evaluation", offlineScenario.presetEventId],
    queryFn: ({ signal }) => evaluateScenario(offlineScenario, fetch, undefined, signal),
    enabled: layers.outages || s.comparison || countyOpen,
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });
  const evaluation = evaluationQuery.data?.evaluation ?? offlineEvaluation;
  const countyStatus =
    evaluationQuery.data?.message ??
    (evaluationQuery.isError
      ? "Service rejected the request · showing the bundled example"
      : "Checking county service · showing the bundled example");
  function layer(id: keyof Layers, value: boolean) {
    setLayers((old) => ({ ...old, [id]: value }));
    if (id === "outages") {
      setCountyOpen(value);
      if (value) {
        setDrawer("evidence");
        s.setComparison(false);
      }
    }
  }
  useEffect(() => {
    if (!s.playing) return;
    const start = performance.now();
    const offset = useAtlasStore.getState().progress;
    const timer = window.setInterval(() => {
      const p = Math.min(1, offset + (performance.now() - start) / 24_000);
      useAtlasStore.getState().setProgress(p);
      if (p === 1) useAtlasStore.getState().setPlaying(false);
    }, 100);
    return () => window.clearInterval(timer);
  }, [s.playing]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sources) {
        useAtlasStore.getState().setTool("inspect");
        setDrawer(null);
        setLegend(false);
        return;
      }
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        sources ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)))
      )
        return;
      const id = (
        {
          h: "houston",
          "1": "downtown",
          "2": "bayou",
          "3": "channel",
        } as Record<string, BookmarkId>
      )[e.key.toLowerCase()];
      if (id) {
        e.preventDefault();
        useAtlasStore.getState().flyTo(id);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [sources]);
  function selectTool(tool: EditorTool) {
    s.setPlaying(false);
    s.setTool(tool);
    setMapNotice("");
    if (tool === "track" || tool === "flood") layer("hazard", true);
    if (tool === "closure" || tool === "inspect") layer("roads", true);
  }
  function mapPoint(p: Point) {
    if (s.tool === "track") {
      if (s.track.length >= 8)
        return setMapNotice(
          "Track has eight waypoints. Move a handle or remove one in the coordinate editor.",
        );
      s.setTrack([...s.track, p]);
    } else if (s.tool === "flood") s.setFlood(p, s.floodRadiusKm);
  }
  function selectRoad(id: string) {
    s.selectRoad(id);
    setCountyOpen(false);
    if (s.tool === "closure") s.toggleClosure(id);
    else {
      s.setComparison(false);
      setDrawer("evidence");
    }
  }
  function compare(value: boolean) {
    s.setComparison(value);
    setCountyOpen(false);
    setDrawer("evidence");
  }
  const tools: {
    id: EditorTool;
    label: string;
    icon: "cursor" | "edit" | "closure";
  }[] = [
    { id: "inspect", label: "Inspect", icon: "cursor" },
    {
      id: hurricane ? "track" : "flood",
      label: hurricane ? "Edit track" : "Edit footprint",
      icon: "edit",
    },
    { id: "closure", label: "Close roads", icon: "closure" },
  ];
  const instructions: Record<EditorTool, string> = {
    inspect: "Select a road to inspect it.",
    closure: "Select a sample road to toggle a closure.",
    track: "Click to add a waypoint. Drag a numbered handle to move it.",
    flood: "Click to place the footprint. Drag its edge to resize.",
  };
  return (
    <div className={`atlas-shell ${hurricane ? "storm-mode" : "flood-mode"} ${legend ? "legend-open" : ""}`}>
      <a className="skip" href="#atlas-map" onClick={(event) => {
        event.preventDefault();
        setDrawer(null);
        requestAnimationFrame(() => document.getElementById("atlas-map")?.focus());
      }}>
        Skip to map
      </a>
      <header className="mast">
        <div className="brand">
          <Icon name="atlas" size={34} />
          <b>EarthLab</b>
        </div>
        <span className="brand-divider" />
        <h1 className="product-title">Disaster Atlas</h1>
        <div className="header-end">
          {onEarth && <button className="earth-link" onClick={onEarth} aria-label="Open Earth view">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z" /></svg>
            Earth
          </button>}
          <span className="study-location">
            <Icon name="pin" size={14} />
            Houston, TX
          </span>
          <span className="demo-status">
            <i />
            Offline demo
          </span>
          <button onClick={() => setSources(true)}>
            <Icon name="book" size={15} />
            Sources
          </button>
        </div>
      </header>
      <div className="mobile-switch">
        <button
          onClick={() => setDrawer(drawer === "editor" ? null : "editor")}
          aria-expanded={drawer === "editor"}
        >
          <Icon name="layers" />
          Scenario editor
        </button>
        <button
          onClick={() => {
            s.setComparison(false);
            setCountyOpen(false);
            setDrawer(drawer === "evidence" ? null : "evidence");
          }}
          aria-expanded={drawer === "evidence"}
        >
          <Icon name="road" />
          Road inspector
        </button>
      </div>
      <main className="workbench">
        {drawer && <button type="button" className="drawer-backdrop" aria-label="Close open panel" tabIndex={-1} onClick={() => setDrawer(null)} />}
        <div ref={editorPane} className={`rail-slot ${drawer === "editor" ? "drawer-open" : ""}`}>
          <button
            className="drawer-close"
            onClick={() => setDrawer(null)}
            aria-label="Close editor"
          >
            <Icon name="close" />
          </button>
          <ScenarioRail
            layers={layers}
            onLayer={layer}
            inspectMode={() => {
              setCountyOpen(false);
              setMapNotice("");
              setDrawer(null);
              s.setComparison(false);
            }}
          />
        </div>
        <div className="center-stack">
          <section
            className="map-frame"
            id="atlas-map"
            tabIndex={-1}
            aria-label="Houston scenario map"
          >
            <Suspense fallback={<div className="map-loading">Loading the Houston map…</div>}>
              <Globe
                roads={HOUSTON_ROADS}
                track={s.track}
                stormPosition={current.stormPosition}
                floodCenter={s.floodCenter}
                floodRadiusKm={s.floodRadiusKm}
                currentFloodRadiusKm={current.currentFloodRadiusKm}
                progress={s.progress}
                mode={s.mode}
                selectedRoadId={s.selectedRoadId}
                closedRoadIds={s.closedRoadIds}
                disconnectedRoadIds={current.network.disconnectedRoadIds}
                comparison={s.comparison}
                tool={s.tool}
                bookmark={s.bookmark}
                cameraRevision={s.cameraRevision}
                showRoads={layers.roads}
                showFlood={layers.hazard}
                countyPredictions={layers.outages ? evaluation.predictions : undefined}
                baselineTrack={BASELINE.track}
                baselineFloodCenter={BASELINE.floodCenter}
                baselineFloodRadiusKm={base.currentFloodRadiusKm}
                onRoadSelect={selectRoad}
                onTrackChange={s.setTrack}
                onFloodChange={s.setFlood}
                onMapPoint={mapPoint}
              />
            </Suspense>
            <div className="map-top">
              <div className="map-title">
                <div className="map-eyebrow">
                  <span /> Texas Gulf Coast
                </div>
                <label>
                  <select
                    aria-label="Camera bookmark"
                    value={s.bookmark}
                    onChange={(e) => s.flyTo(e.target.value as BookmarkId)}
                  >
                    {Object.entries(HOUSTON_BOOKMARKS).map(([id, { label: name }]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <Icon name="down" size={15} />
                </label>
                <button
                  className="view-reset"
                  title="Reset view to Greater Houston (H)"
                  aria-label="Reset view to Greater Houston"
                  onClick={() => s.flyTo("houston")}
                >
                  <Icon name="reset" size={14} />
                </button>
              </div>
              <div className="map-toolbar" role="group" aria-label="Map tools">
                {tools.map((t) => (
                  <button
                    key={t.id}
                    aria-label={t.label}
                    aria-pressed={s.tool === t.id}
                    onClick={() => selectTool(t.id)}
                    title={t.label}
                  >
                    <Icon name={t.icon} size={16} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="map-bottom">
              <div className="hazard-stamp">
                <i />
                {hurricane ? "Hypothetical storm track" : fallbackText}
              </div>
              <div className="legend-container">
                <button aria-expanded={legend} onClick={() => setLegend(!legend)}>
                  <Icon name="layers" size={14} />
                  Legend
                  <Icon name="down" size={12} />
                </button>
                {legend && (
                  <div className="legend-body">
                    <span>
                      <i className="line-key hazard" />
                      {hurricane ? "Manual track · 6 km inspection radius" : fallbackText}
                    </span>
                    <span>
                      <i className="line-key road" />
                      Curated road · unknown condition
                    </span>
                    <span>
                      <i className="line-key closure" />
                      Hypothetical closure
                    </span>
                    <span>
                      <i className="line-key isolated" />
                      Disconnected sample link
                    </span>
                    {s.comparison && (
                      <span>
                        <i className="line-key base" />
                        Seed geometry · baseline
                      </span>
                    )}
                    {layers.outages && (
                      <span>
                        <i className="line-key county" />
                        Schematic county ·{" "}
                        {evaluation.modelMetadata.dataMode === "offline_example"
                          ? "example index"
                          : "conditional model"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
          <div className="tool-hint" role="status">
            <Icon name={s.tool === "inspect" ? "cursor" : "edit"} size={13} />
            {mapNotice || instructions[s.tool]}
          </div>
          <Timeline
            progress={s.progress}
            playing={s.playing}
            duration={s.assumptions.durationHours}
            onScrub={(p) => {
              s.setPlaying(false);
              s.setProgress(p);
            }}
            onPlay={() => {
              if (!s.playing && s.progress >= 1) s.setProgress(0);
              s.setPlaying(!s.playing);
            }}
          />
          <button
            className="comparison-strip"
            onClick={() => compare(!s.comparison)}
            aria-expanded={s.comparison}
          >
            <span>
              <Icon name="compare" size={16} />
              Baseline vs alternative
            </span>
            <span className="compare-count">
              Connected components{" "}
              <b>
                {base.network.connectedComponents} → {current.network.connectedComponents}
              </b>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <aside
          ref={evidencePane}
          className={`inspector-slot ${drawer === "evidence" ? "drawer-open" : ""}`}
          aria-label="Evidence"
        >
          <button
            className="drawer-close"
            aria-label="Close inspector"
            onClick={() => setDrawer(null)}
          >
            <Icon name="close" />
          </button>
          <div className="evidence-tabs">
            <button aria-pressed={!s.comparison} onClick={() => compare(false)}>
              Inspector
            </button>
            <button aria-pressed={s.comparison} onClick={() => compare(true)}>
              Comparison
            </button>
          </div>
          {s.comparison ? (
            <Comparison current={current} evaluation={evaluation} serviceStatus={countyStatus}>
              <NetworkComparison />
            </Comparison>
          ) : countyOpen ? (
            <div className="notebook">
              <CountyEvidence evaluation={evaluation} serviceStatus={countyStatus} />
              <button className="closure-button" onClick={() => setCountyOpen(false)}>
                Return to road inspector
              </button>
            </div>
          ) : (
            <RoadInspector current={current} onSources={() => setSources(true)} />
          )}
        </aside>
      </main>
      <footer className="command-base">
        <CommandBar
          scenario={scenario}
          getCurrentScenario={() => makeScenario(useAtlasStore.getState().version)}
          capabilities={{
            presetEventIds: [],
            overlayIds: ["roads", "hazard", "outages"],
            canRunAnalysis: true,
            canExplain: false,
          }}
          onCommand={async (cmd) => {
            switch (cmd.action) {
              case "SELECT_REGION":
                useAtlasStore.getState().flyTo("houston");
                return;
              case "RUN_ANALYSIS":
                await evaluationQuery.refetch();
                layer("outages", true);
                return;
              case "TOGGLE_OVERLAY":
                layer(cmd.args.overlayId as keyof Layers, cmd.args.visible);
                return;
              default:
                throw new Error("This command is unavailable in the atlas.");
            }
          }}
        />
      </footer>
      {sources && <Sources onClose={() => setSources(false)} />}
    </div>
  );
}
