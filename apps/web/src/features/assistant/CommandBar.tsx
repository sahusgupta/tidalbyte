import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CommandProposal, Scenario } from "@earthlab/contracts";
import { interpretText, transcribeAudio, validateProposal, type ApprovedCommand, type AssistantCapabilities } from "../../services/assistant";
import { ServiceError } from "../../services/client";
import { sameScenario } from "../../services/validation";
import { startAudioRecording, type RecordingSession } from "./recording";
import "./command-bar.css";

export type { ApprovedCommand, AssistantCapabilities } from "../../services/assistant";
export interface CommandBarProps {
  scenario: Scenario;
  getCurrentScenario: () => Scenario;
  capabilities: AssistantCapabilities;
  onCommand: (command: ApprovedCommand) => void | Promise<void>;
  fetcher?: typeof fetch;
  baseUrl?: string;
}
type Phase = "idle" | "interpreting" | "permission" | "recording" | "transcribing" | "applying";
type Review = { proposal: CommandProposal; snapshot: Scenario; command: ApprovedCommand; example: boolean };

function describe(command: ApprovedCommand): string {
  switch (command.action) {
    case "SELECT_REGION": return "Focus the Houston study region";
    case "SELECT_PRESET": return `Select the ${command.args.presetEventId} preset`;
    case "RUN_ANALYSIS": return "Run conditional county analysis with the current historical inputs";
    case "TOGGLE_OVERLAY": return `${command.args.visible ? "Show" : "Hide"} the ${command.args.overlayId} layer`;
    case "EXPLAIN_RESULT": return "Open the current result’s evidence and limitations";
  }
}

function Glyph({ kind }: { kind: "command" | "microphone" | "send" | "stop" }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
    {kind === "microphone" ? <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3M9 21h6" /></>
      : kind === "send" ? <path d="m5 12 14 0m-5-5 5 5-5 5" />
        : kind === "stop" ? <rect x="6" y="6" width="12" height="12" fill="currentColor" stroke="none" />
          : <><path d="M4 8h5m-5 8h5M15 4v5m0 6v5" /><path d="m11 8 4 4-4 4m4-4h5" /></>}
  </svg>;
}

