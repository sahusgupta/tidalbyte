# Simulator hand-off

EarthLab does not include a street & flood simulator. It opens an external one for the zone the
user picked on the globe. Zones live in `../earth/zones.ts`.

## Plug a simulator in

1. Run the simulator somewhere this browser can reach.
2. Add its URL to the repository-root `.env`:

   ```bash
   VITE_SIMULATOR_URL=http://localhost:8080/
   ```

3. Restart the web dev server. Clicking a zone flies the camera in, then opens the simulator
   full-screen inside EarthLab. Deep link format: `/#/zone/<zone-id>`.

Without `VITE_SIMULATOR_URL`, the zone opens a "not connected yet" panel that shows the exact
URL and message the simulator would receive. No simulation output is shown there.

## What the simulator receives

**Query parameters** on its URL (any existing parameters are kept):

| Parameter | Example | Meaning |
|---|---|---|
| `zone` | `downtown-buffalo-bayou` | Stable zone id |
| `name` | `Downtown & Buffalo Bayou` | Display name |
| `bbox` | `-95.43,29.735,-95.335,29.79` | west,south,east,north (WGS84 degrees) |
| `center` | `-95.3825,29.7625` | lon,lat |
| `v` | `1` | Contract version |

**A message** posted to the iframe after it loads, with `targetOrigin` set to the simulator's origin:

```json
{ "source": "earthlab", "type": "zone", "version": 1,
  "zone": { "id": "downtown-buffalo-bayou", "name": "Downtown & Buffalo Bayou",
            "bbox": [-95.43, 29.735, -95.335, 29.79], "center": [-95.3825, 29.7625] } }
```

## What the simulator can send back

Use `window.parent.postMessage(message, "*")` or the EarthLab origin. EarthLab only accepts these
messages, and only from the simulator's own origin and iframe:

| Message | Effect |
|---|---|
| `{ "source": "simulator", "type": "ready" }` | Hides the "Connecting…" notice |
| `{ "source": "simulator", "type": "status", "message": "Loading terrain…" }` | Shows a short status line (max 200 chars) |
| `{ "source": "simulator", "type": "exit" }` | Closes the simulator and returns to the zones |

The iframe is sandboxed with `allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads`.
If the simulator sends `X-Frame-Options: DENY` or a restrictive `frame-ancestors` CSP, it cannot be
embedded; use the "Open in new tab" link, which carries the same query parameters.

## Labelling

Per `docs/01-PRODUCT.md`, the simulator must label its output as hypothetical or exploratory
unless it is validated. EarthLab's globe imagery is a display layer only.
