import { Building2, Eye, EyeOff, Siren } from 'lucide-react'
import { ACCESS_LEGEND, WATER_LEGEND } from '../lib/colors'

type Props = {
  buildingMode: 'flood' | 'access'
  onBuildingMode: (m: 'flood' | 'access') => void
  showWater: boolean
  onShowWater: (v: boolean) => void
}

/** One compact row: colour mode, ramp, route key (only when there is room), water toggle. */
export default function Legend({ buildingMode, onBuildingMode, showWater, onShowWater }: Props) {
  const ramp = buildingMode === 'access' ? ACCESS_LEGEND : WATER_LEGEND
  return (
    <div className="pointer-events-auto flex max-w-full items-center gap-3 whitespace-nowrap rounded-xl border border-white/[0.08] bg-[#0a1120]/85 px-2.5 py-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <div className="flex items-center gap-0.5 rounded-lg bg-black/30 p-0.5">
        {(
          [
            ['flood', 'Depth', Building2],
            ['access', 'ER access', Siren],
          ] as const
        ).map(([v, label, Icon]) => (
          <button
            key={v}
            type="button"
            onClick={() => onBuildingMode(v)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
              buildingMode === v ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {buildingMode === 'access' ? 'min' : 'depth'}
        </span>
        <div className="flex">
          {ramp.map((s) => (
            <div key={s.label} className="flex flex-col items-center" style={{ width: 34 }}>
              <div className="h-1.5 w-full first:rounded-l-full last:rounded-r-full" style={{ background: s.color }} />
              <span className="mt-0.5 font-mono text-[9.5px] text-slate-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden items-center gap-3 border-l border-white/10 pl-3 text-[10.5px] text-slate-400 xl:flex">
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-3.5 rounded-full bg-[#6ee7b7]" /> route
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-[3px] w-3.5 rounded-full bg-[#f85252]" /> closed
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-3.5 border-t-2 border-dashed border-white/70" /> usual
        </span>
      </div>

      <button
        type="button"
        onClick={() => onShowWater(!showWater)}
        aria-pressed={showWater}
        title={showWater ? 'Hide water' : 'Show water'}
        className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
          showWater ? 'bg-sky-400/15 text-sky-200' : 'bg-white/5 text-slate-400'
        }`}
      >
        {showWater ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        Water
      </button>
    </div>
  )
}
