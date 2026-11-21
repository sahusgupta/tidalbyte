import type { PreparedBuildings } from './buildingGeometry'

export async function loadBuildings(region: string, signal?: AbortSignal): Promise<PreparedBuildings> {
  const path = `/api/regions/${region}/buildings`
  const response = await fetch(path, { signal })
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`)
  const bytes = await response.arrayBuffer()
  signal?.throwIfAborted()

  // Transfer the response once. Neither JSON parsing nor triangulation runs
  // on the thread that draws the site and handles map gestures.
  const worker = new Worker(new URL('./buildingGeometry.worker.ts', import.meta.url), { type: 'module' })
  let abort: (() => void) | undefined
  try {
    return await new Promise<PreparedBuildings>((resolve, reject) => {
      abort = () => reject(signal?.reason)
      signal?.addEventListener('abort', abort, { once: true })
      worker.onerror = event => reject(new Error(event.message || 'Unable to prepare building geometry'))
      worker.onmessage = ({ data }: MessageEvent<{ buildings: PreparedBuildings } | { error: string }>) => {
        if ('error' in data) reject(new Error(data.error))
        else resolve(data.buildings)
      }
      worker.postMessage(bytes, [bytes])
    })
  } finally {
    if (abort) signal?.removeEventListener('abort', abort)
    worker.terminate()
  }
}
