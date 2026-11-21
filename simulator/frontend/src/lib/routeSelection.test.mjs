import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameRouteSelection } from './routeSelection.ts'

const request = { rain: 25, duration: 1, surge: 0, clog: .1,
  vehicle: 'ambulance', hospital: 'hospital-a', dest_lonlat: [-95.38, 29.76] }

test('continuous storm edits permit intermediate results while newer inputs are queued', () => {
  for (let rain = 26; rain < 150; rain++) {
    assert.equal(sameRouteSelection(request, { ...request, rain, duration: 3, surge: 1, clog: .5 }), true)
  }
})

test('new endpoints or vehicle reject an obsolete route result', () => {
  for (const change of [
    { hospital: 'hospital-b' }, { vehicle: 'sedan' },
    { dest_lonlat: [-95.39, 29.76] }, { dest_lonlat: [-95.38, 29.77] },
    { dest_lonlat: undefined, dest: 'houston-heights' },
  ]) assert.equal(sameRouteSelection(request, { ...request, ...change }), false)
})
