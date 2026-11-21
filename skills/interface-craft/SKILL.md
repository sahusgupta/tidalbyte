---
name: interface-craft
description: Design, implement, and critically refine distinctive web, mobile, and desktop interfaces. Use for UI creation, redesign, visual polish, responsive design, design systems, and screenshot-based critique. Prioritizes subject-led compositions, oversized cropped focal elements, tangible materials, deliberate typography, functional usability, and avoidance of generic AI-generated aesthetics.
---

# Interface Craft: a design director for Codex

## Mission
Build software that looks commissioned by a thoughtful design studio, not assembled from a generic AI landing-page template. Every interface must express its subject, audience, and job. Treat visual design as a sequence of explicit decisions, not decoration added after implementation.

**Hierarchy of priorities:** correctness and usability > legibility and accessibility > subject-specific identity > visual novelty > ornamental effects. The order matters: a gorgeous unusable screen is a failed screen.

## Invocation and operating mode
Apply when creating or substantially modifying a web page, web app, mobile app, desktop app, component library, onboarding flow, dashboard, or visual prototype. For a narrow bug fix, preserve the established visual language unless redesign is requested. Honor existing product identity, design tokens, platform conventions, and explicit user directions before this skill's preferences.

Work autonomously when the brief is sufficiently clear. Ask questions only when missing information changes core functionality, platform, audience, or brand. Otherwise state sensible assumptions briefly and proceed. Do not turn design planning into a lengthy questionnaire.

## Phase 1: interrogate the subject before touching code
Determine:
1. **Subject:** What specific object, service, activity, place, or domain is this about? What does it physically look and feel like?
2. **Audience:** Who is using it, in what environment, with what urgency and expertise?
3. **Primary action:** What must the user accomplish in the first 10 seconds? What must they accomplish repeatedly?
4. **Platform:** Is this a marketing site, operational web app, mobile app, desktop application, or hybrid? What input methods, screen sizes, and native conventions apply?
5. **Content:** What actual content and data exist? Do not invent testimonials, customer logos, metrics, or product capabilities.
6. **Constraints:** Existing repository, framework, asset library, brand, performance budget, accessibility, localization, and deadline.

Write a compact internal creative brief: one-sentence product purpose, one-sentence visual thesis, three domain-derived motifs, primary action, and one anti-pattern to avoid. Do not display this to users unless useful.

## Phase 2: commit to an art direction
Choose one coherent direction grounded in the subject, not a random fashionable style. Possible starting languages: archival catalog, technical field manual, tactile workshop, museum label, Swiss wayfinding, scientific instrument, collectible packaging, cinematic editorial, industrial control panel, fine-print publication, playful classroom, or restrained native utility. These are prompts for interpretation, not reusable templates.

For each direction define:
- **Signature moment:** the single most memorable visual move.
- **Material vocabulary:** one primary physical surface and at most two supporting materials, if materials are relevant.
- **Typography:** display, body, numeric/technical styles; select fonts for their shapes, language coverage, license, and availability.
- **Composition:** grid, asymmetry, dominant axis, negative space, cropping, and density.
- **Color:** colors derived from objects, print, environment, or product identity, with restrained accents.
- **Interaction:** meaningful feedback and one optional expressive transition.

Do not reuse the same palette, font pairing, hero structure, and card treatment across unrelated projects. Distinctiveness is contextual, not a fixed house style.

## Phase 3: break the canvas intentionally
**Default preference for expressive screens:** magnify the subject until it becomes an architectural element of the layout. The composition may continue beyond the visible page.

Use techniques selectively:
- A photographic or illustrated object extends beyond the viewport edge; crop it intentionally rather than shrinking it to fit.
- Oversized typography interacts with imagery, is partially occluded, or crosses a grid boundary while keeping essential words readable.
- Layer foreground subjects over quieter content planes with clear depth ordering.
- Employ off-center focal points, asymmetrical columns, edge-to-edge bands, and purposeful whitespace.
- Use a cutout silhouette, scan, exploded view, macro detail, or physically plausible object photograph when appropriate.
- Allow ornamental artwork to bleed; **never** let primary controls, form fields, safety text, or essential data bleed out of reach.

The page must remain stable at mobile sizes. Decorative overflow can be clipped; horizontal scrolling must never appear accidentally. Prefer `overflow: clip` on specific art containers over hiding overflow globally. Test long labels, zoom, translated copy, and narrow screens. Use object-position or art-direction-specific crops, not a single blind center crop everywhere.

**Do not force giant hero imagery into dense applications.** In dashboards and workflows, concentrate expressive scale in onboarding, empty states, section headers, selected detail views, or a small brand motif. Optimize work surfaces for scanning and task completion.

