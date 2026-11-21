import { useEffect, useMemo, useRef, useState } from "react";
import { REGIONS, zoneSizeKm, type Zone } from "../earth/zones";
import {
  parseSimulatorMessage,
  simulatorUrl,
  toSimulatorZone,
  zoneMessage,
} from "./contract";
import { manageDialogFocus } from "./dialogFocus";
import "./simulator.css";

export interface SimulatorHostProps {
  zone: Zone;
  onExit: () => void;
  onHome: () => void;
  onZoneChange: (zoneId: string) => void;
}

const EXAMPLE_BASE = "https://your-simulator.example/";
const READY_TIMEOUT_MS = 12000;
type Connection = {
  phase: "connecting" | "ready" | "slow" | "error";
  message: string;
};

/** Opens the external street & flood simulator for a zone, or explains how to plug one in. */
export function SimulatorHost({
  zone,
  onExit,
  onHome,
  onZoneChange,
}: SimulatorHostProps) {
  const url = useMemo(
    () => simulatorUrl(import.meta.env.VITE_SIMULATOR_URL, zone),
    [zone],
  );
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [connection, setConnection] = useState<Connection>({
    phase: "connecting",
    message: "",
  });
  const [retry, setRetry] = useState(0);
  const readyTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);
  const copyRevision = useRef(0);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const exit = useRef(onExit);
  exit.current = onExit;

  useEffect(() => {
    copyRevision.current++;
    if (dialog.current && heading.current)
      return manageDialogFocus(dialog.current, heading.current, Boolean(url));
  }, [zone.id, url, retry]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        exit.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setCopied(false);
    setCopyFailed(false);
    setConnection({ phase: "connecting", message: "" });
    window.clearTimeout(copyTimer.current);
    if (!url) return;
    let deliveredAfterReady = false;
    readyTimer.current = window.setTimeout(() => {
      setConnection((current) => ({
        phase: "slow",
        message:
          current.message ||
          "The simulation is taking longer to load. You can keep waiting or retry.",
      }));
    }, READY_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== url.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = parseSimulatorMessage(event.data);
      if (!message) return;
      if (message.type === "exit") exit.current();
      else if (message.type === "ready") {
        window.clearTimeout(readyTimer.current);
        setConnection({ phase: "ready", message: "" });
        // A delayed application may install its listener after the iframe load event.
        if (!deliveredAfterReady) {
          deliveredAfterReady = true;
          frame.current?.contentWindow?.postMessage(
            zoneMessage(zone),
            url.origin,
          );
        }
      } else
        setConnection((current) => ({ ...current, message: message.message }));
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(readyTimer.current);
      window.clearTimeout(copyTimer.current);
    };
  }, [url, retry, zone]);

  useEffect(
    () => () => {
      copyRevision.current++;
      window.clearTimeout(copyTimer.current);
    },
    [],
  );

  const sendZone = () =>
    frame.current?.contentWindow?.postMessage(zoneMessage(zone), url!.origin);
  const [w, s, e, n] = zone.bbox;
  const [x, y] = zoneSizeKm(zone);
  const diagramScale = Math.min(174 / x, 78 / y);
  const diagramWidth = x * diagramScale;
  const diagramHeight = y * diagramScale;
  const diagramLeft = 154 - diagramWidth / 2;
  const diagramTop = 63 - diagramHeight / 2;
  const example = simulatorUrl(EXAMPLE_BASE, zone)!.toString();
  const copy = async () => {
    const revision = copyRevision.current;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(toSimulatorZone(zone), null, 2),
      );
      if (revision !== copyRevision.current) return;
      setCopied(true);
      setCopyFailed(false);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      if (revision !== copyRevision.current) return;
      setCopied(false);
      setCopyFailed(true);
    }
  };

  return (
    <section
      ref={dialog}
      className={`sim ${url ? "sim-connected" : "sim-waiting"}`}
      role="dialog"
      aria-modal={url ? true : undefined}
      aria-labelledby="sim-title"
    >
      <div className="sim-bar">
        <button type="button" className="sim-back" onClick={onExit}>
          ← Home
        </button>
        <div className="sim-title">
          <span className="sim-eyebrow">
            {url ? "EarthLab · Flood simulation" : "Selected Houston area"}
          </span>
          <h2 id="sim-title" ref={heading} tabIndex={-1}>
            {zone.name}
          </h2>
        </div>
        {url && (
          <span
            className="sim-coords"
            title="Approximate size of the selected navigation area"
          >
            ≈ {x.toFixed(1)} × {y.toFixed(1)} km
          </span>
        )}
        {url && (
          <div className="sim-toolbar-actions">
            <select className="sim-area-select" aria-label="Houston area" value={zone.id}
              onChange={event => onZoneChange(event.target.value)}>
              {REGIONS.flatMap(region => region.zones).map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
            </select>
            <a
              className="sim-newtab"
              href={url.toString()}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open simulator in new tab"
              title="Open simulator in new tab"
            >
              ↗
            </a>
          </div>
        )}
      </div>

      {url ? (
        <div className="sim-frame-wrap">
          <iframe
            key={`${zone.id}:${retry}`}
            ref={frame}
            className="sim-frame"
            title={`Street and flood simulator: ${zone.name}`}
            src={url.toString()}
            onLoad={sendZone}
            onError={() => {
              window.clearTimeout(readyTimer.current);
              setConnection({
                phase: "error",
                message:
                  "The simulation could not be loaded. Retry the connection or return home.",
              });
            }}
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads"
            allow="fullscreen; xr-spatial-tracking"
          />
          {(connection.phase !== "ready" || connection.message) && (
            <div className="sim-status" role="status" aria-live="polite">
              <span>
                {connection.message || "Loading EarthLab simulation…"}
              </span>
              {(connection.phase === "slow" ||
                connection.phase === "error") && (
                <div className="sim-status-actions">
                  <button
                    type="button"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Retry connection
                  </button>
                  <button type="button" onClick={onHome}>
                    Back to EarthLab home
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="sim-card">
          <div className="sim-availability">
            <span aria-hidden="true" />
            Simulation unavailable
          </div>
          <div className="sim-editor-callout">
            <button type="button" className="sim-primary" onClick={onHome}>
              Back to EarthLab home <span aria-hidden="true">↗</span>
            </button>
            <p>
              Return home or choose another Houston area.
            </p>
          </div>
          <p className="sim-area-note">{zone.summary}</p>
          <div
            className="sim-area-frame"
            aria-label={`Selected navigation area, approximately ${x.toFixed(1)} by ${y.toFixed(1)} kilometers`}
          >
            <svg viewBox="0 0 320 126" aria-hidden="true">
              <path
                d="M16 24h276M16 63h276M16 102h276M46 12v102M154 12v102M262 12v102"
                className="sim-grid"
              />
              <rect
                x={diagramLeft}
                y={diagramTop}
                width={diagramWidth}
                height={diagramHeight}
                className="sim-bounds"
              />
              <path
                d={`M${diagramLeft} ${diagramTop + 12}v-12h12M${diagramLeft + diagramWidth - 12} ${diagramTop}h12v12M${diagramLeft + diagramWidth} ${diagramTop + diagramHeight - 12}v12h-12M${diagramLeft + 12} ${diagramTop + diagramHeight}h-12v-12`}
                className="sim-corners"
              />
              <path
                d="M154 57v12m-6-6h12M292 31V13m-4 5 4-5 4 5"
                className="sim-crosshair"
              />
              <text x="286" y="47">
                N
              </text>
              <text x="154" y="116" textAnchor="middle">
                Selected navigation bounds
              </text>
            </svg>
            <div>
              <span>{zone.area}</span>
              <strong>
                ≈ {x.toFixed(1)} × {y.toFixed(1)} km
              </strong>
            </div>
          </div>
          <details className="sim-extent">
            <summary>Area coordinates</summary>
            <dl>
              <div>
                <dt>West</dt>
                <dd>{Math.abs(w).toFixed(3)}° W</dd>
              </div>
              <div>
                <dt>East</dt>
                <dd>{Math.abs(e).toFixed(3)}° W</dd>
              </div>
              <div>
                <dt>South</dt>
                <dd>{s.toFixed(3)}° N</dd>
              </div>
              <div>
                <dt>North</dt>
                <dd>{n.toFixed(3)}° N</dd>
              </div>
            </dl>
            <p>
              WGS84 navigation bounds. This box is not a forecast or flood
              extent.
            </p>
          </details>
          <details className="sim-connection-details">
            <summary>Connection details</summary>
            <div className="sim-connection-content">
              <p>
                An optional street and flood simulator can receive this area’s
                bounds and center. Connection setup is for the project operator.
              </p>
              <ol>
                <li>
                  Run the street &amp; flood simulator somewhere reachable from
                  this browser.
                </li>
                <li>
                  Add <code>VITE_SIMULATOR_URL=&lt;its URL&gt;</code> to the
                  repository-root <code>.env</code>.
                </li>
                <li>Restart the web dev server and open this zone again.</li>
              </ol>
              <h4>It will be opened as</h4>
              <pre className="sim-code">{example}</pre>
              <h4>and sent this message after it loads</h4>
              <pre className="sim-code">
                {JSON.stringify(zoneMessage(zone), null, 2)}
              </pre>
              <p className="sim-small">
                The simulator can reply with{" "}
                <code>{'{ source: "simulator", type: "exit" }'}</code> to return
                here, or <code>ready</code> / <code>status</code>. Details:{" "}
                <code>apps/web/src/features/simulator/README.md</code>.
              </p>
              <div className="sim-actions">
                <button type="button" onClick={copy}>
                  {copied ? "Copied" : "Copy zone JSON"}
                </button>
              </div>
              {copyFailed && (
                <p role="status">
                  Copy unavailable. Select the zone JSON above to copy it
                  manually.
                </p>
              )}
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
