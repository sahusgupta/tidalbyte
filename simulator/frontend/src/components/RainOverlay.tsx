import { useEffect, useRef } from 'react'
import { dropCount, startRain, type RainState } from '../lib/rainRenderer'

type Props = { rain: number; wind: number; severity: number }

export default function RainOverlay({ rain, wind, severity }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const weather = useRef({ rain, wind, severity })
  const publish = useRef<(() => void) | null>(null)
  weather.current = { rain, wind, severity }
  useEffect(() => { publish.current?.() }, [rain, wind, severity])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let state: RainState
    let canvas: HTMLCanvasElement | undefined
    let worker: Worker | undefined
    let stop: (() => void) | undefined
    let allowWorker = 'transferControlToOffscreen' in HTMLCanvasElement.prototype
    const release = () => {
      if (worker) {
        worker.onmessage = worker.onerror = null
        worker.terminate()
        worker = undefined
      }
      stop?.()
      stop = undefined
      canvas?.remove()
      canvas = undefined
    }
    const settled = () => {
      release()
      // The worker can finish fading just as the user selects a new storm.
      update()
    }
    const update = () => {
      state = {
        ...weather.current, width: host.clientWidth, height: host.clientHeight,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5), reduce: preference.matches,
      }
      if (state.reduce || !state.width || !state.height || document.hidden) {
        release()
        return
      }
      if (canvas) {
        worker?.postMessage({ state })
        return
      }
      if (!dropCount(state.rain)) return
      canvas = document.createElement('canvas')
      canvas.style.cssText = 'width:100%;height:100%;display:block'
      host.appendChild(canvas)
      if (allowWorker) {
        const fallback = () => {
          allowWorker = false
          settled() // A transferred canvas needs to be replaced for the main thread.
        }
        try {
          worker = new Worker(new URL('../lib/rain.worker.ts', import.meta.url), { type: 'module' })
          worker.onmessage = ({ data }) => { if (data === 'idle') settled() }
          worker.onerror = (event) => { event.preventDefault(); fallback() }
          const offscreen = canvas.transferControlToOffscreen()
          worker.postMessage({ canvas: offscreen, state }, [offscreen])
        } catch {
          fallback()
        }
      } else {
        stop = startRain(canvas, () => state, settled)
      }
    }
    publish.current = update
    const observer = new ResizeObserver(update)
    observer.observe(host)
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    update()
    return () => {
      publish.current = null
      observer.disconnect()
      preference.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
      release()
    }
  }, [])

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: severity,
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(4,8,18,0) 30%, rgba(4,8,18,0.55) 75%, rgba(2,4,10,0.85) 100%)',
        }}
      />
      <div ref={hostRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  )
}