## Phase 4: physical materials before digital effects
Treat a physical material as a source of form, not a noisy background preset. Prefer material references such as:
- uncoated paper, vellum, index cards, receipt stock, letterpress, ink bleed, halftone, screenprint;
- birch plywood, cork, brushed metal, enamel, etched glass, concrete, stone;
- canvas, linen, stitched fabric, leather, embossed packaging, adhesive labels;
- blueprints, architectural tracing sheets, technical diagrams, maps, catalog tabs.

Material use must be **causally connected to the subject**. A carpentry tool may use plywood grain and measuring marks; a research archive may use scanned paper and catalog notation; a financial operations tool probably needs mostly quiet, high-contrast surfaces, not wood everywhere.

Implementation rules:
- Prefer a well-shot authentic texture image or carefully produced procedural texture over random CSS noise.
- Use low-contrast textures on broad planes; keep text-bearing surfaces calm and readable.
- Show scale, grain direction, edge treatment, joints, shadow, and light consistently if simulating material.
- Do not overlay one repeating grain texture on every component.
- Use color as an accent or substrate, not as a substitute for composition.
- Avoid default solid-color expanses and generic gradient backdrops on expressive pages; a solid neutral is **allowed and often preferable** for dense functional UI, accessibility, dark mode, and performance.
- Avoid purple-blue gradient blobs, ambient glow, frosted-glass cards, floating orbs, and indiscriminate blur unless genuinely demanded by the product.
- Keep textures optimized (modern image formats, appropriate dimensions, compression); provide graceful fallbacks when assets fail.
- Do not scrape copyrighted imagery or imply generated art is a real product photo. Use approved assets, licensed material, or original/generated assets when permitted.

## Phase 5: typography is architecture
- Choose type to express the domain, not simply because it is fashionable.
- Make a clear distinction among display, body, metadata, and tabular numerals.
- Use strong but controlled contrast in scale, weight, width, case, and tracking.
- Build a responsive type scale using `clamp()` where appropriate; set sensible min/max values.
- Keep body copy readable, with comfortable line length and line height; do not sacrifice readability to fit a visual.
- Prefer deliberate line breaks in editorial headlines, but avoid brittle hard-coded breaks at every viewport.
- Use tabular numerals for columns, prices, timestamps, and changing metrics.
- Do not default every project to Inter, Space Grotesk, Roboto, or a high-contrast serif paired with monospace. These fonts are allowed if justified, not as autopilot.
- Avoid uppercase tracked eyebrow labels on every section, arbitrary `01 / 02 / 03` numbering, and decorative microcopy that conveys nothing.

## Phase 6: structure follows the product
### Marketing / editorial web
Lead with the subject itself: actual product, compelling object, live interaction, distinctive editorial composition, or useful demonstration. A centered headline + two buttons + dashboard mockup is not the automatic opening. Sections must answer real questions in a meaningful order. Avoid the unearned sequence of hero, logo cloud, three identical feature cards, testimonials, pricing, FAQ.

### Operational web apps
Prioritize information hierarchy, real data states, fast navigation, predictable controls, dense but legible tables, filters, and clear action feedback. Distinctiveness should emerge through typography, micro-layout, iconography, restrained material references, and purpose-built data visualization. Do not turn every data point into a giant rounded card.

### Mobile apps
Design for one-handed reach where appropriate, safe areas, platform navigation, dynamic type, keyboard intrusion, touch feedback, and interrupted sessions. Favor native conventions for sheets, tab bars, back navigation, permissions, and gestures. Minimum touch targets: roughly 44x44 pt on iOS and 48x48 dp on Android where platform guidance applies. Never use hover as the only way to discover an action. Large artwork may be cropped but may not obstruct essential navigation or controls.

### Desktop apps
Take advantage of wide canvases, resizable panes, keyboard shortcuts, menus, contextual actions, pointer precision, drag/drop where justified, and multi-window workflows. Support window resizing and small-window states. Do not simply stretch a mobile screen or place a landing-page hero inside the app shell. Consider compact information density and persistent navigation.

### Cross-platform consistency
Keep the same identity, terminology, domain imagery, color semantics, and interaction principles. Adapt layout, navigation, density, and controls to each platform rather than enforcing pixel-identical screens. Share design tokens and domain components when architecture allows; use platform-specific components when needed.

## Phase 7: composition and component discipline
- Establish a grid, spacing scale, border/radius vocabulary, and content widths before composing screens.
- Use asymmetry with purpose, not random offsets. Every element needs a visual anchor.
- Prefer a few carefully varied regions over a wall of identical cards.
- Let visual hierarchy reflect task priority; one primary action per context where practical.
- Use borders, rules, labels, tabs, badges, and numbers to communicate structure, not to simulate sophistication.
- Keep corner radii consistent with material and function; do not give every surface a large pill radius.
- Shadows should reflect plausible elevation or separation. Avoid uniform gray drop shadows on every box.
- Use icons that match the product's visual vocabulary. Do not sprinkle unrelated icons on headings.
- Use meaningful empty space; distinguish it from under-designed blankness.
- Do not manufacture fake graphs, analytics, customers, reviews, or integrations to fill the layout.
- Content and copy must be specific. Replace 'Revolutionize your workflow' with the actual action and outcome.

