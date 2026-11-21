import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCurrentWeather,
  weatherDescription,
  weatherIsFresh,
} from "../../../../simulator/frontend/src/lib/currentWeather";

const now = Date.UTC(2026, 10, 21, 22, 25);
const time = Date.UTC(2026, 10, 21, 22, 15) / 1000;

function feed(current = {}, units = {}) {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const fetcher = vi.fn().mockResolvedValue(Response.json({
    current: {
      time, interval: 900, rain: 0.25, showers: 0.5, temperature_2m: 22,
      wind_speed_10m: 4, wind_direction_10m: 109, weather_code: 80, ...current,
    },
    current_units: {
      time: "unixtime", interval: "seconds", rain: "mm", showers: "mm",
      temperature_2m: "°C", wind_speed_10m: "km/h", wind_direction_10m: "°",
      weather_code: "wmo code", ...units,
    },
  }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const signal = new AbortController().signal;
const read = () => fetchCurrentWeather(29.76, -95.37, signal);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("current weather model inputs", () => {
  it("requests the selected coordinates and converts liquid depth to an interval-average rate", async () => {
    const fetcher = feed();
    const sample = await read();
    expect(sample).toEqual({
      validAt: time * 1000, intervalSeconds: 900, rainMmPerHour: 3,
      temperatureC: 22, windKph: 4, windDirectionDeg: 109, weatherCode: 80,
    });
    const [href, options] = fetcher.mock.calls[0];
    expect(new URL(href).searchParams.get("longitude")).toBe("-95.37");
    expect(new URL(href).searchParams.get("latitude")).toBe("29.76");
    expect(options.signal).toBe(signal);
  });

  it("preserves a dry estimate, calm winds and missing optional data", async () => {
    feed({ rain: 0, showers: 0, wind_speed_10m: 0, temperature_2m: null }, { wind_direction_10m: "radians" });
    expect(await read()).toMatchObject({ rainMmPerHour: 0, windKph: 0, windDirectionDeg: null, temperatureC: null });
  });

  it.each([
    [{ showers: null }, {}], [{ rain: -1 }, {}], [{ interval: 0 }, {}],
    [{}, { rain: "inch" }], [{}, { interval: "minutes" }],
  ])("rejects missing rainfall or unverifiable units", async (values, units) => {
    feed(values, units);
    await expect(read()).rejects.toThrow(/rainfall/);
  });

  it("uses the provider interval and rejects expired or future valid times", async () => {
    feed({ interval: 3600 });
    expect((await read()).rainMmPerHour).toBe(0.75);
    expect(weatherIsFresh(now - 3_600_001, now)).toBe(false);
    expect(weatherIsFresh(now + 1, now)).toBe(false);
    feed({ time: time - 3600 });
    await expect(read()).rejects.toThrow(/no current/);
  });

  it("describes supported weather codes and handles unknown conditions", () => {
    expect(weatherDescription(0)).toBe("Clear sky");
    expect(weatherDescription(65)).toBe("Heavy rain");
    expect(weatherDescription(11)).toBe("Condition unavailable");
    expect(weatherDescription(null)).toBe("Condition unavailable");
  });
});
