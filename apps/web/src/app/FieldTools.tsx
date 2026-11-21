import { useId, type CSSProperties } from "react";
import { Icon } from "./Icon";
import type { Point } from "../atlas/domain";
import { distanceKm } from "../features/globe/mapGeometry";
import "../styles/field-tools.css";

export function Dial({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="dial">
      <div>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {Number(value.toFixed(1))}
          <small> {unit}</small>
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${value} ${unit}`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--field-progress": `${(100 * (value - min)) / (max - min)}%`,
          } as CSSProperties
        }
      />
    </div>
  );
}

export function LayerToggle({
  label,
  styleName,
  value,
  set,
}: {
  label: string;
  styleName: string;
  value: boolean;
  set: (v: boolean) => void;
}) {
  return (
    <label className="layer-row">
      <i aria-hidden="true" className={`line-key ${styleName}`} />
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
      />
      <i className="toggle-track" aria-hidden="true" />
    </label>
  );
}

export const timeLabel = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
};

export function Timeline({
  caption,
  progress,
  playing,
  duration,
  onScrub,
  onPlay,
}: {
  caption: string;
  progress: number;
  playing: boolean;
  duration: number;
  onScrub: (p: number) => void;
  onPlay: () => void;
}) {
  const labels = [0, 0.25, 0.5, 0.75, 1];
  return (
    <section className="timeline atlas-timeline" aria-label="Scenario timeline">
      <button
        type="button"
        className="play"
        aria-label={playing ? "Pause timeline" : "Play timeline"}
        onClick={onPlay}
      >
        <Icon name={playing ? "pause" : "play"} size={18} />
      </button>
      <div className="time-read">
        <span className="time-caption">{caption}</span>
        <output>T+{timeLabel(progress * duration)}</output>
      </div>
      <div className="time-axis">
        <input
          aria-label="Scenario time scrubber"
          aria-valuetext={`${timeLabel(progress * duration)} elapsed of ${timeLabel(duration)} scenario hours`}
          type="range"
          min="0"
          max="1000"
          value={Math.round(progress * 1000)}
          onChange={(e) => onScrub(Number(e.target.value) / 1000)}
          style={
            {
              "--field-progress": `${progress * 100}%`,
            } as CSSProperties
          }
        />
        <div className="time-ticks" aria-hidden="true">
          {labels.map((r, index) => (
            <span
              key={r}
              className={
                index === 1 || index === 3 ? "time-quarter" : undefined
              }
            >
              {Number((r * duration).toFixed(1))} h
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function RoadSketch({
  points,
  closed,
}: {
  points: Point[];
  closed: boolean;
}) {
  if (points.length < 2)
    return (
      <figure className="segment-instrument">
        <figcaption>Segment geometry unavailable</figcaption>
      </figure>
    );
  const lengthKm = points
    .slice(1)
    .reduce((sum, point, index) => sum + distanceKm(points[index], point), 0);
  const mid = points[Math.floor(points.length / 2)] ?? [-95.37, 29.76];
  const xy = points.map((p) => [
    (p[0] - mid[0]) * Math.cos((mid[1] * Math.PI) / 180),
    mid[1] - p[1],
  ]);
  const xs = xy.map((p) => p[0]),
    ys = xy.map((p) => p[1]);
  const width = Math.max(...xs) - Math.min(...xs),
    height = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(
    180 / Math.max(width, 0.001),
    46 / Math.max(height, 0.001),
  );
  const line = xy.map((p) => [
    110 + (p[0] - (Math.min(...xs) + width / 2)) * scale,
    36 + (p[1] - (Math.min(...ys) + height / 2)) * scale,
  ]);
  return (
    <figure className="segment-instrument">
      <svg
        className={"road-sketch" + (closed ? " closed" : "")}
        viewBox="0 0 220 72"
        aria-label={`Selected fixture segment, ${lengthKm.toFixed(1)} kilometers along ${points.length} authored vertices`}
        role="img"
      >
        <polyline
          points={line.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={closed ? "7 4" : undefined}
        />
        {[line[0], line[line.length - 1]].map((p, i) => (
          <circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r="3"
            fill="var(--paper, #faf8f1)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <figcaption>
        <span>Sketched segment</span>
        <strong>
          {lengthKm.toFixed(1)} <small>km</small>
        </strong>
        <span>{points.length} points</span>
      </figcaption>
    </figure>
  );
}
