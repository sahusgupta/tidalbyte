import { afterEach, describe, expect, it, vi } from "vitest";
import { startAudioRecording, type RecordingDependencies } from "./recording";

class FakeRecorder extends EventTarget {
  state = "inactive";
  mimeType = "audio/webm";
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.dispatchEvent(
      Object.assign(new Event("dataavailable"), {
        data: new Blob(["recorded-audio"], { type: this.mimeType }),
      }),
    );
    this.dispatchEvent(new Event("stop"));
  }
}
function setup() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const recorder = new FakeRecorder();
  const dependencies: RecordingDependencies = {
    getUserMedia: vi.fn().mockResolvedValue(stream),
    createRecorder: () => recorder as unknown as MediaRecorder,
  };
  const controller = new AbortController();
  const onComplete = vi.fn();
  const onError = vi.fn();
  return {
    track,
    stream,
    recorder,
    dependencies,
    controller,
    onComplete,
    onError,
  };
}
afterEach(() => vi.useRealTimers());

describe("voice recording lifecycle", () => {
  it("stops microphone tracks and returns audio after an explicit stop", async () => {
    const state = setup();
    const session = await startAudioRecording(
      {
        signal: state.controller.signal,
        onComplete: state.onComplete,
        onError: state.onError,
      },
      state.dependencies,
    );
    expect(state.recorder.state).toBe("recording");
    session.stop();
    expect(state.track.stop).toHaveBeenCalled();
    expect(state.onComplete).toHaveBeenCalledOnce();
    expect(await (state.onComplete.mock.calls[0][0] as Blob).text()).toBe(
      "recorded-audio",
    );
    expect(state.onError).not.toHaveBeenCalled();
  });

  it("discards audio and releases tracks when unmounted or cancelled", async () => {
    const state = setup();
    await startAudioRecording(
      {
        signal: state.controller.signal,
        onComplete: state.onComplete,
        onError: state.onError,
      },
      state.dependencies,
    );
    state.controller.abort();
    expect(state.track.stop).toHaveBeenCalled();
    expect(state.onComplete).not.toHaveBeenCalled();
  });

  it("releases a late microphone grant after cancellation", async () => {
    const state = setup();
    let resolve!: (stream: MediaStream) => void;
    state.dependencies.getUserMedia = () =>
      new Promise((result) => {
        resolve = result;
      });
    const pending = startAudioRecording(
      {
        signal: state.controller.signal,
        onComplete: state.onComplete,
        onError: state.onError,
      },
      state.dependencies,
    );
    state.controller.abort();
    resolve(state.stream);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(state.track.stop).toHaveBeenCalled();
    expect(state.onComplete).not.toHaveBeenCalled();
  });

  it("caps recording duration instead of leaving the microphone running", async () => {
    vi.useFakeTimers();
    const state = setup();
    await startAudioRecording(
      {
        signal: state.controller.signal,
        onComplete: state.onComplete,
        onError: state.onError,
        maxDurationMs: 20000,
      },
      state.dependencies,
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect(state.recorder.state).toBe("inactive");
    expect(state.track.stop).toHaveBeenCalled();
    expect(state.onComplete).toHaveBeenCalledOnce();
  });

  it("releases microphone tracks if the recorder cannot initialize", async () => {
    const state = setup();
    state.dependencies.createRecorder = () => {
      throw new Error("Unsupported recorder");
    };
    await expect(
      startAudioRecording(
        {
          signal: state.controller.signal,
          onComplete: state.onComplete,
          onError: state.onError,
        },
        state.dependencies,
      ),
    ).rejects.toThrow("Unsupported recorder");
    expect(state.track.stop).toHaveBeenCalled();
  });

  it("releases the microphone and reports a recorder failure without uploading audio", async () => {
    const state = setup();
    await startAudioRecording(
      {
        signal: state.controller.signal,
        onComplete: state.onComplete,
        onError: state.onError,
      },
      state.dependencies,
    );
    state.recorder.dispatchEvent(new Event("error"));
    expect(state.track.stop).toHaveBeenCalled();
    expect(state.onError).toHaveBeenCalledOnce();
    expect(state.onComplete).not.toHaveBeenCalled();
  });

  it("stops and discards a recording that exceeds the server's 4 MiB limit", async () => {
    const state = setup();
    await startAudioRecording(
      {
        signal: state.controller.signal,
        onComplete: state.onComplete,
        onError: state.onError,
      },
      state.dependencies,
    );
    state.recorder.dispatchEvent(
      Object.assign(new Event("dataavailable"), {
        data: new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]),
      }),
    );
    expect(state.track.stop).toHaveBeenCalled();
    expect(state.onComplete).not.toHaveBeenCalled();
    expect(state.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Recording exceeded the 4 MiB limit.",
      }),
    );
  });
});
