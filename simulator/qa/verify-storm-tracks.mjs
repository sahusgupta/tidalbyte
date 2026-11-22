// Run against a prepared AquaGrid service: node simulator/qa/verify-storm-tracks.mjs
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const base = process.env.QA_AQUAGRID_URL ?? 'http://127.0.0.1:8001'
const pins = JSON.parse(await readFile(new URL('./verified-pins.json', import.meta.url), 'utf8'))
const regions = process.env.QA_ZONES?.split(',') ?? Object.keys(pins)

async function json(path, body) {
  const res = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(90_000),
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  assert.ok(res.ok, `${path} HTTP ${res.status}`)
  return res.json()
}

for (const region of regions) {
  const path = `/api/regions/${region}`
  const meta = await json(`${path}/meta`)
  const pin = pins[region]
  const source = meta.neighborhoods[0]
  const track = [[source.lon, source.lat], pin.lonlat]
  const request = {
    rain: 125, duration: 6, clog: 0.45, surge: region === 'ship-channel' ? 0.3 : 0,
    hospital: pin.hospitalId, vehicle: pin.vehicle, dest_lonlat: pin.lonlat,
  }
  const simulate = progress => json(`${path}/simulate`, {
    ...request, event: { kind: region === 'ship-channel' ? 'hurricane' : 'flood', track, radius_km: 1.2, progress },
  })
  const start = await simulate(0)
  const end = await simulate(1)
  assert.deepEqual(start.spatial.active_track, track.slice(0, 1))
  assert.deepEqual(end.spatial.active_track, track)
  assert.deepEqual(end.scenario.event.track, track)
  assert.ok(start.overlay !== end.overlay, `${region}: water raster did not advance`)
  assert.ok(start.edges.some((depth, i) => depth !== end.edges[i]), `${region}: street depths did not change`)
  assert.ok(end.stats.roads.flooded_km > start.stats.roads.flooded_km)
  for (const result of [start, end]) {
    const { areas, flow_paths } = result.spatial
    assert.ok(flow_paths.length > 0)
    const [west, south, east, north] = meta.grid.bounds
    for (const line of flow_paths) {
      assert.ok(line.length > 1)
      assert.ok(line.every(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north))
    }
    assert.deepEqual(areas.map(a => a.flooded_road_km), areas.map(a => a.flooded_road_km).sort((a, b) => b - a))
    assert.equal(areas.reduce((s, a) => s + a.affected_buildings, 0), result.stats.buildings.flooded)
    const sumBlocked = areas.reduce((s, a) => s + a.blocked_road_km, 0)
    assert.ok(Math.abs(sumBlocked - result.stats.roads.impassable_km) <= 0.051 + areas.length * 0.005)
    assert.equal(Buffer.from(result.closed_edges_b64, 'base64').length, Math.ceil(result.edges.length / 8))
    const { route } = result
    assert.equal(route.hospital.id, pin.hospitalId)
    assert.equal(route.dest.id, 'custom')
    assert.deepEqual([route.dest.lon, route.dest.lat], pin.lonlat)
    assert.ok(route.dry?.length_m > 0)
    if (route.status === 'blocked') assert.equal(route.current, null)
    else assert.ok(route.current?.coords.length > 1 && route.current.length_m > 0)
  }
  console.log(`${region} | ${source.name} → pin | flooded ${start.stats.roads.flooded_km} → ${end.stats.roads.flooded_km} km | route ${start.route.status} → ${end.route.status} | ${end.spatial.flow_paths.length} terrain traces`)
}
