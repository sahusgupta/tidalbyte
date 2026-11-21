import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { offlineEvaluation, offlineScenario, type Scenario } from "@earthlab/contracts";
import {
  BASELINE,
  HOUSTON_ROADS,
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
import {
  AtlasHeader,
  AtlasTools,
  Notebook,
  NotebookTabs,
  useCompactAtlas,
  type NotebookPage,
} from "./AtlasChrome";

const Globe = lazy(() => import("../features/globe/Globe"));
const floodLabel = "Illustrative flood extent · not a flood forecast";
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
  const [bookPage, setBookPage] = useState<NotebookPage>("scenario");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [mapNotice, setMapNotice] = useState("");
  const compact = useCompactAtlas();
  const askTrigger = useRef<HTMLElement | null>(null);
  const legendPanel = useRef<HTMLDivElement>(null);
  const displayedPage = s.comparison ? "compare" : bookPage;
  const openPage = (page: NotebookPage) => {
    s.setComparison(page === "compare");
    setBookPage(page === "compare" ? "scenario" : page);
    setLegend(false);
    setSheetOpen(compact);
  };
  useEffect(() => {
    if (!compact) setSheetOpen(false);
  }, [compact]);
  useEffect(() => {
    if (!legend) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !legendPanel.current?.contains(event.target))
        setLegend(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [legend]);
  useEffect(() => {
    if (asking) document.getElementById("atlas-command-input")?.focus();
  }, [asking]);
  function closeAsk() {
    setAsking(false);
    askTrigger.current?.focus();
  }
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
        openPage("inspector");
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
      if (sources || sheetOpen) return;
      if (e.key === "Escape") {
        if (asking) {
          closeAsk();
          return;
        }
        if (legend) {
          setLegend(false);
          return;
        }
        useAtlasStore.getState().setTool("inspect");
        return;
      }
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        asking ||
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
  }, [sources, asking, sheetOpen, legend]);
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
      openPage("inspector");
    }
  }
  const instructions: Partial<Record<EditorTool, string>> = {
    closure: "Select a sample road to add or remove a closure",
    track: "Add a waypoint on the map or drag one to move it",
    flood: "Place the center on the map or drag the edge to resize",
  };
  const hint = mapNotice || instructions[s.tool];
  const book = (
    <Notebook
      compact={compact}
      open={sheetOpen}
      page={displayedPage}
      onSelect={openPage}
      onDismiss={() => setSheetOpen(false)}
    >
      <div hidden={displayedPage !== "scenario"}>
        <ScenarioRail
          layers={layers}
          onLayer={layer}
          inspectMode={() => {
            setCountyOpen(false);
            setMapNotice("");
            s.setComparison(false);
            setBookPage("scenario");
          }}
        />
      </div>
      {displayedPage === "inspector" &&
        (countyOpen ? (
          <div className="notebook county-page">
            <CountyEvidence evaluation={evaluation} serviceStatus={countyStatus} />
            <button className="closure-button" onClick={() => setCountyOpen(false)}>
              Return to road inspector
            </button>
          </div>
        ) : (
          <RoadInspector current={current} onSources={() => setSources(true)} />
        ))}
      {displayedPage === "compare" && (
        <Comparison current={current} evaluation={evaluation} serviceStatus={countyStatus}>
          <NetworkComparison />
        </Comparison>
      )}
    </Notebook>
  );
  return (
    <div className={`atlas-shell ${hurricane ? "storm-mode" : "flood-mode"}`}>
      <a
        className="skip"
        href="#atlas-map"
        onClick={(event) => {
          event.preventDefault();
          setSheetOpen(false);
          document.getElementById("atlas-map")?.focus();
        }}
      >
        Skip to map
      </a>
      <AtlasHeader
        onEarth={onEarth}
        onSources={() => setSources(true)}
        asking={asking}
        onAsk={() => {
          if (asking) closeAsk();
          else {
            askTrigger.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            setLegend(false);
            setAsking(true);
          }
        }}
      />
      <main className="atlas-spread">
        {book}
        <div className="map-sheet">
          <AtlasTools
            bookmark={s.bookmark}
            onBookmark={s.flyTo}
            tool={s.tool}
            onTool={selectTool}
            hurricane={hurricane}
          />
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
            {hint && (
              <div className="atlas-map-hint" role="status">
                {hint}
              </div>
            )}
          </section>
          <div className="plate-notes">
            <span className="scenario-caption">
              <i className="waypoint-key" aria-hidden="true" />
              {hurricane ? "Hypothetical storm track" : floodLabel}
            </span>
            <div className="map-key" ref={legendPanel}>
              <button
                type="button"
                aria-expanded={legend}
                aria-controls="atlas-legend"
                onClick={() => setLegend(!legend)}
              >
                <Icon name="layers" size={16} />
                Legend
                <Icon name="down" size={12} />
              </button>
              {legend && (
                <div id="atlas-legend" className="map-key-panel">
                  <h3>Map legend</h3>
                  <ul>
                    <li>
                      <i className="line-key hazard" />
                      {hurricane ? "Drawn track and 6 km inspection radius" : floodLabel}
                    </li>
                    <li>
                      <i className="line-key road" />
                      Sample road · condition unknown
                    </li>
                    <li>
                      <i className="line-key closure" />
                      Assumed closure
                    </li>
                    <li>
                      <i className="line-key isolated" />
                      Disconnected sample link
                    </li>
                    {s.comparison && (
                      <li>
                        <i className="line-key base" />
                        Original scenario geometry
                      </li>
                    )}
                    {layers.outages && (
                      <li>
                        <i className="line-key county" />
                        Schematic county ·{" "}
                        {evaluation.modelMetadata.dataMode === "offline_example"
                          ? "offline example index"
                          : "conditional model"}
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
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
        </div>
      </main>
      {compact && <NotebookTabs page={sheetOpen ? displayedPage : null} onSelect={openPage} dock />}
      {asking && (
        <section role="dialog" aria-labelledby="atlas-ask-title" className="atlas-ask-panel">
          <div className="ask-heading">
            <h2 id="atlas-ask-title">Ask the atlas</h2>
            <button aria-label="Close Ask the atlas" onClick={closeAsk}>
              <Icon name="close" />
            </button>
          </div>
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
        </section>
      )}
      {sources && <Sources onClose={() => setSources(false)} />}
    </div>
  );
}
