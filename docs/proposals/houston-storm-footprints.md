# Houston storm footprints and service planning

Accepted by the integration lead for the simulator, graph and client workstreams.

The existing AquaGrid simulate request may include an event with a kind (flood or hurricane), one to eight longitude/latitude vertices in the region, a radius in kilometres and optional traversal progress from zero to one. Its first vertex is the origin. Omitting the event preserves region-wide forcing. Optional spatial results describe the traversed storm track, terrain drainage paths and exposure grouped by the nearest named neighborhood reference point. Keep existing geometry indexing, route semantics and thresholds.

Use the selected simulation's public road and building exposure to inform a bounded agency planning comparison. Keep intervention benefits and service effects explicitly illustrative, and preserve existing allocation endpoints and clients. The simulator team owns hazard estimates and the map. The graph team owns allocation and its connection to regional exposure. Integration owns storm editing, results presentation, verification and handoff.

No raw geodata, weights, service keys or changes to landing-page navigation are needed.
