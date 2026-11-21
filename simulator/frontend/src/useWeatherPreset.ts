import { useCallback, useEffect, useRef, useState } from 'react'
import type { Meta } from './lib/api'
import { fetchCurrentWeather, weatherIsFresh, type CurrentWeather } from './lib/currentWeather'

export const WEATHER_PRESET = 'current-weather'
export const MAX_SCENARIO_RAIN = 200
const REFRESH_MS = 15 * 60_000

const validTime = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  timeZone: 'America/Chicago', timeZoneName: 'short',
})

export const weatherTime = (reading: CurrentWeather) => validTime.format(reading.validAt)
export const rainRate = (rain: number) => rain.toLocaleString(undefined, { maximumFractionDigits: 2 })
const initial = { reading: null as CurrentWeather | null, loading: false, message: '' }

/** Keep an applied snapshot through a failed refresh. Leaving weather mode discards it. */
export function useWeatherPreset(
  region: Meta['region'] | undefined,
  onApply: (reading: CurrentWeather) => void,
) {
  const [state, setState] = useState(initial)
  const [now, setNow] = useState(Date.now)
  const request = useRef<AbortController | null>(null)
  const clear = useCallback(() => {
    request.current?.abort()
    request.current = null
    setState(initial)
  }, [])

  useEffect(() => {
    clear()
    return () => request.current?.abort()
  }, [region, clear])

  const refresh = useCallback(async () => {
    if (!region) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setState(previous => ({ ...previous, loading: true, message: '' }))
    try {
      const [west, south, east, north] = region.bbox
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)])
      const reading = await fetchCurrentWeather((south + north) / 2, (west + east) / 2, signal)
      if (controller.signal.aborted) return
      if (reading.rainMmPerHour > MAX_SCENARIO_RAIN) {
        throw new Error(`The reported rain rate exceeds this simulator’s ${MAX_SCENARIO_RAIN} mm/h range.`)
      }
      onApply(reading)
      setNow(Date.now())
      setState({ reading, loading: false, message: '' })
    } catch (error) {
      if (controller.signal.aborted) return
      setState(previous => ({
        ...previous,
        loading: false,
        message: error instanceof Error ? error.message : 'Weather service unavailable.',
      }))
    }
  }, [onApply, region])

  const active = state.reading !== null
  useEffect(() => {
    if (!active) return
    const poll = window.setInterval(refresh, REFRESH_MS)
    const clock = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [active, refresh])

  const fresh = state.reading !== null && weatherIsFresh(state.reading.validAt, now)
  return { ...state, fresh, clear, refresh }
}

export type WeatherPreset = ReturnType<typeof useWeatherPreset>
