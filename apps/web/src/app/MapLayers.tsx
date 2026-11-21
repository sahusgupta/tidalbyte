import { LayerToggle } from "./FieldTools";
import { Icon } from "./Icon";
import type { Layers } from "./ScenarioRail";

export function MapLayers({
  layers,
  hurricane,
  mapStyle,
  onStyle,
  setLayer,
  offline,
  onCounty,
  onSources,
}: {
  layers: Layers;
  hurricane: boolean;
  mapStyle: "field" | "aerial";
  onStyle: (style: "field" | "aerial") => void;
  setLayer: (id: keyof Layers, enabled: boolean) => void;
  offline: boolean;
  onCounty: () => void;
  onSources: () => void;
}) {
  return (
    <div className="layer-sheet">
      <fieldset>
        <legend>Basemap</legend>
        <div className="basemap-options">
          {(["field", "aerial"] as const).map((id) => (
            <button key={id} aria-pressed={mapStyle === id} onClick={() => onStyle(id)}>
              <span className={`base-sample ${id}`} aria-hidden="true" />
              {id === "field" ? "Field map" : "Aerial"}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Map overlays</legend>
        <LayerToggle
          label={hurricane ? "Hypothetical storm track" : "Illustrative flood footprint"}
          styleName={hurricane ? "hazard" : "water"}
          value={layers.hazard}
          set={(v) => setLayer("hazard", v)}
        />
        <LayerToggle
          label="Sample road network"
          styleName="road"
          value={layers.roads}
          set={(v) => setLayer("roads", v)}
        />
        {layers.roads && (
          <ul className="road-key">
            <li>
              <i className="closure-swatch" />
              Assumed closure
            </li>
            <li>
              <i className="isolated-swatch" />
              Disconnected link
            </li>
          </ul>
        )}
        <LayerToggle
          label="County severity"
          styleName="county"
          value={layers.outages}
          set={(v) => setLayer("outages", v)}
        />
        {layers.outages && (
          <button className="sheet-link" onClick={onCounty}>
            {offline ? "Offline example" : "Conditional model"} · county readings
            <Icon name="arrow" size={14} />
          </button>
        )}
      </fieldset>
      <button className="sheet-link" onClick={onSources}>
        <Icon name="book" size={16} />
        Sources & assumptions
        <Icon name="arrow" size={14} />
      </button>
    </div>
  );
}
