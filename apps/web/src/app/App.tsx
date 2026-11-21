import { lazy, Suspense, useEffect, useMemo, useState } from "react";
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
import { snapshotOf, useAtlasStore } from "./store";
import { CountyEvidence, Comparison, RoadInspector } from "./Evidence";
import { ScenarioRail, type Layers } from "./ScenarioRail";
import { Icon } from "./Icon";
import { Timeline } from "./FieldTools";
import { Sources } from "./Sources";
import { AtlasHeader, AtlasTools, StudyDialog, StudyMenu, type StudyPage } from "./AtlasChrome";
import { MapLayers } from "./MapLayers";
import { downloadStudy } from "../atlas/exportStudy";

const LiveWeather = lazy(() => import("../features/weather/LiveWeather"));
const Globe = lazy(() => import("../features/globe/Globe"));
const initialLayers: Layers = { hazard: true, roads: true, outages: false };
const makeScenario = (version: number): Scenario => ({
  ...offlineScenario,
  scenarioVersion: version,
});
const instructions: Partial<Record<EditorTool, string>> = {
  closure: "Select a road to change its closure",
  track: "Tap to add a waypoint or drag one to move it",
  flood: "Place the center or drag the edge to resize",
};

export function App({
  onEarth,
  onSimulator,
}: {
  onEarth?: () => void;
  onSimulator?: () => void;
} = {}) {
  const s = useAtlasStore();
  const hurricane = s.mode === "hurricane";
  const [weatherOpen, setWeatherOpen] = useState(false);
  const [layers, setLayers] = useState<Layers>(initialLayers);
  const [mapStyle, setMapStyle] = useState<"field" | "aerial">("field");
  const [pages, setPages] = useState<StudyPage[]>([]);
  const page = pages.at(-1) ?? null;
  const [mapNotice, setMapNotice] = useState("");
  const focusMap = () => document.getElementById("atlas-map")?.focus({ preventScroll: true });
  function openPage(next: StudyPage | null) {
    if (next && s.playing) s.setPlaying(false);
    s.setComparison(next === "compare");
    setPages((previous) =>
      next === null ? [] : previous.at(-1) === next ? previous : [...previous, next],
    );
  }
  function goBack() {
    s.setComparison(pages.at(-2) === "compare");
    setPages((previous) => previous.slice(0, -1));
  }
  function closeToMap() {
    openPage(null);
    requestAnimationFrame(focusMap);
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
    enabled: layers.outages || page === "compare" || page === "county",
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
      if (weatherOpen || page || e.defaultPrevented) return;
      if (e.key === "Escape") {
        setMapNotice("");
        useAtlasStore.getState().setTool("inspect");
        return;
      }
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
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
  }, [page, weatherOpen]);
  function selectTool(tool: EditorTool) {
    s.setPlaying(false);
    if (tool === "track" && !hurricane) s.setMode("hurricane");
    if (tool === "flood" && hurricane) s.setMode("flood");
    s.setTool(tool);
    setMapNotice("");
    if (tool === "track" || tool === "flood") layer("hazard", true);
    if (tool === "inspect" || tool === "closure") layer("roads", true);
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
    if (s.tool === "closure") s.toggleClosure(id);
    else openPage("inspector");
  }
  if (weatherOpen) {
    return (
      <Suspense fallback={<div className="map-loading" role="status">Loading live weather…</div>}>
        <LiveWeather initialLocation={s.bookmark} onBack={() => setWeatherOpen(false)} />
      </Suspense>
    );
  }
  const hint = mapNotice || instructions[s.tool];
  return (
    <div className={`atlas-shell ${hurricane ? "storm-mode" : "flood-mode"}`}>
      <a
        className="skip"
        href="#atlas-map"
        onClick={(e) => {
          e.preventDefault();
          focusMap();
        }}
      >
        Skip to map
      </a>
      <AtlasHeader hurricane={hurricane} onOpen={openPage} />
      <main className="map-frame" id="atlas-map" tabIndex={-1} aria-label="Houston scenario map">
        <Suspense fallback={<div className="map-loading">Loading the Houston map…</div>}>
          <Globe
            mapStyle={mapStyle}
            onResetView={() => s.flyTo("houston")}
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
        <AtlasTools tool={s.tool} onTool={selectTool} bookmark={s.bookmark} onBookmark={s.flyTo} />
        {hint && (
          <div className="field-map-hint">
            <span role="status">{hint}</span>
            <button onClick={() => selectTool("inspect")}>Done</button>
          </div>
        )}
      </main>
      <footer className="field-foot">
        <Timeline
          caption={hurricane ? "Hypothetical storm" : "Illustrative flood"}
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
          className="foot-command"
          onClick={() => openPage("ask")}
          aria-haspopup="dialog"
          aria-label="Ask the atlas"
        >
          <Icon name="ask" size={18} />
          <span>Ask the atlas</span>
        </button>
      </footer>
      {page && (
        <StudyDialog
          page={page}
          onBack={pages.length > 1 ? goBack : undefined}
          onClose={() => openPage(null)}
        >
          {page === "study" && (
            <StudyMenu
              onOpen={openPage}
              onEarth={onEarth}
              onSimulator={onSimulator}
              onExport={() => downloadStudy(snapshotOf(s))}
            />
          )}
          {page === "scenario" && (
            <ScenarioRail
              onLiveWeather={() => setWeatherOpen(true)}
              onEnsureHazard={() => layer("hazard", true)}
              onResetLayers={() => setLayers(initialLayers)}
              inspectMode={() => setMapNotice("")}
              onEditMap={() => {
                selectTool(hurricane ? "track" : "flood");
                closeToMap();
              }}
            />
          )}
          {page === "layers" && (
            <MapLayers
              layers={layers}
              hurricane={hurricane}
              mapStyle={mapStyle}
              onStyle={setMapStyle}
              setLayer={layer}
              offline={evaluation.modelMetadata.dataMode === "offline_example"}
              onCounty={() => openPage("county")}
              onSources={() => openPage("sources")}
            />
          )}
          {page === "sources" && <Sources />}
          {page === "county" && (
            <div className="notebook-page county-page">
              <CountyEvidence evaluation={evaluation} serviceStatus={countyStatus} />
            </div>
          )}
          {page === "inspector" && (
            <RoadInspector current={current} onSources={() => openPage("sources")} />
          )}
          {page === "compare" && (
            <Comparison current={current} evaluation={evaluation} serviceStatus={countyStatus}>
              <NetworkComparison />
            </Comparison>
          )}
          {page === "ask" && (
            <CommandBar
              scenario={scenario}
              getCurrentScenario={() => makeScenario(useAtlasStore.getState().version)}
              capabilities={{
                presetEventIds: [offlineScenario.presetEventId],
                overlayIds: ["roads", "hazard", "outages"],
                canRunAnalysis: true,
                canExplain: true,
              }}
              onCommand={async (cmd) => {
                switch (cmd.action) {
                  case "SELECT_REGION":
                    useAtlasStore.getState().flyTo("houston");
                    return;
                  case "SELECT_PRESET":
                    useAtlasStore.getState().flyTo("houston");
                    layer("outages", true);
                    openPage("county");
                    return;
                  case "EXPLAIN_RESULT":
                    openPage("county");
                    return;
                  case "RUN_ANALYSIS":
                    await evaluationQuery.refetch();
                    layer("outages", true);
                    openPage("county");
                    return;
                  case "TOGGLE_OVERLAY":
                    layer(cmd.args.overlayId as keyof Layers, cmd.args.visible);
                    return;
                  default:
                    throw new Error("This command is unavailable in the atlas.");
                }
              }}
            />
          )}
        </StudyDialog>
      )}
    </div>
  );
}
