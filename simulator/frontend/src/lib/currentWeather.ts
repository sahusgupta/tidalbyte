// Open-Meteo's current values are model estimates for the requested grid cell.
// https://open-meteo.com/en/docs#current
export interface CurrentWeather {
  validAt: number
  intervalSeconds: number
  rainMmPerHour: number
  temperatureC: number | null
  windKph: number | null
  windDirectionDeg: number | null
  weatherCode: number | null
}

const HOUR_MS = 60 * 60 * 1000

export function weatherIsFresh(validAt: number, now = Date.now()): boolean {
  const age = now - validAt
  return age >= 0 && age <= HOUR_MS
}

const conditions: Readonly<Record<number, string>> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Light rain', 63: 'Moderate rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light rain showers', 81: 'Moderate rain showers', 82: 'Heavy rain showers',
  85: 'Light snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with light hail', 99: 'Thunderstorm with heavy hail',
}

export function weatherDescription(code: number | null): string {
  return (code !== null && conditions[code]) || 'Condition unavailable'
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function fetchCurrentWeather(lat: number, lon: number, signal: AbortSignal): Promise<CurrentWeather> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new Error('Choose a location with valid coordinates.')
  }
  const query = new URLSearchParams({
    latitude: String(lat), longitude: String(lon),
    current: 'temperature_2m,rain,showers,wind_speed_10m,wind_direction_10m,weather_code',
    timeformat: 'unixtime', timezone: 'GMT',
    temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, {
    signal, credentials: 'omit',
  })
  if (!response.ok) throw new Error('Open-Meteo is unavailable. Try again shortly.')
  const payload: unknown = await response.json()
  if (!record(payload) || !record(payload.current) || !record(payload.current_units)) {
    throw new Error('Open-Meteo returned an incomplete weather report.')
  }
  const { current, current_units: units } = payload
  function quantity(key: string, unit: string, min = -Infinity, max = Infinity): number | null {
    const n = current[key]
    return units[key] === unit && typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const seconds = quantity('time', 'unixtime', 0)
  if (seconds === null || !weatherIsFresh(seconds * 1000)) {
    throw new Error('Open-Meteo has no current weather estimate for this time.')
  }
  const interval = quantity('interval', 'seconds', 1)
  const rain = quantity('rain', 'mm', 0)
  const showers = quantity('showers', 'mm', 0)
  if (interval === null || !Number.isInteger(interval) || rain === null || showers === null) {
    throw new Error('Open-Meteo has no usable rainfall estimate for this interval.')
  }
  // The two liquid components cover large-scale and convective precipitation.
  // The provider reports accumulated depth over the preceding interval.
  const rainMmPerHour = ((rain + showers) * 3600) / interval
  if (!Number.isFinite(rainMmPerHour)) throw new Error('Open-Meteo returned an invalid rainfall rate.')
  return {
    validAt: seconds * 1000,
    intervalSeconds: interval,
    rainMmPerHour,
    temperatureC: quantity('temperature_2m', '°C'),
    windKph: quantity('wind_speed_10m', 'km/h', 0),
    windDirectionDeg: quantity('wind_direction_10m', '°', 0, 360),
    weatherCode: quantity('weather_code', 'wmo code', 0, 99),
  }
}
