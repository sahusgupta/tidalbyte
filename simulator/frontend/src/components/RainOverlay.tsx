import { useEffect, useRef } from 'react'

type Props = {
  rain: number // mm/h
  wind: number // 0..1, slant of the rain
  severity: number // 0..1, darkens the scene
}

type Drop = { x: number; y: number; len: number; speed: number; alpha: number }

/** Full-screen canvas: rain streaks scaled to intensity, wind slant, lightning in heavy storms. */
export default function RainOverlay({ rain, wind, severity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useRef({ rain, wind, severity })
  props.current = { rain, wind, severity }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0
    let h = 0
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

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
      const dt = Math.min((t - last) / 1000, 0.05)
      last = t
      const { rain: r, wind: wd, severity: sev } = props.current
      const target = reduce ? 0 : Math.round(Math.min(r, 220) * 5.5)
      while (drops.length < target) drops.push(spawn(drops.length < target / 2))
      if (drops.length > target) drops.length = target

      ctx.clearRect(0, 0, w, h)
      const slant = 0.08 + wd * 0.55
      ctx.lineCap = 'round'
      for (const d of drops) {
        d.y += d.speed * dt
        d.x += d.speed * dt * slant
        if (d.y > h + 40 || d.x > w + 200) Object.assign(d, spawn(false))
        ctx.strokeStyle = `rgba(190,215,255,${d.alpha})`
        ctx.lineWidth = d.len > 24 ? 1.4 : 1
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - d.len * slant, d.y - d.len)
        ctx.stroke()
      }

      if (!reduce && r > 85 && sev > 0.35 && t > nextBolt) {
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
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
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
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </>
  )
}
