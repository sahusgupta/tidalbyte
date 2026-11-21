# Restore the local Houston simulator

The integration lead approves a local launch repair on the existing AquaGrid client. All five Houston areas use its deck.gl building layer and the same regional API.

- Integration owns the startup scripts and setup instructions. The normal development command should start the services needed by the area chooser and continue to honor an externally configured simulator.
- The simulator repair restores the pointer handling used by its existing map and route controls. The frontend change on the host is limited to the crowded area selector on small screens.
- Browser QA follows the product landing, opens each area, checks that extruded buildings are drawn, runs the storm and places a ground pin on desktop and touch.

The site keeps its current navigation and the version 1 zone handoff. Prepared model files stay in the local simulator data directory.
