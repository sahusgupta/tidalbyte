import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchCurrentWeather,
  weatherDescription,
  weatherIsFresh,
  type CurrentWeather,
} from "../../../../../simulator/frontend/src/lib/currentWeather";
import { HOUSTON_BOOKMARKS, type BookmarkId, type Point } from "../../atlas/domain";
import { Icon } from "../../app/Icon";
import imagery from "../../../public/map/provenance.json";
import "./weather.css";

const aerial = imagery.assets.find((asset) => asset.file === "houston-detail-usgs.webp")!;
const formatTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
const example: CurrentWeather = {
  validAt: Date.UTC(2025, 5, 1, 18), intervalSeconds: 900, temperatureC: 26,
  rainMmPerHour: 3.2, windKph: 16, windDirectionDeg: 135, weatherCode: 61,
};

function compass(degrees: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8];
}

function WeatherMap({ point, locationName, report, paused }: {
  point: Point; locationName: string; report?: CurrentWeather; paused: boolean;
}) {
  const [west, south, east, north] = aerial.bboxWgs84;
  const x = (point[0] - west) / (east - west) * aerial.width;
  const y = (north - point[1]) / (north - south) * aerial.height;
  const wind = report?.windKph ?? 0;
  const direction = report?.windDirectionDeg;
  const rain = report?.rainMmPerHour ?? 0;
  const windDuration = Math.max(0.65, 24 / Math.max(1, wind));
  const spacing = Math.max(10, 30 - 2 * Math.min(10, rain));
  return (
    <div className={`weather-map${paused ? " is-paused" : ""}`}>
      <svg className="weather-aerial" viewBox="-360 -250 720 500"
        preserveAspectRatio="xMidYMid slice" role="img" aria-label="Archival aerial map centered on the selected Houston location">
        <image href={`/map/${aerial.file}`} x={-x} y={-y} width={aerial.width} height={aerial.height} />
      </svg>
      <svg className="weather-field" viewBox="-125 -125 250 250" aria-hidden="true"
        style={{ "--wind-duration": `${windDuration}s` } as CSSProperties}>
        <defs>
          <clipPath id="weather-disc"><circle r="101" /></clipPath>
          <pattern id="weather-rain" width={spacing} height={spacing} patternUnits="userSpaceOnUse">
            <path className="weather-drop" d={`M6 -8v${spacing + 16}`} />
          </pattern>
        </defs>
        <circle r="102" fill="#142c2c" fillOpacity=".68" stroke="#b4c3b7" />
        <g clipPath="url(#weather-disc)">
          {report && wind > 0 && direction != null && (
            <g transform={`rotate(${direction + 180})`}>
              {Array.from({ length: 11 }, (_, i) => (
                <path key={i} className="weather-stream" d={`M${(i - 5) * 21} ${125 + i * 9}v-350`} />
              ))}
              <path d="M0 18v-38m-8 8 8-8 8 8" className="weather-vector" />
            </g>
          )}
          {rain > 0 && <circle r="102" fill="url(#weather-rain)" transform="rotate(12)" />}
        </g>
        <circle r="3" fill="#fff8e8" />
        <text x="0" y="-111" textAnchor="middle" className="weather-north">N</text>
      </svg>
      <div className="weather-map-title">
        <strong>{locationName}</strong>
        <span>Wind and rain simulation</span>
      </div>
      <span className="weather-credit">Archival imagery · USDA / USGS</span>
    </div>
  );
}

export default function LiveWeather({ initialLocation, onBack }: {
  initialLocation: BookmarkId; onBack: () => void;
}) {
  const [location, setLocation] = useState(initialLocation);
  const [showExample, setShowExample] = useState(false);
  const [paused, setPaused] = useState(false);
  const [, tick] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const timer = window.setInterval(() => tick((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const { point, label } = HOUSTON_BOOKMARKS[location];
  const query = useQuery({
    queryKey: ["current-weather", ...point],
    queryFn: ({ signal }) => fetchCurrentWeather(point[1], point[0], AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
    enabled: !showExample,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: false,
  });
  const report = showExample ? example : query.data;
  const fresh = report && weatherIsFresh(report.validAt);
  const status = showExample ? "Offline example" : !report
    ? query.isFetching ? "Getting current weather…" : "Live weather unavailable"
    : !fresh || query.isError ? "Last available estimate" : "Current model estimate";
  const wind = report?.windKph;
  const direction = report?.windDirectionDeg;
  const animated = !!report && (report.rainMmPerHour > 0 || (!!wind && direction != null));
  return (
    <div className="weather-view">
      <header className="weather-bar">
        <button type="button" onClick={onBack}><Icon name="arrow" size={16} /> Scenario settings</button>
        <span>EarthLab / Houston field unit</span>
      </header>
      <main className="weather-layout">
        <section className="weather-readout" aria-labelledby="live-weather-title">
          <h1 id="live-weather-title" ref={heading} tabIndex={-1}>Live weather</h1>
          <label className="weather-location">Study location
            <select value={location} onChange={(event) => {
              setLocation(event.target.value as BookmarkId);
              setShowExample(false);
            }}>
              {Object.entries(HOUSTON_BOOKMARKS).map(([id, item]) =>
                <option key={id} value={id}>{item.label}</option>)}
            </select>
          </label>
          <div className="weather-state" role="status">
            <strong>{status}</strong>
            {report && <time dateTime={new Date(report.validAt).toISOString()}>{formatTime.format(report.validAt)}</time>}
          </div>
          {report ? <>
            <h2>{weatherDescription(report.weatherCode)}</h2>
            <dl className="weather-values">
              <div><dt>Temperature</dt><dd>{report.temperatureC == null ? "Unavailable" : `${report.temperatureC} °C`}</dd></div>
              <div><dt>Wind</dt><dd>{wind == null ? "Unavailable" : `${wind} km/h${wind > 0 && direction != null ? ` from ${compass(direction)}` : ""}`}</dd></div>
              <div><dt>Rain rate</dt><dd>{report.rainMmPerHour.toLocaleString(undefined, { maximumFractionDigits: 2 })} mm/h</dd></div>
            </dl>
            <p>Wind trails show the direction air moves. Rain marks show the average rate over {report.intervalSeconds / 60} minutes.</p>
          </> : <p>{query.isFetching ? `Requesting the latest model data for ${label}.` : "The feed could not supply a recent estimate. Retry or explore a labeled example."}</p>}
          <div className="weather-actions">
            <button disabled={!showExample && query.isFetching} onClick={() => {
              setShowExample(false);
              void query.refetch();
            }}>{showExample ? "Return to live weather" : "Refresh weather"}</button>
            {!report && !query.isFetching && <button onClick={() => setShowExample(true)}>View offline example</button>}
            {animated && <button className="weather-motion" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume motion" : "Pause motion"}</button>}
          </div>
          <p className="weather-method">{showExample ? "EarthLab sample values." : <>Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. Refreshes every five minutes.</>} The display illustrates conditions at one location.</p>
        </section>
        <WeatherMap point={point} locationName={label} report={report} paused={paused} />
      </main>
    </div>
  );
}
