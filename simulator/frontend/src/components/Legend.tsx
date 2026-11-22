import { Building2, Eye, EyeOff, Siren, X } from 'lucide-react'
import { ACCESS_LEGEND, WATER_LEGEND } from '../lib/colors'
import { Panel, SectionTitle } from './ui'
import './floodMapKey.css'

type Props = {
  buildingMode: 'flood' | 'access'
  onBuildingMode: (m: 'flood' | 'access') => void
  showWater: boolean
  onShowWater: (v: boolean) => void
  onCollapse: () => void
}

export default function Legend({ buildingMode, onBuildingMode, showWater, onShowWater, onCollapse }: Props) {
  const ramp = buildingMode === 'access' ? ACCESS_LEGEND : WATER_LEGEND
  return <Panel>
    <header className="sim-layer-header"><h2 id="layers-panel-title">Map layers</h2><button type="button" onClick={onCollapse} aria-label="Close map layers"><X size={18} /></button></header>
    <div className="sim-layer-content">
      <section>
        <SectionTitle>Building color</SectionTitle>
        <div className="sim-layer-options">
          {([['flood', 'Water depth', Building2], ['access', 'ER access', Siren]] as const).map(([value, label, Icon]) => <button key={value} type="button" onClick={() => onBuildingMode(value)} aria-pressed={buildingMode === value}><Icon size={16} aria-hidden="true" />{label}</button>)}
        </div>
        <p className="sim-layer-unit">{buildingMode === 'access' ? 'Modeled response time · minutes' : 'Modeled water depth · meters'}</p>
        <div className="sim-ramp">{ramp.map((step) => <div key={step.label}><i style={{ background: step.color }} /><span>{step.label}</span></div>)}</div>
      </section>
      <section>
        <SectionTitle>Ground overlay</SectionTitle>
        <button type="button" className="sim-water-toggle" onClick={() => onShowWater(!showWater)} aria-pressed={showWater}>
          {showWater ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />} Water {showWater ? 'shown' : 'hidden'}
        </button>
        <p className="sim-layer-unit">Blue water covers modeled wet streets. Its height follows depth and its width uses the road class.</p>
        <dl className="sim-route-key sim-water-key">
          <dt><i className="storm-key" /></dt><dd>Storm track · dashes ahead</dd>
          <dt><i className="runoff-key" /></dt><dd>Terrain runoff · downstream</dd>
        </dl>
      </section>
      <section>
        <SectionTitle>Route key</SectionTitle>
        <dl className="sim-route-key"><dt><i className="route-current" /></dt><dd>Modeled route</dd><dt><i className="route-closed" /></dt><dd>Modeled closed segment</dd><dt><i className="route-dry" /></dt><dd>Dry-weather route</dd></dl>
      </section>
      <p className="sim-layer-note">Colors describe the selected model scenario. They do not establish current flood depth, traffic, or road safety.</p>
    </div>
  </Panel>
}
