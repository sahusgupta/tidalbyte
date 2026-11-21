import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <aside
      className={`pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a1120]/80 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] backdrop-blur-xl ${className}`}
    >
      {children}
    </aside>
  )
}

export function SectionTitle({ icon: Icon, children, right }: { icon?: LucideIcon; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.2} />}
        {children}
      </h2>
      {right}
    </div>
  )
}

export function Slider({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  display,
  sub,
  accent,
  onChange,
}: {
  icon: LucideIcon
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  sub?: string
  accent: string
  onChange: (v: number) => void
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-slate-200">
          <Icon className="h-3.5 w-3.5" style={{ color: accent }} strokeWidth={2} />
          {label}
        </span>
        <span className="whitespace-nowrap text-right">
          <span className="font-mono text-[12.5px] font-semibold tabular-nums text-white">{display}</span>
          {sub && <span className="ml-1 font-mono text-[10px] tabular-nums text-slate-500">{sub}</span>}
        </span>
      </div>
      <input
        type="range"
        className="god-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${pct}%`, ['--accent' as string]: accent }}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: LucideIcon; hint?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="grid gap-1 rounded-xl bg-black/30 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[11.5px] font-medium transition-colors ${
              active ? 'bg-white/[0.1] text-white shadow-inner' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {o.label}
            </span>
            {o.hint && <span className="font-mono text-[10px] text-slate-500">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Select({
  icon: Icon,
  value,
  onChange,
  children,
  label,
}: {
  icon: LucideIcon
  value: string
  onChange: (v: string) => void
  children: ReactNode
  label: string
}) {
  return (
    <label className="relative flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/25 px-2.5 py-2 transition-colors focus-within:border-cyan-400/50 hover:border-white/15">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none truncate bg-transparent pr-5 text-[13px] text-slate-100 outline-none"
      >
        {children}
      </select>
      <svg className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
        <path d="M5.5 7.5 10 12l4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      </svg>
    </label>
  )
}

export function Kpi({
  label,
  value,
  unit,
  sub,
  tone = 'neutral',
  icon: Icon,
}: {
  label: string
  value: string
  unit?: string
  sub?: ReactNode
  tone?: 'neutral' | 'water' | 'warn' | 'danger'
  icon: LucideIcon
}) {
  const toneCls = {
    neutral: 'text-slate-300',
    water: 'text-sky-300',
    warn: 'text-amber-300',
    danger: 'text-rose-300',
  }[tone]
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
        <Icon className={`h-3.5 w-3.5 ${toneCls}`} />
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`font-mono text-[18px] font-semibold leading-none tabular-nums ${toneCls}`}>{value}</span>
        {unit && <span className="text-[12px] text-slate-500">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[11px] leading-snug text-slate-500">{sub}</div>}
    </div>
  )
}
