import { offlineScenario, type CommandProposal } from "@earthlab/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  interpretText,
  transcribeAudio,
  validateProposal,
  type AssistantCapabilities,
} from "./assistant";

const capabilities: AssistantCapabilities = {
  presetEventIds: [offlineScenario.presetEventId],
  overlayIds: ["flood", "roads"],
  canRunAnalysis: true,
  canExplain: true,
};
const proposal = (changes: Partial<CommandProposal> = {}): CommandProposal => ({
  commandId: "command-1",
  scenarioVersion: offlineScenario.scenarioVersion,
  action: "TOGGLE_OVERLAY",
  args: { overlayId: "flood", visible: true },
  requiresConfirmation: false,
  ...changes,
});
const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      meta: {
        requestId: "test",
        mode: "offline_example",
        sourceIds: ["project:test"],
        warnings: [],
      },
      error: null,
    }),
  );

describe("backend proposal validation", () => {
  it("returns a typed proposal without dispatching any action", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ proposal: proposal(), clarifications: [] }));
    const result = await interpretText("Show the flood layer", offlineScenario, {
      fetcher,
      baseUrl: "http://test",
    });
    expect(result.interpretation.proposal?.action).toBe("TOGGLE_OVERLAY");
    expect(result.mode).toBe("offline_example");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      text: "Show the flood layer",
      scenarioSummary: offlineScenario,
    });
  });

  it("accepts only an exact supported overlay switch", () => {
    expect(
      validateProposal(proposal(), offlineScenario, offlineScenario, capabilities).action,
    ).toBe("TOGGLE_OVERLAY");
    expect(() =>
      validateProposal(
        proposal({ args: { overlayId: "flood", visible: true, url: "https://untrusted.example" } }),
        offlineScenario,
        offlineScenario,
        capabilities,
      ),
    ).toThrow("not supported");
    expect(() =>
      validateProposal(
        proposal({ args: { overlayId: "unknown", visible: true } }),
        offlineScenario,
        offlineScenario,
        capabilities,
      ),
    ).toThrow("not supported");
  });

  it("rechecks scenario version and full inputs at confirmation time", () => {
    expect(() =>
      validateProposal(
        proposal(),
        offlineScenario,
        { ...offlineScenario, scenarioVersion: 2 },
        capabilities,
      ),
    ).toThrow("scenario changed");
    const changed = structuredClone(offlineScenario);
    changed.selection.countyFips = ["48201"];
    expect(() => validateProposal(proposal(), offlineScenario, changed, capabilities)).toThrow(
      "scenario changed",
    );
  });

  it.each(["SET_PARAMETER", "COMPARE_INTERVENTION"] as const)(
    "refuses unsupported %s actions",
    (action) => {
      expect(() =>
        validateProposal(
          proposal({ action, args: {} }),
          offlineScenario,
          offlineScenario,
          capabilities,
        ),
      ).toThrow("not supported");
    },
  );

  it("only runs county analysis for historical unmodified inputs", () => {
    const command = proposal({ action: "RUN_ANALYSIS", args: {} });
    expect(validateProposal(command, offlineScenario, offlineScenario, capabilities).action).toBe(
      "RUN_ANALYSIS",
    );
    const scenario = {
      ...offlineScenario,
      modelMode: "exploratory_what_if" as const,
      perturbations: { rainfall: 50 },
    };
    expect(() => validateProposal(command, scenario, scenario, capabilities)).toThrow(
      "not supported",
    );
  });

  it("fails explicitly when Gemini is unavailable rather than parsing text locally", async () => {
    await expect(
      interpretText("Show flooding near Buffalo Bayou", offlineScenario, {
        fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")),
      }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("does not apply an ambiguous command", () => {
    expect(() =>
      validateProposal(
        proposal({ clarification: "Which layer?" }),
        offlineScenario,
        offlineScenario,
        capabilities,
      ),
    ).toThrow("Which layer?");
  });

  it("uploads actual audio as multipart and validates the returned transcript", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(envelope({ transcript: "Show the flood layer" }));
    expect(
      await transcribeAudio(new Blob(["audio-data"], { type: "audio/webm" }), { fetcher }),
    ).toBe("Show the flood layer");
    expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
    expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it("rejects empty audio and malformed transcripts", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(transcribeAudio(new Blob([]), { fetcher })).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(envelope({ transcript: "" }));
    await expect(transcribeAudio(new Blob(["audio"]), { fetcher })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
