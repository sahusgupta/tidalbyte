import { useEffect, useMemo, useRef, useState } from "react";
import { zoneSizeKm, type Zone } from "../earth/zones";
import { parseSimulatorMessage, simulatorUrl, toSimulatorZone, zoneMessage } from "./contract";
import "./simulator.css";

export interface SimulatorHostProps {
  zone: Zone;
  onExit: () => void;
  onOpenAtlas: () => void;
}

const EXAMPLE_BASE = "https://your-simulator.example/";

/** Opens the external street & flood simulator for a zone, or explains how to plug one in. */
export function SimulatorHost({ zone, onExit, onOpenAtlas }: SimulatorHostProps) {
  const url = useMemo(() => simulatorUrl(import.meta.env.VITE_SIMULATOR_URL, zone), [zone]);
  const frame = useRef<HTMLIFrameElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState(url ? "Connecting to simulator…" : "");
  const [copied, setCopied] = useState(false);
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => heading.current?.focus(), [zone.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") exit.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!url) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== url.origin || event.source !== frame.current?.contentWindow) return;
      const message = parseSimulatorMessage(event.data);
      if (!message) return;
      if (message.type === "exit") exit.current();
      else if (message.type === "ready") setStatus("");
      else setStatus(message.message);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [url]);

  const sendZone = () => frame.current?.contentWindow?.postMessage(zoneMessage(zone), url!.origin);
  const [w, s, e, n] = zone.bbox;
  const [x, y] = zoneSizeKm(zone);
  const example = simulatorUrl(EXAMPLE_BASE, zone)!.toString();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(toSimulatorZone(zone), null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      className={`sim ${url ? "sim-connected" : "sim-waiting"}`}
      role="dialog"
      aria-modal={url ? true : undefined}
      aria-labelledby="sim-title"
    >
      <div className="sim-bar">
        <button type="button" className="sim-back" onClick={onExit}>
          ← Zones
        </button>
        <div className="sim-title">
          <span className="sim-eyebrow">Street &amp; flood simulator</span>
          <h2 id="sim-title" ref={heading} tabIndex={-1}>
            {zone.name}
          </h2>
        </div>
        <span className="sim-coords" title="Zone bounds: west, south, east, north">
          {w.toFixed(3)}, {s.toFixed(3)} → {e.toFixed(3)}, {n.toFixed(3)} · {x.toFixed(0)} × {y.toFixed(0)} km
        </span>
        {url && (
          <a className="sim-newtab" href={url.toString()} target="_blank" rel="noopener noreferrer">
            Open in new tab ↗
          </a>
        )}
      </div>

      {url ? (
        <div className="sim-frame-wrap">
          <iframe
            ref={frame}
            className="sim-frame"
            title={`Street and flood simulator: ${zone.name}`}
            src={url.toString()}
            onLoad={sendZone}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads"
            allow="fullscreen; xr-spatial-tracking"
          />
          {status && (
            <div className="sim-status" role="status">
              {status}
            </div>
          )}
        </div>
      ) : (
        <div className="sim-card">
          <h3>Simulator not connected yet</h3>
          <p>
            The camera is over this zone. When a simulator is plugged in, it opens here, framed to exactly this area.
            Nothing on this screen is simulation output.
          </p>
          <ol>
            <li>Run the street &amp; flood simulator somewhere reachable from this browser.</li>
            <li>
              Add <code>VITE_SIMULATOR_URL=&lt;its URL&gt;</code> to the repository-root <code>.env</code>.
            </li>
            <li>Restart the web dev server and open this zone again.</li>
          </ol>
          <h4>It will be opened as</h4>
          <pre className="sim-code">{example}</pre>
          <h4>and sent this message after it loads</h4>
          <pre className="sim-code">{JSON.stringify(zoneMessage(zone), null, 2)}</pre>
          <p className="sim-small">
            The simulator can reply with <code>{'{ source: "simulator", type: "exit" }'}</code> to return here, or{" "}
            <code>ready</code> / <code>status</code>. Details: <code>apps/web/src/features/simulator/README.md</code>.
          </p>
          <div className="sim-actions">
            <button type="button" onClick={copy}>
              {copied ? "Copied" : "Copy zone JSON"}
            </button>
            <button type="button" onClick={onOpenAtlas}>
              Houston scenario atlas
            </button>
            <button type="button" className="sim-primary" onClick={onExit}>
              Back to zones
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
