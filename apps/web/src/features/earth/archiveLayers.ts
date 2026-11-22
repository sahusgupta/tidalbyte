export type Bounds = readonly [number, number, number, number];
export const HOUSTON_ARCHIVE_LAYERS: readonly { url: string; bounds: Bounds }[] = [
  { url: "/map/houston-usgs.webp", bounds: [-95.9, 29.249921875, -94.7, 30.200078125] },
  { url: "/map/houston-detail-usgs.webp", bounds: [-95.570036869, 29.6, -95.079963131, 29.96] },
];
