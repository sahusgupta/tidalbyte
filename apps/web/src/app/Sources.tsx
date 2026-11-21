import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

export function Sources({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      className="sources-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="sources-title"
    >
      <div className="dialog-head">
        <div>
          <h2 id="sources-title">Sources & assumptions</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close sources"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <dl>
        <dt>Basemap · geographic reference</dt>
        <dd>
          The atlas uses local USGS aerial imagery. Imagery provides orientation
          only. See the map credits for the active provider.
        </dd>
        <dt>Roads · curated example</dt>
        <dd>
          EarthLab's independently drawn sample represents a small set of
          Houston corridors. Positions and connections are approximate. Actual
          road conditions are unknown.
        </dd>
        <dt>Hurricane · hypothetical</dt>
        <dd>
          Waypoints define the trajectory. The moving circle uses a fixed 6 km
          inspection radius. Rainfall and intensity are annotations. Duration
          controls the time scale.
        </dd>
        <dt>Flood · illustrative</dt>
        <dd>
          The circular footprint grows from 35% of its final radius to 100%
          across the timeline. Intersections describe the geometry of this
          sketch. No depth or road passability is estimated.
        </dd>
        <dt>Connectivity · hypothetical</dt>
        <dd>
          Sample closures remove links from the alternative graph. Reachability
          is measured from a single reference node. Backend comparisons, when
          available, use the backend's own edge IDs.
        </dd>
        <dt>County severity · warning context</dt>
        <dd>
          Only the separate supported county scenario is sent for evaluation.
          Offline values are fixed fixture indices. Trained results apply to
          positive-outage hours associated with warnings. The editor does not
          infer road damage from county outputs.
        </dd>
      </dl>
    </dialog>
  );
}
