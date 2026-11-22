import type { SimRequest } from './api'

/** Storm changes can stream; a result for another route selection cannot. */
export function sameRouteSelection(a: SimRequest, b: SimRequest): boolean {
  return a.event === b.event && a.vehicle === b.vehicle && a.hospital === b.hospital &&
    a.dest === b.dest && a.dest_lonlat?.[0] === b.dest_lonlat?.[0] &&
    a.dest_lonlat?.[1] === b.dest_lonlat?.[1]
}
