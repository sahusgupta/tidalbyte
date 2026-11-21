# Local opening performance

The integration lead approves changes to the existing landing, AquaGrid frontend and backend on separate worktrees. The product keeps the current Houston navigation, data, interactive map layers, building heights, local service ports and API response shapes.

- The landing owner defers the globe until its chapter is visible and avoids drawing while the chooser or hidden document covers it.
- The map owner prepares static building geometry away from the UI thread and reduces repeated rendering of static city geometry.
- The simulator backend owner measures metadata, geometry transfer and scenario latency using the prepared regional artifacts. Any caching must respect rebuilt data.
- Integration overlaps data loading, code loading and the initial model request, verifies region changes, and compares the same local browser flow before and after the repair.
