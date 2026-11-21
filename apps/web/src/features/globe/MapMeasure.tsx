import { useState } from "react";
import type { Point } from "../../atlas/domain";
import { BOUNDS, distanceKm } from "./mapGeometry";
import { parseMeasurementPoint } from "./measurement";

export function MapMeasure({
  points,
  onPoint,
  onClear,
}: {
  points: Point[];
  onPoint: (point: Point) => void;
  onClear: () => void;
}) {
  const [longitude, setLongitude] = useState("-95.3698");
  const [latitude, setLatitude] = useState("29.7604");
  const [error, setError] = useState("");
  const complete = points.length === 2;
  return (
    <section className="atlas-measure" aria-label="Measure distance">
      <div className="atlas-measure-summary">
        <output aria-live="polite" aria-atomic="true">
          {complete
            ? `${distanceKm(points[0], points[1]).toFixed(2)} km`
            : `Choose point ${points.length ? "B" : "A"}`}
        </output>
        <button type="button" onClick={onClear} disabled={!points.length}>
          New
        </button>
      </div>
      <p>
        {complete
          ? "Approximate surface distance · excludes terrain and routes"
          : "Click two map points, or enter coordinates below."}
      </p>
      <details>
        <summary>Enter coordinates</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const point = parseMeasurementPoint(longitude, latitude);
            if (!point) {
              setError("Enter coordinates within the Houston study area.");
              return;
            }
            setError("");
            onPoint(point);
          }}
        >
          <label>
            Longitude
            <input
              aria-label="Measurement longitude"
              type="number"
              step="any"
              min={BOUNDS[0]}
              max={BOUNDS[2]}
              required
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </label>
          <label>
            Latitude
            <input
              aria-label="Measurement latitude"
              type="number"
              step="any"
              min={BOUNDS[1]}
              max={BOUNDS[3]}
              required
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
          </label>
          <button type="submit">Place point {points.length === 1 ? "B" : "A"}</button>
          {error && <p role="alert">{error}</p>}
        </form>
      </details>
    </section>
  );
}
