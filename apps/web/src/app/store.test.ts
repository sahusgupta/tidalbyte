import { describe, expect, it } from "vitest";
import { useConsoleStore } from "./store";

describe("console controller", () => {
  it("increments scenario version when a preset is applied", () => {
    const before = useConsoleStore.getState().scenario;
    useConsoleStore.getState().dispatch({ action: "SELECT_PRESET", args: { presetEventId: before.presetEventId } });
    expect(useConsoleStore.getState().scenario.scenarioVersion).toBe(before.scenarioVersion + 1);
  });

  it("rejects unknown county pins and stops orbit for Houston", () => {
    useConsoleStore.getState().dispatch({ action: "PIN_COUNTY", args: { countyFips: "99999" } });
    expect(useConsoleStore.getState().pinnedCounty).toBe("48201");
    useConsoleStore.getState().dispatch({ action: "FLY_HOUSTON", args: {} });
    expect(useConsoleStore.getState().scene).toBe("houston");
    expect(useConsoleStore.getState().rotating).toBe(false);
  });
});