export function CommandBar(props: CommandBarProps) {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState("Typed requests and optional voice · manual map controls are always available");
  const [review, setReview] = useState<Review | null>(null);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const recordingAbort = useRef<AbortController | null>(null);
  const recording = useRef<RecordingSession | null>(null);
  const applied = useRef(new Set<string>());
  const latest = useRef(props);
  latest.current = props;
  const supportsRecording = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
      request.current?.abort();
      recordingAbort.current?.abort();
      recording.current?.cancel();
    };
  }, []);

  useEffect(() => {
    if (review && !sameScenario(review.snapshot, props.scenario)) {
      setReview(null);
      setNotice("Scenario changed. Ask for a new proposal; nothing has been applied.");
    }
  }, [props.scenario, review]);

  const showFailure = (error: unknown) => {
    if (error instanceof ServiceError && error.code === "cancelled") return;
    const message = error instanceof Error ? error.message : "The optional command service is unavailable.";
    setNotice(`${message} No command was applied. Use the manual map controls.`);
  };

  const propose = async (value: string, snapshot = structuredClone(latest.current.getCurrentScenario())) => {
    const token = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setReview(null);
    setPhase("interpreting");
    setNotice("Requesting a backend command proposal…");
    try {
      if (!sameScenario(snapshot, latest.current.getCurrentScenario())) throw new ServiceError("stale", "The scenario changed while recording.");
      const result = await interpretText(value, snapshot, { fetcher: latest.current.fetcher, baseUrl: latest.current.baseUrl, signal: controller.signal });
      if (!mounted.current || sequence.current !== token) return;
      const { proposal, clarifications } = result.interpretation;
      if (clarifications.length || !proposal) {
        setNotice(clarifications.join(" ") || "The backend requested clarification. No command was applied.");
        return;
      }
      const command = validateProposal(proposal, snapshot, latest.current.getCurrentScenario(), latest.current.capabilities);
      if (applied.current.has(command.commandId)) throw new ServiceError("unsupported", "This proposal was already sent to the controls.");
      setReview({ proposal, snapshot, command, example: result.mode === "offline_example" });
      setNotice("Review the proposed action. Nothing has been applied.");
    } catch (error) {
      if (mounted.current && sequence.current === token) showFailure(error);
    } finally {
      if (mounted.current && sequence.current === token) setPhase("idle");
    }
  };

  const confirm = async () => {
    if (!review || phase !== "idle") return;
    try {
      const command = validateProposal(review.proposal, review.snapshot, latest.current.getCurrentScenario(), latest.current.capabilities);
      if (applied.current.has(command.commandId)) throw new ServiceError("unsupported", "This proposal was already sent to the controls.");
      applied.current.add(command.commandId);
      setReview(null);
      setPhase("applying");
      await latest.current.onCommand(command);
      if (mounted.current) setNotice("Confirmed command sent to the map controls.");
    } catch (error) {
      if (mounted.current) showFailure(error);
    } finally {
      if (mounted.current) setPhase("idle");
    }
  };

  const cancel = () => {
    sequence.current++;
    request.current?.abort();
    recordingAbort.current?.abort();
    recording.current?.cancel();
    recording.current = null;
    setPhase("idle");
    setReview(null);
    setNotice("Request cancelled. No command was applied.");
  };

  const beginRecording = async () => {
    const token = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    recordingAbort.current = controller;
    const snapshot = structuredClone(latest.current.getCurrentScenario());
    setReview(null);
    setPhase("permission");
    setNotice("Waiting for microphone access. Record up to 20 seconds; stop to send audio for transcription.");
    try {
      const session = await startAudioRecording({
        signal: controller.signal,
        onError: (error) => {
          if (mounted.current && sequence.current === token) { showFailure(error); setPhase("idle"); }
        },
        onComplete: (audio) => {
          if (!mounted.current || sequence.current !== token) return;
          setPhase("transcribing");
          setNotice("Requesting transcription from the voice service…");
          const transcribeController = new AbortController();
          request.current = transcribeController;
          void transcribeAudio(audio, { fetcher: latest.current.fetcher, baseUrl: latest.current.baseUrl, signal: transcribeController.signal }).then((transcript) => {
            if (!mounted.current || sequence.current !== token) return;
            setInput(transcript);
            void propose(transcript, snapshot);
          }).catch((error) => {
            if (mounted.current && sequence.current === token) { showFailure(error); setPhase("idle"); }
          });
        },
      });
      if (!mounted.current || sequence.current !== token) { session.cancel(); return; }
      recording.current = session;
      setPhase("recording");
      setNotice("Recording · up to 20 seconds. Stop to transcribe, or cancel to discard.");
    } catch (error) {
      if (mounted.current && sequence.current === token) { showFailure(error); setPhase("idle"); }
    }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); if (phase === "idle" && input.trim()) void propose(input); };
  return <section className="atlas-command-bar" aria-label="Typed and voice map commands">
    <form className="atlas-command-form" onSubmit={submit}>
      <span className="atlas-command-mark"><Glyph kind="command" /></span>
      <label className="atlas-visually-hidden" htmlFor="atlas-command-input">Ask the atlas for a supported action</label>
      <input id="atlas-command-input" value={input} onChange={(event) => { setInput(event.target.value); setReview(null); }} maxLength={2000} disabled={phase !== "idle"} placeholder="Ask the atlas… e.g. Show the flood layer" autoComplete="off" />
      <button type="button" className={phase === "recording" ? "atlas-microphone recording" : "atlas-microphone"} aria-label={phase === "recording" ? "Stop recording and transcribe" : "Record a voice request"} title={supportsRecording ? "Optional voice request · 20 seconds maximum" : "Microphone recording is unavailable in this browser"} disabled={!supportsRecording || phase !== "idle" && phase !== "recording"} onClick={() => {
        if (phase === "recording") { setPhase("transcribing"); recording.current?.stop(); } else void beginRecording();
      }}><Glyph kind={phase === "recording" ? "stop" : "microphone"} /></button>
      <button type="submit" className="atlas-command-send" disabled={phase !== "idle" || !input.trim()} aria-label="Request a command proposal"><Glyph kind="send" /><span>Propose</span></button>
      {phase !== "idle" && phase !== "applying" && <button type="button" className="atlas-command-cancel" onClick={cancel}>Cancel</button>}
    </form>
    {review && <div className="atlas-command-review"><div><span>{review.example ? "Offline example proposal" : "Backend proposal"} · scenario v{review.proposal.scenarioVersion}</span><strong>{describe(review.command)}</strong></div><button type="button" onClick={() => void confirm()} disabled={phase !== "idle"}>Confirm</button><button type="button" onClick={() => { setReview(null); setNotice("Proposal dismissed. No command was applied."); }}>Dismiss</button></div>}
    <p className="atlas-command-status" role="status" aria-live="polite">{notice}</p>
  </section>;
}
