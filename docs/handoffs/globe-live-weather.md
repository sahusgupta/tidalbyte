# Live Houston weather

Branch `feat/globe-live-weather`, based on integrated main at `90bcbe5`.

- Atlas entry point: **Scenario settings → Live weather**. Select a Houston
  bookmark for wind and liquid rainfall at its coordinates. Weather is a
  time-stamped Open-Meteo model estimate. The wind and rain marks are an
  illustration over archival imagery. Back returns to the edited scenario.
- Flood simulator entry point: **Storm controls → Live weather**. With a
  prepared region, the current rain estimate drives the same simulation and
  playback as manual controls. The scenario assumes one hour, zero added surge
  and 10% lost drainage capacity. Slider edits return to Custom.
- Both frontends use the adapter in `simulator/frontend/src/lib/currentWeather.ts`.
  It requires a usable source timestamp, supported units and both liquid
  rainfall components. It converts accumulated millimeters to mm/h using
  the returned interval. The atlas offers a labeled example when the feed
  fails. The simulator retains the previous scenario on a failed request.
- Both production builds passed. The atlas suite passed 92 tests, including
  nine provider tests. The Python suite passed 86 tests and skipped three
  optional ML modules in the environment without NumPy.
- Chrome checks included a real Houston weather request, controlled rain/dry
  responses, stale and missing feeds, location switches, manual overrides
  and desktop, tablet and phone layouts. Simulator requests were verified with
  controlled region and weather responses. A prepared regional flood model
  remains necessary to verify the resulting flood outputs end to end.

The [desktop browser capture](../../apps/web/docs/qa/live-weather-1440.jpg)
shows the actual Houston feed during verification.

The atlas needs internet access for the current estimate and runs without a
weather API key. The changes are frontend-only. See the
[provider documentation](https://open-meteo.com/en/docs#current) for source
fields and [simulator setup](../../simulator/README.md) for regional data.
