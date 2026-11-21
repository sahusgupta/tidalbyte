import { prepareBuildings } from './buildingGeometry'

self.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    const buildings = prepareBuildings(JSON.parse(new TextDecoder().decode(data)))
    const buffers = Object.values(buildings.mesh.attributes).map(attribute => attribute.value.buffer)
    self.postMessage({ buildings }, { transfer: [buildings.mesh.startIndices.buffer, ...buffers] })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) })
  }
}
