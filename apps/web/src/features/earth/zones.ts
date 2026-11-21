/**
 * Simulation zones: neighbourhood-scale areas a user can open in the street & flood simulator.
 * Each zone is the domain handed to the simulator (see ../simulator/contract.ts).
 * Add a zone here and it appears on the globe and in the zone list automatically.
 */
export type LonLat = [number, number];
/** [west, south, east, north] in WGS84 degrees. */
export type BBox = [number, number, number, number];

export interface Zone {
  id: string;
  name: string;
  /** Short place tag shown beside the name. */
  area: string;
  /** One factual line; no invented statistics. */
  summary: string;
  bbox: BBox;
}

export interface Region {
  id: string;
  name: string;
  /** Marker position when the globe is zoomed out too far to see zones. */
  anchor: LonLat;
  zones: Zone[];
}

export const HOUSTON: Region = {
  id: "houston",
  name: "Houston",
  anchor: [-95.3698, 29.7604],
  zones: [
    {
      id: "downtown-buffalo-bayou",
      name: "Downtown & Buffalo Bayou",
      area: "Central Houston",
      summary: "Downtown core and the Buffalo Bayou corridor west to Memorial Park.",
      bbox: [-95.43, 29.735, -95.335, 29.79],
    },
    {
      id: "medical-center-brays",
      name: "Medical Center & Brays Bayou",
      area: "South Houston",
      summary: "Texas Medical Center, Hermann Park and Brays Bayou.",
      bbox: [-95.435, 29.68, -95.37, 29.725],
    },
    {
      id: "meyerland",
      name: "Meyerland",
      area: "Southwest Houston",
      summary: "Residential neighbourhood along Brays Bayou, upstream of the Medical Center.",
      bbox: [-95.49, 29.665, -95.435, 29.705],
    },
    {
      id: "ship-channel",
      name: "Ship Channel & Pasadena",
      area: "East Harris County",
      summary: "Houston Ship Channel industrial corridor and Pasadena.",
      bbox: [-95.25, 29.69, -95.1, 29.765],
    },
    {
      id: "kingwood-lake-houston",
      name: "Kingwood & Lake Houston",
      area: "North Harris County",
      summary: "The San Jacinto River near Kingwood and the northern shore of Lake Houston.",
      bbox: [-95.3, 29.98, -95.13, 30.09],
    },
  ],
};

export const REGIONS: Region[] = [HOUSTON];
export const ZONES: Zone[] = REGIONS.flatMap((region) => region.zones);

export function findZone(id: string | null | undefined): Zone | undefined {
  return id ? ZONES.find((zone) => zone.id === id) : undefined;
}

export function zoneCenter(zone: Zone): LonLat {
  const [w, s, e, n] = zone.bbox;
  return [(w + e) / 2, (s + n) / 2];
}

/** Approximate zone size in km (east-west, north-south). */
export function zoneSizeKm(zone: Zone): [number, number] {
  const [w, s, e, n] = zone.bbox;
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  return [(e - w) * 111.32 * Math.cos(midLat), (n - s) * 110.57];
}

export function regionBBox(region: Region): BBox {
  return region.zones.reduce<BBox>(
    (acc, zone) => [
      Math.min(acc[0], zone.bbox[0]),
      Math.min(acc[1], zone.bbox[1]),
      Math.max(acc[2], zone.bbox[2]),
      Math.max(acc[3], zone.bbox[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}
