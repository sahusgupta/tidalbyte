# Visual Direction | Earth as an Instrument

## Mandatory UI skill
Use `$interface-craft` in every frontend design session. Snapshot installed at `skills/interface-craft/SKILL.md`. On any other machine, install skill in Codex/Claude environment, then read the full file. Do not assume naming a skill is the same as reading it. Follow all phases including screenshot critique, accessibility and anti-cliché audit.

## Art direction
**'Planetary Atlas / Mission Instrument'**: make the Earth the physical subject. It should dominate the screen and bleed behind restrained information rails, not sit in a tiny generic SaaS card. Matte charcoal instrument enclosure, fine engraved ruler ticks, uncoated off-white field-note panels, hairline cartographic line work, subdued oxidized copper and amber alerts. Use physical textures on side panels, not over satellite imagery or numerical legends. No glows, neon gradients, bubbly cards, fake mission-control dashboards or 3D-orb generic hero.

## Layout
- 70% viewport dedicated to globe in P0. Narrow left rail: disaster scenario setup. Floating but anchored right evidence inspector: county/source/baseline/model outputs. Bottom filmstrip timeline and Run/Compare, overlays always spatially anchored.
- Start immediately in app, not a marketing page. 'Houston: historical warning case' is a one-click visible control.
- Use short, restrained headlines; oversized 'Earth' subject is the compositional focal point, not giant decorative typography blocking controls.
- Make timeline interactions legible, show model states clearly: `historical`, `model estimate`, `hypothetical`, `example offline`. Distinguish uncertainty in encoding, never just color.
- Fonts: legible technical sans for UI, tabular numerals for data, restrained editorial face for one or two titles if licensed. Don't force Inter/Space Grotesk defaults.
- Motion: smooth globe fly-in and measured overlay transitions; do not imply physical accuracy through fake cinematic storm clouds. Honor reduced-motion.
- Color: charcoal #24282A, bone #EEE9DC, ink #26333A, storm amber #DDA35C, warning coral #C65C4A, low-risk teal #3C807A. Ensure accessible contrast; use colorblind-safe categorical legend and patterns.

## UX interaction
- Default state visually useful with no API keys. Tooltips and overlays must show what is actual versus illustrative.
- User: Select historical event -> see model region overlay -> inspect county -> ask what-if -> compare infrastructure planning options -> hear concise spoken briefing.
- Always provide a typed command bar and manual clickable controls even when voice is offline.
- Data readouts must never fabricate numbers. Mock fixtures are clearly watermarked as such.

## Adobe/design judging emphasis
- A scene transition from orbit to Houston is the single signature moment.
- Think *premium geospatial scientific instrument*, not marketing template, glassmorphism, or fake NASA dashboard.
- Screenshot review at 1440x900, 1280x720, 768x1024; verify globe remains usable, all controls visible, map attributions intact.
- Accessibility: keyboard reachable buttons, contrast, descriptive legends, transcript text alternatives and reduced-motion support.

## Reference to installed skill
Skill root copied into this repo with full references where available. The skill guides all UI behavior; this document defines product-specific choices and wins if a general preference conflicts with map clarity.
