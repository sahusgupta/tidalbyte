import { HOUSTON_ARCHIVE_LAYERS } from "./archiveLayers";
import { regionBBox, type Region } from "./zones";

/** WGS84 index diagram. Letter keys correspond to the study-zone list below. */
export function RegionInset({
  region,
  highlighted,
}: {
  region: Region;
  highlighted: string | null;
}) {
  const [west, south, east, north] = regionBBox(region);
  const midLat = (south + north) / 2;
  const lonScale = Math.cos((midLat * Math.PI) / 180);
  const scale = Math.min(252 / ((east - west) * lonScale), 132 / (north - south));
  const x = (lon: number) => 160 + (lon - (east + west) / 2) * scale * lonScale;
  const y = (lat: number) => 78 - (lat - midLat) * scale;
  const { url, bounds } = HOUSTON_ARCHIVE_LAYERS[0];
  return (
    <figure className="region-inset">
      <svg
        viewBox="0 0 320 156"
        role="img"
        aria-label="Houston zone index. Lettered boxes locate the study areas listed below."
      >
        <image
          href={url}
          x={x(bounds[0])}
          y={y(bounds[3])}
          width={x(bounds[2]) - x(bounds[0])}
          height={y(bounds[1]) - y(bounds[3])}
          preserveAspectRatio="none"
        />
        {region.zones.map((zone, i) => {
          const [w, s, e, n] = zone.bbox;
          return (
            <g key={zone.id} className={highlighted === zone.id ? "index-hot" : ""}>
              <rect
                className="index-box"
                x={x(w)}
                y={y(n)}
                width={x(e) - x(w)}
                height={y(s) - y(n)}
              />
              <text
                x={(x(w) + x(e)) / 2}
                y={(y(s) + y(n)) / 2}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {String.fromCharCode(65 + i)}
              </text>
            </g>
          );
        })}
        <path className="index-north" d="M15 32V15m-4 6 4-6 4 6" />
        <text className="index-n" x="15" y="44" textAnchor="middle">
          N
        </text>
      </svg>
      <figcaption>USDA / USGS aerial reference</figcaption>
    </figure>
  );
}
