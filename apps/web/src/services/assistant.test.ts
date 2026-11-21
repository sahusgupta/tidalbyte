import { offlineScenario, type CommandProposal } from "@earthlab/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  interpretText,
  speakPlanSummary,
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
const envelope = (data: unknown, warnings: string[] = []) =>
  new Response(
    JSON.stringify({
      data,
      meta: {
        requestId: "test",
        mode: "offline_example",
        sourceIds: ["project:test"],
        warnings,
      },
      error: null,
    }),
  );

describe("backend proposal validation", () => {
  it("accepts only confirmed, bounded planning intents enabled by the host", () => {
    const caps = { ...capabilities, canPlan: true, selectedPlanningEdge: "link-a" };
    for (const intent of ["compare", "prioritize_hospitals", "assume_blocked", "explain"]) {
      const command = proposal({
        action: "COMPARE_INTERVENTION",
        args: { intent },
        requiresConfirmation: true,
      });
      expect(
        validateProposal(command, offlineScenario, offlineScenario, caps, "link-a").args,
      ).toEqual({ intent });
      expect(() =>
        validateProposal(command, offlineScenario, offlineScenario, capabilities),
      ).toThrow("not supported");
    }
    const resources = proposal({
      action: "COMPARE_INTERVENTION",
      args: { intent: "resources", totalBudget: 200, crewCapacity: 6 },
      requiresConfirmation: true,
    });
    expect(validateProposal(resources, offlineScenario, offlineScenario, caps).args).toEqual(
      resources.args,
    );
    for (const args of [
      { intent: "resources", totalBudget: 201, crewCapacity: 2 },
      { intent: "resources", totalBudget: 50.5, crewCapacity: 2 },
      { intent: "resources", totalBudget: true, crewCapacity: 2 },
      { intent: "resources", totalBudget: 50, crewCapacity: 7 },
      { intent: "compare", edgeId: "injected" },
      { intent: "unknown" },
    ])
      expect(() =>
        validateProposal({ ...resources, args }, offlineScenario, offlineScenario, caps),
      ).toThrow("not supported");
    expect(() =>
      validateProposal(
        { ...resources, requiresConfirmation: false },
        offlineScenario,
        offlineScenario,
        caps,
      ),
    ).toThrow("not supported");
  });

  it("binds assumed blockages to the selected planning link through confirmation", () => {
    const command = proposal({
      action: "COMPARE_INTERVENTION",
      args: { intent: "assume_blocked" },
      requiresConfirmation: true,
    });
    expect(() =>
      validateProposal(command, offlineScenario, offlineScenario, {
        ...capabilities,
        canPlan: true,
      }),
    ).toThrow("Select a planning link");
    expect(() =>
      validateProposal(
        command,
        offlineScenario,
        offlineScenario,
        { ...capabilities, canPlan: true, selectedPlanningEdge: "link-b" },
        "link-a",
      ),
    ).toThrow("selected planning link changed");
    expect(() =>
      validateProposal(
        command,
        offlineScenario,
        offlineScenario,
        { ...capabilities, canPlan: true, selectedPlanningEdge: "link-a" },
        null,
      ),
    ).toThrow("selected planning link changed");
  });

  it("requests bounded binary narration of supplied computed text and preserves unavailable errors", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Blob(["ID3-test"], { type: "audio/mpeg" })));
    expect((await speakPlanSummary("Computed plan: two links selected.", { fetcher })).type).toBe(
      "audio/mpeg",
    );
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      text: "Computed plan: two links selected.",
    });
    expect(String(fetcher.mock.calls[0][0])).toContain("/api/v1/voice/speak");
    for (const input of [" ", "x".repeat(2001)])
      await expect(speakPlanSummary(input, { fetcher })).rejects.toMatchObject({
        code: "unsupported",
      });
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Speech narration is not configured." } }), {
        status: 503,
      }),
    );
    await expect(speakPlanSummary("Computed text", { fetcher })).rejects.toThrow("not configured");
    fetcher.mockResolvedValue(
      new Response("invalid", { headers: { "content-type": "text/plain" } }),
    );
    await expect(speakPlanSummary("Computed text", { fetcher })).rejects.toMatchObject({
      code: "invalid_response",
    });
    const signal = new AbortController();
    signal.abort();
    await expect(
      speakPlanSummary("Computed text", { fetcher, signal: signal.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });

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
        proposal({
          args: {
            overlayId: "flood",
            visible: true,
            url: "https://untrusted.example",
          },
        }),
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

  it("normalizes only the published county-only overlay form to an enabled outages layer", () => {
    const county = proposal({ args: { visible: true } });
    expect(
      validateProposal(county, offlineScenario, offlineScenario, {
        ...capabilities,
        overlayIds: ["outages"],
      }).args,
    ).toEqual({ overlayId: "outages", visible: true });
    expect(() => validateProposal(county, offlineScenario, offlineScenario, capabilities)).toThrow(
      "not supported",
    );
    expect(county.args).toEqual({ visible: true });
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
      await transcribeAudio(new Blob(["audio-data"], { type: "audio/webm" }), {
        fetcher,
      }),
    ).toMatchObject({
      transcript: "Show the flood layer",
      mode: "offline_example",
      warnings: [],
    });
    expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
    expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it("rejects empty/oversized audio but preserves an empty no-speech transcript", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(transcribeAudio(new Blob([]), { fetcher })).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      transcribeAudio(new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]), {
        fetcher,
      }),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(envelope({ transcript: "" }));
    await expect(transcribeAudio(new Blob(["audio"]), { fetcher })).resolves.toMatchObject({
      transcript: "",
    });
  });

  it("retains sample/provider warnings rather than presenting a fallback as transcribed speech", async () => {
    const warnings = ["OFFLINE EXAMPLE: Sample transcript. ElevenLabs is unconfigured."];
    const result = await transcribeAudio(new Blob(["audio"]), {
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(envelope({ transcript: "Show the Houston offline example" }, warnings)),
    });
    expect(result.warnings).toEqual(warnings);
    const interpretation = await interpretText("Show Houston", offlineScenario, {
      fetcher: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          envelope({ proposal: proposal(), clarifications: [] }, ["Built-in interpreter"]),
        ),
    });
    expect(interpretation.warnings).toEqual(["Built-in interpreter"]);
  });

  it("allows provider deadlines longer than the default six-second request timeout", async () => {
    vi.useFakeTimers();
    try {
      const interpretation = interpretText("Show Houston", offlineScenario, {
        fetcher: vi
          .fn<typeof fetch>()
          .mockImplementation(
            () =>
              new Promise((resolve) =>
                setTimeout(
                  () => resolve(envelope({ proposal: proposal(), clarifications: [] })),
                  9000,
                ),
              ),
          ),
      });
      await vi.advanceTimersByTimeAsync(9000);
      await expect(interpretation).resolves.toHaveProperty("interpretation");
      const transcript = transcribeAudio(new Blob(["audio"]), {
        fetcher: vi
          .fn<typeof fetch>()
          .mockImplementation(
            () =>
              new Promise((resolve) =>
                setTimeout(() => resolve(envelope({ transcript: "Hello" })), 13000),
              ),
          ),
      });
      await vi.advanceTimersByTimeAsync(13000);
      await expect(transcript).resolves.toHaveProperty("transcript", "Hello");
    } finally {
      vi.useRealTimers();
    }
  });
});
