import { create } from "zustand";
import {
  ASSUMPTION_LIMITS, FLOOD_RADIUS_LIMITS, HOUSTON_BOOKMARKS, HOUSTON_ROADS,
  SEED_SCENARIO, TRACK_POINT_LIMITS, clamp, clampPoint, isFinitePoint,
  type AtlasMode, type AtlasSnapshot, type BookmarkId, type EditorTool,
  type Point, type ScenarioAssumptions,
} from "../atlas/domain";

export interface AtlasState extends AtlasSnapshot {
  /** Changes on scenario edits, scrubs, undo and reset; reject stale AI proposals. */
  version: number;
  tool: EditorTool;
  playing: boolean;
  comparison: boolean;
  selectedRoadId: string | null;
  bookmark: BookmarkId;
  cameraRevision: number;
  history: AtlasSnapshot[];
  setMode: (mode: AtlasMode) => void;
  setTool: (tool: EditorTool) => void;
  setTrack: (track: Point[]) => void;
  moveTrackPoint: (index: number, point: Point) => void;
  setFlood: (center: Point, radiusKm?: number) => void;
  setProgress: (progress: number) => void;
  setPlaying: (playing: boolean) => void;
  selectRoad: (id: string | null) => void;
  toggleClosure: (id: string) => void;
  setComparison: (comparison: boolean) => void;
  flyTo: (bookmark: BookmarkId) => void;
  setAssumption: (key: keyof ScenarioAssumptions, value: number) => void;
  undo: () => void;
  reset: () => void;
}

export function snapshotOf(state: AtlasSnapshot): AtlasSnapshot {
  return structuredClone({
    mode: state.mode, track: state.track, floodCenter: state.floodCenter,
    floodRadiusKm: state.floodRadiusKm, progress: state.progress,
    closedRoadIds: state.closedRoadIds, assumptions: state.assumptions,
  });
}
const roadIds = new Set(HOUSTON_ROADS.map((road) => road.id));
const sameSnapshot = (a: AtlasSnapshot, b: AtlasSnapshot) => JSON.stringify(a) === JSON.stringify(b);

/** One history entry per completed map drag or explicit scenario control edit. */
function edit(state: AtlasState, next: AtlasSnapshot): Partial<AtlasState> | AtlasState {
  if (sameSnapshot(snapshotOf(state), next)) return state;
  return {
    ...next, history: [...state.history, snapshotOf(state)].slice(-40),
    version: state.version + 1, playing: false,
  };
}

export const useAtlasStore = create<AtlasState>((set, get) => ({
  ...structuredClone(SEED_SCENARIO),
  version: 1, tool: "inspect", playing: false, comparison: true,
  selectedRoadId: "channel-bridge", bookmark: "houston", cameraRevision: 0, history: [],
  setMode: (mode) => {
    if (mode !== "hurricane" && mode !== "flood") return;
    set((state) => ({ ...edit(state, { ...snapshotOf(state), mode }), tool: "inspect" }));
  },
  setTool: (tool) => {
    if (["inspect", "track", "flood", "closure"].includes(tool)) set({ tool });
  },
  setTrack: (track) => {
    if (track.length < TRACK_POINT_LIMITS.min || track.length > TRACK_POINT_LIMITS.max || !track.every(isFinitePoint)) return;
    const bounded = track.map(clampPoint);
    set((state) => edit(state, { ...snapshotOf(state), track: bounded }));
  },
  moveTrackPoint: (index, point) => {
    if (!Number.isInteger(index) || index < 0 || index >= get().track.length || !isFinitePoint(point)) return;
    get().setTrack(get().track.map((existing, position) => position === index ? point : existing));
  },
  setFlood: (center, radiusKm = get().floodRadiusKm) => {
    if (!isFinitePoint(center) || !Number.isFinite(radiusKm)) return;
    const boundedCenter = clampPoint(center);
    const boundedRadius = clamp(radiusKm, FLOOD_RADIUS_LIMITS.min, FLOOD_RADIUS_LIMITS.max);
    set((state) => edit(state, { ...snapshotOf(state), floodCenter: boundedCenter, floodRadiusKm: boundedRadius }));
  },
  setProgress: (progress) => {
    if (!Number.isFinite(progress)) return;
    set((state) => {
      const bounded = clamp(progress, 0, 1);
      return bounded === state.progress ? state : { progress: bounded, version: state.version + 1 };
    });
  },
  setPlaying: (playing) => set((state) => playing && state.progress >= 1
    ? { playing: true, progress: 0, version: state.version + 1 }
    : { playing }),
  selectRoad: (id) => {
    if (id === null || roadIds.has(id)) set({ selectedRoadId: id });
  },
  toggleClosure: (id) => {
    if (!roadIds.has(id)) return;
    set((state) => ({
      ...edit(state, { ...snapshotOf(state), closedRoadIds: state.closedRoadIds.includes(id)
        ? state.closedRoadIds.filter((closed) => closed !== id) : [...state.closedRoadIds, id] }),
      selectedRoadId: id,
    }));
  },
  setComparison: (comparison) => set({ comparison }),
  flyTo: (bookmark) => {
    if (Object.hasOwn(HOUSTON_BOOKMARKS, bookmark)) {
      set((state) => ({ bookmark, cameraRevision: state.cameraRevision + 1 }));
    }
  },
  setAssumption: (key, value) => {
    if (!Number.isFinite(value) || !Object.hasOwn(ASSUMPTION_LIMITS, key)) return;
    const { min, max, step } = ASSUMPTION_LIMITS[key];
    const bounded = clamp(Math.round(value / step) * step, min, max);
    set((state) => edit(state, { ...snapshotOf(state), assumptions: { ...state.assumptions, [key]: bounded } }));
  },
  undo: () => set((state) => {
    const previous = state.history.at(-1);
    if (!previous) return state;
    return { ...structuredClone(previous), history: state.history.slice(0, -1), version: state.version + 1, playing: false };
  }),
  reset: () => set((state) => ({
    ...structuredClone(SEED_SCENARIO), version: state.version + 1, history: [], playing: false,
    tool: "inspect", selectedRoadId: "channel-bridge", comparison: true, bookmark: "houston",
    cameraRevision: state.cameraRevision + 1,
  })),
}));