## Phase 8: interaction and motion
Use motion to explain causality, orientation, and state change: selection, expansion, navigation, loading, completion, and error recovery. Prefer one signature motion event over repeated fade-up-on-scroll animations. Avoid perpetual ambient motion, gratuitous parallax, cursor-following decorations, and slow page transitions that delay use.

Keep interaction feedback prompt and consistent. Provide hover, focus-visible, pressed, disabled, loading, success, empty, and error states. Respect `prefers-reduced-motion`; disable nonessential motion and preserve information without animation. Use transforms and opacity when practical, avoiding layout thrash. Do not add animation libraries without clear benefit.

## Phase 9: implementation discipline
1. Inspect the repository, existing conventions, dependencies, design tokens, routes, and assets before editing.
2. Reuse the existing stack and components unless the brief requires otherwise. Do not replace architecture for cosmetic reasons.
3. Create a compact token system for color roles, typography, spacing, radius, borders, elevation, and motion.
4. Build a coherent primary screen first, then propagate its visual rules to adjacent screens.
5. Use real data when available; otherwise label mock data clearly and make it plausible without implying factual claims.
6. Use semantic markup, correct labels, keyboard navigation, screen-reader support, and appropriate contrast.
7. Handle responsive layouts, long content, empty states, loading, errors, dark mode if requested, and asset failure.
8. Keep bundle size and rendering costs reasonable. Do not add large dependencies just for ornamental effects.
9. Run available lint, typecheck, tests, and build checks. Report honestly what was and was not executed.
10. When browser/device tools exist, render and inspect actual screenshots. Do not claim visual QA from reading source code alone.

## Phase 10: mandatory visual critique and repair
After the first render, perform an adversarial design review. Ask:
- Could this be mistaken for a default AI SaaS template if the logo were removed?
- Is the visual direction tied to the subject, or could it be transplanted to any product?
- Is there one memorable, intentional composition rather than 20 unrelated flourishes?
- Is the focal subject large enough to feel designed? Is the crop controlled?
- Are physical textures authentic, subtle, and functional, or just noise?
- Does the typography establish a recognizable identity and readable hierarchy?
- Is the content concrete rather than generic marketing filler?
- Do all controls have visible purpose, correct states, and keyboard/touch accessibility?
- Does mobile preserve the design intent without breaking layout or usability?
- Are all graphics, images, and fonts actually loaded?

Fix the **three most consequential** issues, then review again. For a hackathon, prioritize a polished first viewport, one complete primary workflow, and a coherent mobile/desktop adaptation over decorative breadth.

### Screenshot QA matrix
When tooling is available, test web at approximately 390, 768, and 1440 CSS pixels; check at 200% zoom when feasible. Test mobile on representative small and large devices, with keyboard visible and dynamic text scaling. Test desktop at compact and expanded window sizes. Inspect for overflow, broken crops, unreadable contrast, clipped controls, strange spacing, font fallback, motion issues, and inconsistent states. Capture screenshots before declaring the UI complete.

### Anti-slop veto list
Reject and redesign any unrequested use of:
- purple/blue gradient hero with glowing blobs;
- generic glass cards and soft shadows everywhere;
- centered hero plus two pill CTAs plus stock dashboard mockup;
- three or six identical feature cards used to invent structure;
- fake statistics, testimonials, logo clouds, and meaningless charts;
- excessive rounded rectangles, badges, icon circles, and pills;
- vague hype copy and repeated 'AI-powered', 'seamless', 'unlock', 'reimagine';
- repeated all-caps eyebrow labels, arbitrary numbering, and decorative arrows;
- identical fade-and-slide-up reveals on every section;
- visual assets that could belong to any industry;
- unusable oversized type, accidental overflow, or inaccessible low-contrast text.

These are **defaults to reject**, not universal bans. Explicit user requests and genuine product needs can justify any of them.

## Decision protocol under time pressure
For a 30–90 minute hackathon build:
- **First 5 minutes:** inspect context; choose subject, primary action, visual thesis, and platform.
- **Next 10 minutes:** establish type, material, composition, tokens, and one memorable visual move.
- **Main build:** complete the functional primary journey and responsive shell before adding secondary polish.
- **Final 15 minutes:** screenshot, critique, fix the top three visual defects, and verify interactions.

Do not spend the entire session generating moodboards or inventing decorative sections. Shipping a functional, unmistakably designed screen beats a half-built concept.

## Output contract
Deliver the working implementation, not merely a design description. In the final response, briefly state the visual direction, key implemented flows, files changed, validation performed, and any unverified or incomplete items. Never claim tests, screenshot checks, device checks, or production readiness without evidence.

## Reference material
Read `references/DESIGN-RESEARCH.md` when making a new art direction or conducting a visual critique. Treat external examples as inspiration and diagnostic evidence, not a template to copy.
