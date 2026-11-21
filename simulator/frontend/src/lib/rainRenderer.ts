export type RainState = {
  rain: number; wind: number; severity: number
  width: number; height: number; dpr: number; reduce: boolean
}
type Drop = { x: number; y: number; len: number; speed: number; alpha: number }

export const dropCount = (rain: number) => Math.round(Math.min(Math.max(rain, 0), 220) * 5.5)

export function startRain(canvas: HTMLCanvasElement | OffscreenCanvas, read: () => RainState, onIdle: () => void) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) return () => {}
  let w = 0, h = 0, dpr = 0
  const weather = { ...read(), rain: 0 }
    const drops: Drop[] = []
    const spawn = (anywhere: boolean): Drop => ({
      x: Math.random() * (w + 400) - 200,
      y: anywhere ? Math.random() * h : -40 - Math.random() * 200,
      len: 10 + Math.random() * 22,
      speed: 900 + Math.random() * 700,
      alpha: 0.12 + Math.random() * 0.3,
    })
    let flash = 0
    let nextBolt = performance.now() + 3000
    let last = performance.now()
    let raf = 0

    const frame = (t: number) => {
      const state = read()
      if (w !== state.width || h !== state.height || dpr !== state.dpr) {
        w = state.width; h = state.height; dpr = state.dpr
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      const blend = 1 - Math.exp(-dt / 0.16)
      weather.rain += (state.rain - weather.rain) * blend
      weather.wind += (state.wind - weather.wind) * blend
      weather.severity += (state.severity - weather.severity) * blend
      const { rain: r, wind: wd, severity: sev } = weather
      const target = dropCount(r)
      if (state.reduce || (!target && !dropCount(state.rain) && flash <= 0.005)) {
        ctx.clearRect(0, 0, w, h)
        onIdle()
        return
      }
      while (drops.length < target) drops.push(spawn(drops.length < target / 2))
      if (drops.length > target) drops.length = target

      ctx.clearRect(0, 0, w, h)
      const slant = 0.08 + wd * 0.55
      ctx.lineCap = 'round'
      // Advance particles once, then batch strokes by width/opacity. This keeps
      // the same density and motion with eight canvas strokes instead of 1,200.
      for (const d of drops) {
        d.y += d.speed * dt
        d.x += d.speed * dt * slant
        if (d.y > h + 40 || d.x > w + 200) Object.assign(d, spawn(false))
      }
      for (let bucket = 0; bucket < 8; bucket++) {
        ctx.strokeStyle = `rgba(190,215,255,${0.1575 + (bucket % 4) * 0.075})`
        ctx.lineWidth = bucket >= 4 ? 1.4 : 1
        ctx.beginPath()
        for (const d of drops) {
          const group = Math.min(3, Math.floor((d.alpha - 0.12) / 0.075)) + (d.len > 24 ? 4 : 0)
          if (group !== bucket) continue
          ctx.moveTo(d.x, d.y)
          ctx.lineTo(d.x - d.len * slant, d.y - d.len)
        }
        ctx.stroke()
      }

      if (!state.reduce && r > 85 && sev > 0.35 && t > nextBolt) {
        flash = 0.22 + Math.random() * 0.18
        nextBolt = t + 2500 + Math.random() * 6000
      }
      if (flash > 0.005) {
        ctx.fillStyle = `rgba(220,232,255,${flash})`
        ctx.fillRect(0, 0, w, h)
        flash *= Math.random() < 0.15 ? 1.6 : 0.82 // flicker
        if (flash > 0.45) flash = 0.3
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
  return () => cancelAnimationFrame(raf)
}
