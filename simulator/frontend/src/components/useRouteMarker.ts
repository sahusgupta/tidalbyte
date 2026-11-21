import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { DeckGLRef } from '@deck.gl/react'
import type { LonLat } from '../lib/api'

/** Moving a single screen-space dot doesn't require redrawing every building. */
export function useRouteMarker(deck: RefObject<DeckGLRef | null>, coords?: LonLat[]) {
  const marker = useRef<HTMLSpanElement>(null)
  const refresh = useRef<((time: number) => void) | null>(null)
  const projectMarker = useCallback(() => refresh.current?.(performance.now()), [])

  useEffect(() => {
    const dot = marker.current
    if (!dot || !coords || coords.length < 2) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const distance = [0]
    for (let i = 1; i < coords.length; i++) {
      const [x, y] = coords[i]
      const [previousX, previousY] = coords[i - 1]
      distance.push(distance[i - 1] + Math.hypot((x - previousX) * 0.9, y - previousY))
    }
    let frame = 0
    let last = 0
    const draw = (time: number) => {
      const viewport = deck.current?.deck?.getViewports()[0]
      if (!viewport) return
      const phase = motion.matches ? 0 : (time % 7000) / 7000
      const target = (1 - phase) * distance[distance.length - 1]
      let lo = 1, hi = coords.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (distance[mid] < target) lo = mid + 1
        else hi = mid
      }
      const t = (target - distance[lo - 1]) / (distance[lo] - distance[lo - 1] || 1)
      const [ax, ay] = coords[lo - 1]
      const [bx, by] = coords[lo]
      const [x, y] = viewport.project([ax + t * (bx - ax), ay + t * (by - ay)])
      dot.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
      dot.style.visibility = 'visible'
    }
    const tick = (time: number) => {
      if (time - last >= 33) {
        draw(time)
        last = time
      }
      frame = requestAnimationFrame(tick)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      draw(performance.now())
      if (!motion.matches) frame = requestAnimationFrame(tick)
    }
    refresh.current = draw
    schedule()
    motion.addEventListener('change', schedule)
    return () => {
      motion.removeEventListener('change', schedule)
      cancelAnimationFrame(frame)
      refresh.current = null
      dot.style.visibility = 'hidden'
    }
  }, [coords, deck])

  return { marker, projectMarker }
}
