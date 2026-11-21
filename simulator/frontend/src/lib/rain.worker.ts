import { startRain, type RainState } from './rainRenderer'
let state: RainState
let stop: (() => void) | undefined
self.onmessage = (event: MessageEvent<{ state: RainState; canvas?: OffscreenCanvas }>) => {
  state = event.data.state
  if (event.data.canvas) {
    stop?.()
    stop = startRain(event.data.canvas, () => state)
  }
}
