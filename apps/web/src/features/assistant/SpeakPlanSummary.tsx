import { useEffect, useRef, useState } from "react";
import { speakPlanSummary } from "../../services/assistant";
import { ServiceError } from "../../services/client";
import "./plan-narration.css";

/** The planner supplies deterministic, visible text. No automatic requests or playback. */
export function SpeakPlanSummary({
  text,
  fetcher,
  baseUrl,
}: {
  text: string;
  fetcher?: typeof fetch;
  baseUrl?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState("");
  const audio = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef("");
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    setUrl("");
    setBusy(false);
    setNotice("");
    return () => {
      sequence.current++;
      request.current?.abort();
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = "";
    };
  }, [text]);

  const narrate = async () => {
    const token = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNotice("Preparing narration of the computed summary…");
    try {
      const blob = await speakPlanSummary(text, { fetcher, baseUrl, signal: controller.signal });
      if (token !== sequence.current) return;
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      setUrl(objectUrl.current);
      setNotice("ElevenLabs narration ready. Use Play to listen to the computed summary.");
    } catch (error) {
      if (
        token !== sequence.current ||
        (error instanceof ServiceError && error.code === "cancelled")
      )
        return;
      setNotice(
        error instanceof Error
          ? error.message
          : "Narration unavailable. Read the computed summary above.",
      );
    } finally {
      if (token === sequence.current) setBusy(false);
    }
  };

  return (
    <section className="plan-narration" aria-label="Computed plan narration">
      <button
        type="button"
        onClick={() => void narrate()}
        disabled={busy || !text.trim() || text.trim().length > 2000}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14" />
        </svg>
        {busy ? "Preparing narration…" : "Prepare narrated summary"}
      </button>
      {busy && (
        <button
          type="button"
          onClick={() => {
            sequence.current++;
            request.current?.abort();
            setBusy(false);
            setNotice("Narration cancelled.");
          }}
        >
          Cancel narration
        </button>
      )}
      {url && (
        <audio
          ref={audio}
          controls
          src={url}
          aria-label="ElevenLabs reading of the computed plan"
          preload="metadata"
          onError={() =>
            setNotice(
              "Audio playback is unavailable. The computed summary remains available as text.",
            )
          }
        />
      )}
      <p role="status" aria-live="polite">
        {notice || "Optional narration reads this summary verbatim."}
      </p>
    </section>
  );
}
