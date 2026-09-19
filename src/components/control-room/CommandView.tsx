import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  CloudRain,
  Database,
  Gauge,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Siren,
  TrendingUp,
  Waves,
} from 'lucide-react'
import type {
  Alert,
  HydroReading,
  ImpactAssessment,
  RuleEvaluation,
  Station,
} from '../../api'
import './CommandView.css'

type CommandVillage = {
  id: string
  name: string
  risk: string
  riskScore: number | null
  eta: number | null
  x: number
  y: number
  population: number
  downstreamOrder: number | null
}

type EvaluationWithBreakdown = RuleEvaluation & {
  level_score?: number | null
  rate_score?: number | null
  sensor_score?: number | null
  community_score?: number | null
  persistence_score?: number | null
}

type Props = {
  riverCode: 'TEESTA' | 'DESANG'
  station: Station | null | undefined
  reading: HydroReading | null | undefined
  latestEvaluation: EvaluationWithBreakdown | null | undefined
  activeAlert: Alert | null
  zones: CommandVillage[]
  impactAssessments: ImpactAssessment[]
  totalPopulationAtRisk: number
  nearestImpact: ImpactAssessment | null
  dataModeLabel: string
  impactLoading: boolean
  impactError: string
  refreshing: boolean
  onRiverChange: (riverCode: 'TEESTA' | 'DESANG') => void
  onRefresh: () => void
  onReviewAlert: () => void
}

function riskKey(value: string | null | undefined) {
  const normalized = (value ?? 'normal').toLowerCase()
  if (normalized === 'critical' || normalized === 'high' || normalized === 'warning' || normalized === 'watch') return normalized
  return 'normal'
}

function riskLabel(value: string | null | undefined) {
  return riskKey(value).toUpperCase()
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—'
}

function formatEta(value: number | null | undefined) {
  return typeof value === 'number' ? `${Math.round(value)} min` : '—'
}

function score(value: number | null | undefined) {
  return typeof value === 'number' ? value.toFixed(1) : '0.0'
}

function mapPath(zones: CommandVillage[]) {
  if (zones.length < 2) return ''
  return zones.map((zone, index) => `${index === 0 ? 'M' : 'L'} ${zone.x} ${zone.y}`).join(' ')
}

