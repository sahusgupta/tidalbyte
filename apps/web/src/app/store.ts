import { create } from "zustand";
import { offlineScenario, type Scenario } from "@earthlab/contracts";

export const counties = [
  { fips: "48201", name: "Harris", label: "Houston" },
  { fips: "48157", name: "Fort Bend", label: "Southwest" },
  { fips: "48039", name: "Brazoria", label: "Gulf coast" },
] as const;

type ConsoleCommand =
  | { action: "SELECT_PRESET"; args: { presetEventId: string } }
  | { action: "TOGGLE_OVERLAY"; args: { visible: boolean } }
  | { action: "PIN_COUNTY"; args: { countyFips: string } }
  | { action: "FLY_HOUSTON"; args: Record<string, never> }
  | { action: "VIEW_EARTH"; args: Record<string, never> }
  | { action: "SET_ROTATION"; args: { rotating: boolean } };

type ConsoleState = {
  scenario: Scenario;
  pinnedCounty: string;
  overlayVisible: boolean;
  scene: "earth" | "houston";
  sceneRevision: number;
  rotating: boolean;
  dispatch: (command: ConsoleCommand) => void;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const useConsoleStore = create<ConsoleState>((set) => ({
  scenario: structuredClone(offlineScenario),
  pinnedCounty: "48201",
  overlayVisible: true,
  scene: "earth",
  sceneRevision: 0,
  rotating: !prefersReducedMotion(),
  dispatch: (command) => set((state) => {
    switch (command.action) {
      case "SELECT_PRESET":
        if (command.args.presetEventId !== offlineScenario.presetEventId) return state;
        return { scenario: { ...structuredClone(offlineScenario), scenarioVersion: state.scenario.scenarioVersion + 1 } };
      case "TOGGLE_OVERLAY":
        return { overlayVisible: command.args.visible };
      case "PIN_COUNTY":
        return counties.some((county) => county.fips === command.args.countyFips)
          ? { pinnedCounty: command.args.countyFips }
          : state;
      case "FLY_HOUSTON":
        return { scene: "houston", sceneRevision: state.sceneRevision + 1, rotating: false };
      case "VIEW_EARTH":
        return { scene: "earth", sceneRevision: state.sceneRevision + 1 };
      case "SET_ROTATION":
        return { rotating: command.args.rotating, ...(command.args.rotating ? { scene: "earth" as const } : {}) };
    }
  }),
}));
