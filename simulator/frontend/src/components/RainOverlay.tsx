import { useEffect, useRef } from 'react'
import { startRain, type RainState } from '../lib/rainRenderer'

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
    const read = (): RainState => ({
      ...weather.current, width: host.clientWidth, height: host.clientHeight,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5), reduce: preference.matches,
    })
    // A fresh canvas per mount also supports React StrictMode effect replay.
    let canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    host.appendChild(canvas)
    let worker: Worker | undefined
    let stop: (() => void) | undefined
    const fallback = () => {
      worker?.terminate()
      worker = undefined
      const replacement = canvas.cloneNode() as HTMLCanvasElement
      canvas.replaceWith(replacement)
      canvas = replacement
      stop = startRain(canvas, read)
    }
    try {
      if (!canvas.transferControlToOffscreen) throw new Error('Offscreen canvas unavailable')
      worker = new Worker(new URL('../lib/rain.worker.ts', import.meta.url), { type: 'module' })
      worker.onerror = fallback
      const offscreen = canvas.transferControlToOffscreen()
      worker.postMessage({ canvas: offscreen, state: read() }, [offscreen])
    } catch {
      fallback()
    }
    const update = () => worker?.postMessage({ state: read() })
    publish.current = update
    const observer = new ResizeObserver(update)
    observer.observe(host)
    preference.addEventListener('change', update)
    return () => {
      publish.current = null
      observer.disconnect()
      preference.removeEventListener('change', update)
      worker?.terminate()
      stop?.()
      canvas.remove()
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
