export interface RecordingSession {
  stop: () => void;
  cancel: () => void;
}
export interface RecordingOptions {
  signal: AbortSignal;
  onComplete: (audio: Blob) => void;
  onError: (error: Error) => void;
  maxDurationMs?: number;
}
export interface RecordingDependencies {
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
}

export async function startAudioRecording(
  options: RecordingOptions,
  dependencies?: RecordingDependencies,
): Promise<RecordingSession> {
  const deps = dependencies ?? {
    getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
    createRecorder: (stream: MediaStream) => new MediaRecorder(stream),
  };
  const stream = await deps.getUserMedia();
  const release = () => stream.getTracks().forEach((track) => track.stop());
  if (options.signal.aborted) {
    release();
    throw new DOMException("Recording cancelled", "AbortError");
  }
  let recorder: MediaRecorder;
  try {
    recorder = deps.createRecorder(stream);
  } catch (error) {
    release();
    throw error;
  }
  const chunks: Blob[] = [];
  let bytes = 0;
  let cancelled = false;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
    release();
  };
  const stop = () => {
    if (settled) return;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch (error) {
      fail(
        error instanceof Error ? error : new Error("Recording could not stop."),
      );
    }
    release();
  };
  const cancel = () => {
    cancelled = true;
    stop();
    cleanup();
  };
  const fail = (error: Error) => {
    if (settled) return;
    settled = true;
    cancelled = true;
    try {
      if (recorder.state !== "inactive") recorder.stop();
    } catch {
      /* release tracks below */
    }
    cleanup();
    options.onError(error);
  };
  recorder.addEventListener("dataavailable", (event: BlobEvent) => {
    if (cancelled || settled) return;
    bytes += event.data.size;
    if (bytes > MAX_AUDIO_BYTES) {
      fail(new Error("Recording exceeded the 4 MiB limit."));
      return;
    }
    if (event.data.size) chunks.push(event.data);
  });
  recorder.addEventListener("error", () =>
    fail(new Error("Microphone recording failed.")),
  );
  recorder.addEventListener("stop", () => {
    if (settled) return;
    settled = true;
    cleanup();
    if (!cancelled && !options.signal.aborted)
      options.onComplete(
        new Blob(chunks, {
          type: recorder.mimeType || chunks[0]?.type || "audio/webm",
        }),
      );
  });
  options.signal.addEventListener("abort", cancel, { once: true });
  try {
    recorder.start(250);
  } catch (error) {
    cleanup();
    throw error;
  }
  timer = setTimeout(stop, options.maxDurationMs ?? 20000);
  return { stop, cancel };
}
import { MAX_AUDIO_BYTES } from "../../services/assistant";