export function CommandView({
  riverCode,
  station,
  reading,
  latestEvaluation,
  activeAlert,
  zones,
  impactAssessments,
  totalPopulationAtRisk,
  nearestImpact,
  dataModeLabel,
  impactLoading,
  impactError,
  refreshing,
  onRiverChange,
  onRefresh,
  onReviewAlert,
}: Props) {
  const [selectedVillageId, setSelectedVillageId] = useState<string | null>(null)
  const path = useMemo(() => mapPath(zones), [zones])
  const selectedVillage = zones.find((zone) => zone.id === selectedVillageId) ?? null
  const recommendation = Boolean(latestEvaluation?.alert_recommended)
  const risk = riskKey(latestEvaluation?.risk_level)
  const priority = activeAlert?.priority ?? latestEvaluation?.alert_priority ?? 'P3'
  const totalScore = latestEvaluation?.total_score
  const impactByVillage = useMemo(
    () => new Map(impactAssessments.map((item) => [item.village_id, item])),
    [impactAssessments],
  )

  const scoreParts = [
    ['River level', latestEvaluation?.level_score, '/ 60'],
    ['Rate of rise', latestEvaluation?.rate_score, '/ 20'],
    ['Sensor confirmation', latestEvaluation?.sensor_score, '/ 10'],
    ['Community evidence', latestEvaluation?.community_score, '/ 5'],
    ['Persistence', latestEvaluation?.persistence_score, '/ 5'],
  ] as const

  return (
    <div className="command-page">
      <section className="command-hero">
        <div>
          <div className="command-kicker"><ShieldCheck size={15} /> CONTROL ROOM / COMMAND VIEW</div>
          <h1>Hazard state, decision evidence and population impact</h1>
          <p>One operational view of the current basin. Every headline metric below is derived from the existing FastAPI data path.</p>
        </div>
        <div className="command-controls">
          <label>
            <span>ACTIVE BASIN</span>
            <select value={riverCode} onChange={(event) => onRiverChange(event.target.value as 'TEESTA' | 'DESANG')}>
              <option value="TEESTA">Teesta / CWC Melli</option>
              <option value="DESANG">Desang / CWC Nanglamoraghat</option>
            </select>
          </label>
          <button className="command-refresh" onClick={onRefresh} disabled={refreshing} title="Refresh backend data">
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing' : 'Refresh data'}
          </button>
        </div>
      </section>

      <section className="command-statusbar">
        <span><span className="command-live-dot" /> BACKEND CONNECTED</span>
        <span><Database size={14} /> {dataModeLabel}</span>
        <span><Clock3 size={14} /> Last observation {formatDateTime(reading?.observed_at)}</span>
      </section>

      <section className="command-stat-grid">
        <div className={`command-stat ${risk}`}>
          <span className="command-stat-label">RISK STATE</span>
          <strong>{riskLabel(latestEvaluation?.risk_level)}</strong>
          <small>{totalScore != null ? `${score(totalScore)}/100 rule-engine score` : 'Waiting for evaluation'}</small>
        </div>
        <div className="command-stat">
          <span className="command-stat-label">WATER LEVEL</span>
          <strong>{reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : '—'}</strong>
          <small>{station?.station_name ?? 'Station unavailable'}</small>
        </div>
        <div className="command-stat">
          <span className="command-stat-label">TIME TO IMPACT</span>
          <strong>{formatEta(nearestImpact?.time_to_impact_minutes)}</strong>
          <small>{nearestImpact ? zones.find((zone) => zone.id === nearestImpact.village_id)?.name ?? 'Nearest assessed village' : 'No impact assessment'}</small>
        </div>
        <div className="command-stat">
          <span className="command-stat-label">POPULATION AT RISK</span>
          <strong>{formatNumber(totalPopulationAtRisk)}</strong>
          <small>{impactAssessments.length} assessed villages</small>
        </div>
      </section>

      <section className="command-main-grid">
        <div className="command-column">
          <section className="command-panel command-map-panel">
            <div className="command-panel-head">
              <div>
                <span className="command-section-label">01 / IMPACT VIEW</span>
                <h2>{station?.river_name ?? riverCode} downstream assessment</h2>
              </div>
              <span className="command-source-chip"><CloudRain size={14} /> {station?.station_name ?? 'CWC station'}</span>
            </div>

            <div className="command-map">
              <div className="command-map-grid" />
              <div className="command-map-river river-a" />
              <div className="command-map-river river-b" />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="command-route-svg" aria-hidden="true">
                <path d={path} className="command-route" />
              </svg>

              <div className="command-station-node">
                <div><Waves size={16} /></div>
                <span>{station?.station_name ?? 'Hydro station'}</span>
              </div>

              {zones.map((zone) => {
                const impact = impactByVillage.get(zone.id)
                const riskClass = riskKey(impact?.risk_level ?? zone.risk)
                return (
                  <button
                    key={zone.id}
                    className={`command-village-node ${riskClass} ${selectedVillageId === zone.id ? 'selected' : ''}`}
                    style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
                    onClick={() => setSelectedVillageId(zone.id)}
                    title={`${zone.name} — ${riskLabel(impact?.risk_level ?? zone.risk)}`}
                  >
                    <span className="node-ring"><span /></span>
                    <span className="node-label"><b>{zone.name}</b><small>{riskLabel(impact?.risk_level ?? zone.risk)}{impact?.risk_score != null ? ` · ${Math.round(impact.risk_score)}` : ''}</small></span>
                  </button>
                )
              })}

              <div className="command-map-legend">
                <span><i className="legend-critical" /> Higher impact</span>
                <span><i className="legend-route" /> Assessment path</span>
              </div>
            </div>

            {selectedVillage && (
              <div className="command-selected-village">
                <div><MapPin size={16} /><b>{selectedVillage.name}</b></div>
                <span>{riskLabel(impactByVillage.get(selectedVillage.id)?.risk_level ?? selectedVillage.risk)}</span>
                <span>{formatEta(impactByVillage.get(selectedVillage.id)?.time_to_impact_minutes ?? selectedVillage.eta)} to impact</span>
                <span>{formatNumber(impactByVillage.get(selectedVillage.id)?.population_at_risk ?? selectedVillage.population)} people</span>
              </div>
            )}
          </section>

          <section className="command-panel">
            <div className="command-panel-head">
              <div>
                <span className="command-section-label">02 / AFFECTED VILLAGES</span>
                <h2>Who is in the current impact assessment?</h2>
              </div>
              <span className="command-count">{impactAssessments.length} assessed</span>
            </div>

            {impactLoading ? (
              <div className="command-state"><span className="command-spinner" /> Loading impact assessment…</div>
            ) : impactError ? (
              <div className="command-state error"><AlertTriangle size={16} /> {impactError}</div>
            ) : impactAssessments.length ? (
              <div className="command-impact-table">
                <div className="command-table-head"><span>Village</span><span>Risk</span><span>ETA</span><span>Population</span><span>Order</span></div>
                {impactAssessments.map((impact) => {
                  const village = zones.find((zone) => zone.id === impact.village_id)
                  return (
                    <button key={impact.village_id} className={`command-table-row ${selectedVillageId === impact.village_id ? 'selected' : ''}`} onClick={() => setSelectedVillageId(impact.village_id)}>
                      <span className="command-village-cell"><CircleDot size={14} /><b>{village?.name ?? impact.village_id}</b></span>
                      <span><em className={`risk-tag ${riskKey(impact.risk_level)}`}>{riskLabel(impact.risk_level)}</em><small>{Math.round(impact.risk_score)}/100</small></span>
                      <strong>{formatEta(impact.time_to_impact_minutes)}</strong>
                      <span>{formatNumber(impact.population_at_risk)}</span>
                      <span>#{impact.downstream_order ?? '—'}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="command-state"><Info size={16} /> No persisted impact assessment is available for the current alert.</div>
            )}
            <div className="command-footnote"><Info size={14} /> Impact ETA and risk are supplied by the backend impact engine. Current prototype ordering uses the seeded downstream-order model.</div>
          </section>
        </div>

        <aside className="command-side">
          <section className="command-panel hazard-panel">
            <div className="command-panel-head">
              <div>
                <span className="command-section-label">03 / HAZARD TELEMETRY</span>
                <h2>{station?.station_name ?? 'Station'}</h2>
              </div>
              <span className={`risk-tag ${risk}`}>{riskLabel(latestEvaluation?.risk_level)}</span>
            </div>
            <div className="hazard-metric-grid">
              <div><small>Current</small><b>{reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : '—'}</b></div>
              <div><small>Warning</small><b>{station?.warning_level_m != null ? `${Number(station.warning_level_m).toFixed(2)} m` : '—'}</b></div>
              <div><small>Danger</small><b>{station?.danger_level_m != null ? `${Number(station.danger_level_m).toFixed(2)} m` : '—'}</b></div>
              <div><small>HFL</small><b>{station?.highest_flood_level_m != null ? `${Number(station.highest_flood_level_m).toFixed(2)} m` : '—'}</b></div>
            </div>
            <div className="hazard-meta-line">
              <span><TrendingUp size={14} /> Rate <b>{reading?.water_level_rate_m_hr != null ? `${Number(reading.water_level_rate_m_hr).toFixed(2)} m/hr` : '—'}</b></span>
              <span><Clock3 size={14} /> Observed <b>{formatTime(reading?.observed_at)}</b></span>
            </div>
          </section>

          <section className={`command-panel decision-panel ${risk}`}>
            <div className="command-panel-head">
              <div>
                <span className="command-section-label">04 / RULE ENGINE DECISION</span>
                <h2>Evidence behind the current score</h2>
              </div>
              <div className="decision-score">{totalScore != null ? Math.round(totalScore) : '—'}<small>/100</small></div>
            </div>

            <div className="score-breakdown">
              {scoreParts.map(([label, value, max]) => (
                <div key={label}><span>{label}</span><b>{score(value)} <small>{max}</small></b></div>
              ))}
            </div>

            <div className="decision-summary">
              <div className="decision-status-icon">{recommendation ? <Siren size={18} /> : <CheckCircle2 size={18} />}</div>
              <div><b>{recommendation ? `Alert recommendation · ${priority}` : 'No public alert recommendation'}</b><span>{latestEvaluation?.reasons?.join(' · ') ?? 'No scoring explanation available.'}</span></div>
            </div>

            {activeAlert ? (
              <div className="active-alert-box">
                <div><span>ACTIVE ALERT</span><b>{activeAlert.title}</b></div>
                <em>{activeAlert.status.replaceAll('_', ' ')}</em>
                <button onClick={onReviewAlert}>Review alert & impact <ArrowRight size={14} /></button>
              </div>
            ) : recommendation ? (
              <div className="approval-message"><ShieldCheck size={15} /><span>Human approval is required before public dispatch.</span></div>
            ) : null}
          </section>

          <section className="command-panel provenance-panel">
            <div className="command-panel-head">
              <div>
                <span className="command-section-label">05 / DATA PROVENANCE</span>
                <h2>What this screen is using</h2>
              </div>
            </div>
            <div className="provenance-list">
              <div><span><Database size={15} /></span><div><b>Hydrology</b><small>{station?.station_name ?? '—'} · CWC-derived observation</small></div></div>
              <div><span><Gauge size={15} /></span><div><b>Rule evaluation</b><small>{latestEvaluation?.evaluated_at ? `Evaluated ${formatDateTime(latestEvaluation.evaluated_at)}` : 'No evaluation loaded'}</small></div></div>
              <div><span><MapPin size={15} /></span><div><b>Impact assessment</b><small>{impactAssessments.length ? `${impactAssessments.length} villages returned by backend` : 'No persisted assessment'}</small></div></div>
            </div>
            <div className="provenance-note"><Info size={14} /> CWC observations in this prototype may be historical or replayed. This page does not label them as a live CWC feed.</div>
          </section>

          <section className="command-chain">
            <span>DETECTION CHAIN</span>
            <div><b>Observe</b><ArrowDown size={14} /><b>Evaluate</b><ArrowDown size={14} /><b>Assess impact</b><ArrowDown size={14} /><b>Recommend</b></div>
          </section>
        </aside>
      </section>
    </div>
  )
}
