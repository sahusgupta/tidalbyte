export function Sources() {
  return (
    <div className="source-sheet">
      <dl className="sources-index">
        <div>
          <dt>
            Basemap <span>Geographic reference</span>
          </dt>
          <dd>
            The atlas uses local USGS aerial imagery. Imagery provides orientation only. See the map
            credits for the active provider.
          </dd>
        </div>
        <div>
          <dt>
            Roads <span>Curated example</span>
          </dt>
          <dd>
            EarthLab's independently drawn sample represents a small set of Houston corridors.
            Positions and connections are approximate. Actual road conditions are unknown.
          </dd>
        </div>
        <div>
          <dt>
            Hurricane <span>Hypothetical</span>
          </dt>
          <dd>
            Waypoints define the trajectory. The moving circle uses a fixed 6 km inspection radius.
            Rainfall and intensity are annotations. Duration controls the time scale.
          </dd>
        </div>
        <div>
          <dt>
            Flood <span>Illustrative</span>
          </dt>
          <dd>
            The circular footprint grows from 35% of its final radius to 100% across the timeline.
            Intersections describe the geometry of this sketch. No depth or road passability is
            estimated.
          </dd>
        </div>
        <div>
          <dt>
            Connectivity <span>Hypothetical</span>
          </dt>
          <dd>
            Sample closures remove links from the alternative graph. Reachability is measured from a
            single reference node. Backend comparisons, when available, use the backend's own edge
            IDs.
          </dd>
        </div>
        <div>
          <dt>
            County severity <span>Warning context</span>
          </dt>
          <dd>
            Only the separate supported county scenario is sent for evaluation. Offline values are
            fixed fixture indices. Trained results apply to positive-outage hours associated with
            warnings. The editor does not infer road damage from county outputs.
          </dd>
        </div>
      </dl>
    </div>
  );
}
