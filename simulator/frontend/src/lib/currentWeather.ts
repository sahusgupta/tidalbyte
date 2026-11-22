const conditions: Record<number, string> = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Freezing fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Freezing drizzle', 57: 'Freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with hail', 99: 'Thunderstorm with hail',
}

export async function currentWeather(latitude: number, longitude: number, signal: AbortSignal) {
  const params = new URLSearchParams({
    latitude: String(latitude), longitude: String(longitude),
    current: 'weather_code,temperature_2m,rain,showers',
    temperature_unit: 'fahrenheit', timeformat: 'unixtime',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  })
  if (!response.ok) throw new Error('Weather unavailable')
  const { current } = await response.json()
  if (!current || ![current.weather_code, current.temperature_2m, current.rain, current.showers,
    current.interval, current.time].every(Number.isFinite) || current.interval <= 0 ||
    current.rain < 0 || current.showers < 0) throw new Error('Incomplete weather data')
  const time = new Date(current.time * 1000).toLocaleTimeString('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
  return {
    label: `${conditions[current.weather_code] ?? 'Current conditions'} · ${Math.round(current.temperature_2m)}°F`,
    source: `Open-Meteo · ${time}`,
    rain: Math.min(200, (current.rain + current.showers) * 3600 / current.interval),
  }
}
