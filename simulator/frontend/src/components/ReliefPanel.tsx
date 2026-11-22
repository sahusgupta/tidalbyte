import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { parseAmount, placeName, type Place, type ReliefData } from '../lib/relief'
import './relief.css'

export const BUDGETS = [250_000, 1_000_000, 5_000_000]
export type ReliefFocus = 'people' | 'need'
export const FOCUS_PRIORITY: Record<ReliefFocus, number> = { people: 0, need: 0.75 }

const money = (v: number) => `$${v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}K` : Math.round(v)}`
const count = (v: number) => Math.round(v).toLocaleString('en-US')
const MIN_BUDGET = 1_000
const MAX_BUDGET = 10_000_000_000


type Props = {
  data: ReliefData | null
  places: Place[] | null
  budget: number
  onBudget: (v: number) => void
  focus: ReliefFocus
  onFocus: (v: ReliefFocus) => void
  highlighted: string | null
  onHighlight: (geoid: string | null) => void
  onLocate: (geoid: string) => void
  onCollapse: () => void
}

/** Where a donation would reach the most people in need during the storm on screen. */
export default function ReliefPanel({ data, places, budget, onBudget, focus, onFocus, highlighted, onHighlight, onLocate, onCollapse }: Props) {
  const custom = !BUDGETS.includes(budget)
  const [amount, setAmount] = useState(custom ? budget.toLocaleString('en-US') : '')
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { if (!BUDGETS.includes(budget)) setAmount(budget.toLocaleString('en-US')) }, [budget])
  const commit = (text: string) => {
    if (!text.trim()) return setInvalid(false)
    const value = parseAmount(text)
    const ok = Number.isFinite(value) && value >= MIN_BUDGET && value <= MAX_BUDGET
    setInvalid(!ok)
    if (ok) onBudget(Math.round(value))
  }
  // Two places can share a neighbourhood name; the census tract number tells them apart.
  const repeated = new Set((places ?? []).map((p) => placeName(p.tract)).filter((n, i, all) => all.indexOf(n) !== i))
  return (
    <aside className="sim-panel relief-panel">
      <header className="sim-layer-header">
        <h2 id="relief-panel-title">Relief money</h2>
        <button type="button" onClick={onCollapse} aria-label="Close relief money"><X size={18} /></button>
      </header>
      <div className="relief-body">
        <p className="relief-lede">Where a donation would help the most people in need during this storm.</p>

        <div className="relief-choice" role="group" aria-label="Budget">
          {BUDGETS.map((b) => (
            <button key={b} type="button" aria-pressed={b === budget} onClick={() => { setAmount(''); setInvalid(false); onBudget(b) }}>{money(b)}</button>
          ))}
        </div>
        <label className={`relief-amount${custom ? ' is-active' : ''}`}>
          <span>Other amount</span>
          <span className="relief-amount-field">
            <span aria-hidden="true">$</span>
            <input
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 750,000"
              value={amount}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'relief-amount-error' : undefined}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value) }}
            />
          </span>
        </label>
        {invalid && <p id="relief-amount-error" className="relief-error" role="alert">Enter an amount from $1,000, like 750,000 or 2.5m.</p>}
        <div className="relief-choice" role="group" aria-label="Who to reach first">
          <button type="button" aria-pressed={focus === 'need'} onClick={() => onFocus('need')}>Most in need</button>
          <button type="button" aria-pressed={focus === 'people'} onClick={() => onFocus('people')}>Most people</button>
        </div>

        {!data ? (
          <p className="relief-empty">Neighbourhood data isn’t available for this area.</p>
        ) : places === null ? (
          <p className="relief-empty">Run a storm to see where money would help.</p>
        ) : places.length === 0 ? (
          <p className="relief-empty">This storm doesn’t flood homes here, so there’s nowhere to send money yet.</p>
        ) : (
          <ol className="relief-places" aria-label={`Top places for ${money(budget)}`}>
            {places.map((p) => (
              <li key={p.tract.geoid}>
                <button
                  type="button"
                  aria-pressed={highlighted === p.tract.geoid}
                  onMouseEnter={() => onHighlight(p.tract.geoid)}
                  onFocus={() => onHighlight(p.tract.geoid)}
                  onClick={() => { onHighlight(p.tract.geoid); onLocate(p.tract.geoid) }}
                >
                  <span className="relief-rank" aria-hidden="true">{p.rank}</span>
                  <span className="relief-place">
                    <strong>
                      {placeName(p.tract)}
                      {repeated.has(placeName(p.tract)) && <em> · {p.tract.label.replace('Tract', 'tract')}</em>}
                    </strong>
                    <small>
                      {count(p.needs.flooded)} people flooded{p.reasons.length ? ` · ${p.reasons.join(', ')}` : ''}
                    </small>
                  </span>
                  <span className="relief-dollars">{money(p.dollars)}</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        <p className="relief-note">
          Uses this storm’s modeled flooding and 2022 census data. A starting point to check with local groups, not a needs
          assessment.
        </p>
        {data && (
          <details className="relief-how">
            <summary>How it’s worked out</summary>
            <p>
              Each place counts its residents in flooded homes, plus extra weight for people in deep water, without a car, or
              older or disabled and cut off from the hospital. “Most in need” gives more weight to places that rank high on the
              CDC Social Vulnerability Index. The budget is split in proportion across the top five places.
            </p>
            <ul>
              {data.sources.map((s) => (
                <li key={s.name}><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  )
}
