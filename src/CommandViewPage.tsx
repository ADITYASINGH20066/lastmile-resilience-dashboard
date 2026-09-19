import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  CheckCircle2,
  CloudRain,
  Clock3,
  Database,
  Gauge,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Signal,
  TimerReset,
  Waves,
} from 'lucide-react'
import {
  getHydroReadings,
  type Alert,
  type DashboardSummary,
  type HydroReading,
  type ImpactAssessment,
  type RuleEvaluation,
  type Station,
  type Village,
} from './api'

type RiverCode = 'TEESTA' | 'DESANG'

type Props = {
  riverCode: RiverCode
  onRiverChange: (river: RiverCode) => void
  dashboard: DashboardSummary | null
  villages: Village[]
  impactAssessments: ImpactAssessment[]
  station: Station | undefined
  reading: HydroReading | null | undefined
  latestEvaluation: RuleEvaluation | null
  activeAlert: Alert | null
  selectedVillageId: string | null
  onSelectVillage: (id: string | null) => void
  onReviewAlert: () => void
  loading: boolean
  impactLoading: boolean
  impactError: string
  error: string
  onRefresh: () => void
}

type VillageView = {
  village: Village
  impact: ImpactAssessment | null
  risk: string
  riskScore: number | null
  eta: number | null
  x: number
  y: number
}

const stationPositions: Record<string, { x: number; y: number }> = {
  CWC_MELLI: { x: 22, y: 24 },
  CWC_NANGLAMORAGHAT: { x: 72, y: 27 },
}

function labelRisk(value?: string | null) {
  const normalized = (value ?? 'monitoring').toLowerCase()
  if (normalized === 'critical') return 'CRITICAL'
  if (normalized === 'high') return 'HIGH'
  if (normalized === 'warning') return 'WARNING'
  if (normalized === 'watch') return 'WATCH'
  if (normalized === 'normal') return 'NORMAL'
  return 'MONITORING'
}

function riskClass(value?: string | null) {
  return labelRisk(value).toLowerCase().replaceAll(' ', '-')
}

function number(value: number | null | undefined, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function time(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dateTime(value: string | null | undefined) {
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

function freshness(value: string | null | undefined) {
  if (!value) return 'No timestamp'
  const ms = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'Timestamp available'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'Just updated'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours} hr ago`
}

function projectVillages(villages: Village[], impacts: ImpactAssessment[], fallbackRisk: string): VillageView[] {
  const located = villages.filter((v) => typeof v.latitude === 'number' && typeof v.longitude === 'number')
  if (!located.length) {
    return villages.map((village, index) => {
      const impact = impacts.find((item) => item.village_id === village.id) ?? null
      return {
        village,
        impact,
        risk: labelRisk(impact?.risk_level ?? (impact ? fallbackRisk : 'monitoring')),
        riskScore: impact?.risk_score ?? null,
        eta: impact?.time_to_impact_minutes ?? null,
        x: 30 + index * 22,
        y: 52 + (index % 2) * 17,
      }
    })
  }

  const minLat = Math.min(...located.map((v) => v.latitude as number))
  const maxLat = Math.max(...located.map((v) => v.latitude as number))
  const minLon = Math.min(...located.map((v) => v.longitude as number))
  const maxLon = Math.max(...located.map((v) => v.longitude as number))
  const latSpan = Math.max(maxLat - minLat, 0.0001)
  const lonSpan = Math.max(maxLon - minLon, 0.0001)
  const impactByVillage = new Map(impacts.map((item) => [item.village_id, item]))

  return villages
    .map((village, index) => {
      const impact = impactByVillage.get(village.id) ?? null
      const hasCoordinates = typeof village.latitude === 'number' && typeof village.longitude === 'number'
      return {
        village,
        impact,
        risk: labelRisk(impact?.risk_level ?? (impact ? fallbackRisk : 'monitoring')),
        riskScore: impact?.risk_score ?? null,
        eta: impact?.time_to_impact_minutes ?? null,
        x: hasCoordinates
          ? 25 + ((((village.longitude as number) - minLon) / lonSpan) * 62)
          : 28 + ((index * 19) % 62),
        y: hasCoordinates
          ? 50 + ((1 - ((village.latitude as number) - minLat) / latSpan) * 34)
          : 53 + ((index % 3) * 12),
      }
    })
    .sort((a, b) => {
      const ao = a.impact?.downstream_order ?? Number.MAX_SAFE_INTEGER
      const bo = b.impact?.downstream_order ?? Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
      return (b.village.vulnerability_score ?? 0) - (a.village.vulnerability_score ?? 0)
    })
}

function scoreWidth(value: number | null | undefined, max: number) {
  if (typeof value !== 'number') return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

export function CommandViewPage(props: Props) {
  const [history, setHistory] = useState<HydroReading[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  useEffect(() => {
    const code = props.station?.station_code
    if (!code) {
      setHistory([])
      return
    }

    let cancelled = false
    setHistoryLoading(true)
    setHistoryError('')

    void getHydroReadings(code, 12)
      .then((response) => {
        if (!cancelled) setHistory(response.items ?? [])
      })
      .catch((error) => {
        if (!cancelled) {
          setHistory([])
          setHistoryError(error instanceof Error ? error.message : 'Unable to load station history')
        }
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [props.station?.station_code])

  const displayReading = history[0] ?? props.reading
  const displayEvaluation = useMemo(() => {
    const id = displayReading?.id
    if (!id) return props.latestEvaluation
    return props.dashboard?.recent_evaluations.find((item) => item.hydro_reading_id === id) ?? props.latestEvaluation
  }, [displayReading?.id, props.dashboard?.recent_evaluations, props.latestEvaluation])

  const villages = useMemo(
    () => projectVillages(props.villages, props.impactAssessments, displayEvaluation?.risk_level ?? 'watch'),
    [props.villages, props.impactAssessments, displayEvaluation?.risk_level],
  )

  const selectedVillage = villages.find((item) => item.village.id === props.selectedVillageId) ?? null
  const nearestImpact = useMemo(
    () => [...props.impactAssessments].sort((a, b) => a.time_to_impact_minutes - b.time_to_impact_minutes)[0] ?? null,
    [props.impactAssessments],
  )

  const selectedEta = selectedVillage?.impact?.time_to_impact_minutes ?? nearestImpact?.time_to_impact_minutes ?? null
  const assessedPopulation = props.impactAssessments.reduce((sum, item) => sum + (item.population_at_risk ?? 0), 0)
  const selectedStationCode = props.station?.station_code ?? ''
  const mode = String(displayReading?.data_mode ?? 'historical').toLowerCase()
  const dataModeLabel = mode === 'live' ? 'LIVE DATA' : mode === 'replay' ? 'HISTORICAL REPLAY' : 'HISTORICAL DATA'
  const risk = labelRisk(displayEvaluation?.risk_level)
  const riskScore = typeof displayEvaluation?.total_score === 'number' ? displayEvaluation.total_score : null
  const thresholdDistance = typeof displayReading?.water_level_m === 'number' && typeof props.station?.danger_level_m === 'number'
    ? props.station.danger_level_m - displayReading.water_level_m
    : null

  const stationCards = (props.dashboard?.stations ?? []).map((entry) => ({
    station: entry.station,
    reading: entry.latest_reading,
    active: entry.station.station_code === selectedStationCode,
  }))

  const routePoints = villages.length
    ? villages.map((item) => `${item.x},${item.y}`).join(' ')
    : ''

  return (
    <div className="command-page">
      <header className="command-page-head">
        <div>
          <span className="command-kicker">CONTROL ROOM / COMMAND VIEW</span>
          <h1>River hazard command</h1>
          <p>Monitor the latest station observation, understand the rule-engine decision, and inspect the downstream villages affected by the current event.</p>
        </div>
        <div className="command-head-actions">
          <label>
            <span>ACTIVE BASIN</span>
            <select value={props.riverCode} onChange={(event) => props.onRiverChange(event.target.value as RiverCode)}>
              <option value="TEESTA">Teesta / Melli</option>
              <option value="DESANG">Desang / Nanglamoraghat</option>
            </select>
          </label>
          <button className="command-refresh" onClick={props.onRefresh} disabled={props.loading} title="Refresh dashboard data">
            <RefreshCw size={16} className={props.loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {props.error && <div className="command-error"><AlertTriangle size={17} /> <span>{props.error}</span></div>}

      <section className="command-station-strip" aria-label="River monitoring stations">
        {stationCards.map(({ station, reading, active }) => (
          <button
            key={station.id}
            className={`command-station-card ${active ? 'active' : ''}`}
            onClick={() => props.onRiverChange(station.station_code === 'CWC_MELLI' ? 'TEESTA' : 'DESANG')}
          >
            <div className="command-station-icon"><Waves size={17} /></div>
            <div className="command-station-copy">
              <span>{station.river_name ?? 'River basin'}</span>
              <b>{station.station_name}</b>
              <small>{reading?.water_level_m != null ? `${number(Number(reading.water_level_m), 2)} m` : 'No reading'} · {time(reading?.observed_at)}</small>
            </div>
            <span className={`command-risk-dot ${active ? riskClass(displayEvaluation?.risk_level) : ''}`} />
          </button>
        ))}
      </section>

      <section className="command-primary-grid">
        <article className="command-hazard panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">01 / HAZARD STATE</span>
              <h2>{props.station?.river_name ?? props.riverCode} / {props.station?.station_name ?? 'Monitoring station'}</h2>
            </div>
            <div className={`command-risk-badge ${riskClass(displayEvaluation?.risk_level)}`}><span />{risk}</div>
          </div>

          <div className="hazard-reading-row">
            <div className="hazard-current">
              <span>Current water level</span>
              <strong>{displayReading?.water_level_m != null ? `${number(Number(displayReading.water_level_m), 2)} m` : '—'}</strong>
              <small>{freshness(displayReading?.observed_at)} · {dateTime(displayReading?.observed_at)}</small>
            </div>
            <div className="hazard-impact-callout">
              <Clock3 size={18} />
              <div>
                <span>TIME TO IMPACT</span>
                <strong>{selectedEta != null ? `${Math.round(selectedEta)} min` : 'Not assessed'}</strong>
                <small>{selectedVillage ? selectedVillage.village.village_name : nearestImpact ? 'Nearest assessed village' : 'Requires an impact assessment'}</small>
              </div>
            </div>
          </div>

          <div className="threshold-grid-v2">
            <div><span>Warning</span><b>{props.station?.warning_level_m != null ? `${number(Number(props.station.warning_level_m), 2)} m` : '—'}</b></div>
            <div><span>Danger</span><b>{props.station?.danger_level_m != null ? `${number(Number(props.station.danger_level_m), 2)} m` : '—'}</b></div>
            <div><span>HFL</span><b>{props.station?.highest_flood_level_m != null ? `${number(Number(props.station.highest_flood_level_m), 2)} m` : '—'}</b></div>
            <div><span>Rise rate</span><b>{displayReading?.water_level_rate_m_hr != null ? `${number(Number(displayReading.water_level_rate_m_hr), 2)} m/hr` : '—'}</b></div>
            <div><span>Observed</span><b>{time(displayReading?.observed_at)}</b></div>
            <div><span>Danger margin</span><b>{thresholdDistance != null ? `${number(Math.abs(thresholdDistance), 2)} m ${thresholdDistance >= 0 ? 'below' : 'above'}` : '—'}</b></div>
          </div>
        </article>

        <article className="command-alert panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">02 / ALERT GATE</span>
              <h2>Decision status</h2>
            </div>
            <span className={`command-status ${props.activeAlert ? 'attention' : 'quiet'}`}>{props.activeAlert ? props.activeAlert.status.replaceAll('_', ' ').toUpperCase() : 'STANDBY'}</span>
          </div>
          <div className="alert-gate-title">
            <div className="alert-gate-icon"><ShieldAlert size={20} /></div>
            <div><b>{props.activeAlert?.title ?? (displayEvaluation?.alert_recommended ? 'Alert recommended — pending approval' : 'No public alert recommended')}</b><span>{props.activeAlert?.description ?? 'The rule engine is monitoring the selected station and its downstream context.'}</span></div>
          </div>
          <div className="alert-gate-meta">
            <div><span>Priority</span><b>{props.activeAlert?.priority ?? displayEvaluation?.alert_priority ?? 'P3'}</b></div>
            <div><span>Risk score</span><b>{riskScore != null ? `${number(riskScore, 1)}/100` : '—'}</b></div>
            <div><span>Generated</span><b>{time(props.activeAlert?.created_at ?? displayEvaluation?.evaluated_at)}</b></div>
          </div>
          {props.activeAlert ? (
            <button className="command-primary-btn" onClick={props.onReviewAlert}>Review alert & impact <ArrowRight size={15} /></button>
          ) : (
            <div className="command-inline-note"><ShieldCheck size={15} /><span>{displayEvaluation?.alert_recommended ? 'Human approval is required before public dispatch.' : 'Monitoring only. No public dispatch is currently recommended.'}</span></div>
          )}
        </article>
      </section>

      <section className="command-content-grid">
        <article className="command-map panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">03 / GEOGRAPHIC VIEW</span>
              <h2>Station → downstream villages</h2>
            </div>
            <span className="command-map-help"><MapPin size={14} /> Click a station or village</span>
          </div>
          <div className="command-map-canvas">
            <div className="command-map-grid" />
            <div className="command-map-water" />
            <svg className="command-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {routePoints && <polyline points={`${stationPositions[selectedStationCode]?.x ?? 50},${stationPositions[selectedStationCode]?.y ?? 25} ${routePoints}`} />}
            </svg>

            {stationCards.map(({ station, reading, active }) => {
              const pos = stationPositions[station.station_code] ?? { x: 50, y: 25 }
              return (
                <button
                  key={station.id}
                  className={`command-station-marker ${active ? 'active' : ''}`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  onClick={() => props.onRiverChange(station.station_code === 'CWC_MELLI' ? 'TEESTA' : 'DESANG')}
                  title={`Open ${station.station_name}`}
                >
                  <span className="command-marker-pulse" />
                  <span className="command-marker-core"><CloudRain size={15} /></span>
                  <span><b>{station.station_name}</b><small>{reading?.water_level_m != null ? `${number(Number(reading.water_level_m), 2)} m` : 'No reading'}</small></span>
                </button>
              )
            })}

            {villages.map((item) => (
              <button
                key={item.village.id}
                className={`command-village-marker ${item.village.id === props.selectedVillageId ? 'selected' : ''}`}
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
                onClick={() => props.onSelectVillage(item.village.id)}
                title={`${item.village.village_name} · ${item.impact ? `${item.risk}, ${Math.round(item.eta ?? 0)} min` : 'No impact assessment'}`}
              >
                <span className={`command-village-dot ${riskClass(item.risk)}`} />
                <span><b>{item.village.village_name}</b><small>{item.impact ? `${item.risk}${item.riskScore != null ? ` · ${number(item.riskScore)}` : ''}` : 'MONITORING'}</small></span>
              </button>
            ))}

            <div className="command-map-legend"><span><i className="station-key" /> Monitoring station</span><span><i className="village-key" /> Village / impact target</span><span><i className="route-key" /> Impact path</span></div>
          </div>
          <div className="command-map-footer">
            <span><Signal size={14} /> Map is a dashboard visualization of current station/village records.</span>
            <span>{villages.length} villages in {props.riverCode}</span>
          </div>
        </article>

        <article className="command-evidence panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">04 / RULE ENGINE</span>
              <h2>Why the system reached this state</h2>
            </div>
            <span className="score-large">{riskScore != null ? number(riskScore, 0) : '—'}<small>/100</small></span>
          </div>
          <div className="score-bars">
            <ScoreBar label="River level" value={displayEvaluation?.level_score} max={60} />
            <ScoreBar label="Rise rate" value={displayEvaluation?.rate_score} max={20} />
            <ScoreBar label="Sensor confirmation" value={displayEvaluation?.sensor_score} max={10} />
            <ScoreBar label="Community evidence" value={displayEvaluation?.community_score} max={5} />
            <ScoreBar label="Persistence" value={displayEvaluation?.persistence_score} max={5} />
          </div>
          <div className="evidence-reasons">
            <span>ENGINE REASONS</span>
            {displayEvaluation?.reasons?.length ? displayEvaluation.reasons.map((reason) => <div key={reason}><CheckCircle2 size={14} />{reason}</div>) : <div className="muted-row">No detailed reasons returned for this observation.</div>}
          </div>
          <div className="evidence-source"><Database size={15} /><span>{dataModeLabel} · Engine {displayEvaluation?.engine_version ?? 'v1.0'} · evaluation {dateTime(displayEvaluation?.evaluated_at)}</span></div>
        </article>
      </section>

      <section className="command-bottom-grid">
        <article className="command-history panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">05 / STATION HISTORY</span>
              <h2>Recent observations</h2>
            </div>
            <span className="command-history-meta">{history.length} records</span>
          </div>
          {historyLoading ? <div className="command-empty"><Activity size={16} /> Loading station history…</div> : historyError ? <div className="command-empty error"><AlertTriangle size={16} /> {historyError}</div> : history.length ? (
            <div className="history-list">
              {history.map((item, index) => (
                <div className={`history-row ${index === 0 ? 'latest' : ''}`} key={item.id}>
                  <span>{index === 0 ? 'LATEST' : dateTime(item.observed_at)}</span>
                  <b>{item.water_level_m != null ? `${number(Number(item.water_level_m), 2)} m` : '—'}</b>
                  <span>{item.water_level_rate_m_hr != null ? `${number(Number(item.water_level_rate_m_hr), 2)} m/hr` : '—'}</span>
                  <em>{String(item.data_mode ?? 'historical').toUpperCase()}</em>
                </div>
              ))}
            </div>
          ) : <div className="command-empty"><TimerReset size={16} /> No station history returned.</div>}
        </article>

        <article className="command-villages panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">06 / DOWNSTREAM IMPACT</span>
              <h2>All villages in this basin</h2>
            </div>
            <span className="command-history-meta">{props.impactAssessments.length} assessed · {number(assessedPopulation)} people</span>
          </div>
          {props.impactLoading ? <div className="command-empty"><Activity size={16} /> Loading impact assessment…</div> : props.impactError ? <div className="command-empty error"><AlertTriangle size={16} /> {props.impactError}</div> : (
            <div className="village-list-v2">
              {villages.map((item) => {
                const selected = item.village.id === props.selectedVillageId
                return (
                  <button className={`village-row-v2 ${selected ? 'selected' : ''}`} key={item.village.id} onClick={() => props.onSelectVillage(selected ? null : item.village.id)}>
                    <span className="village-order">{item.impact?.downstream_order ? `#${item.impact.downstream_order}` : '—'}</span>
                    <span className="village-name-v2"><b>{item.village.village_name}</b><small>{item.village.district ?? 'District unavailable'} · vulnerability {item.village.vulnerability_score ?? '—'}</small></span>
                    <span className={`village-risk-v2 ${riskClass(item.risk)}`}>{item.impact ? item.risk : 'MONITORING'}</span>
                    <span className="village-eta-v2">{item.eta != null ? `${Math.round(item.eta)} min` : '—'}</span>
                    <span className="village-pop-v2">{number(item.impact?.population_at_risk ?? item.village.population)}</span>
                    <ArrowDownRight size={15} />
                  </button>
                )
              })}
            </div>
          )}
          <div className="command-disclaimer"><ShieldCheck size={14} /><span>Village risk and ETA are shown only when persisted impact assessments exist. The current prototype uses the seeded downstream-order model, not a terrain-derived forecast.</span></div>
        </article>
      </section>

      {selectedVillage && (
        <section className="selected-village-v2 panel">
          <div>
            <span className="command-kicker">SELECTED VILLAGE</span>
            <h2>{selectedVillage.village.village_name}</h2>
            <p>{selectedVillage.village.district ?? 'District unavailable'} · population {number(selectedVillage.village.population)} · vulnerability {selectedVillage.village.vulnerability_score ?? '—'}</p>
          </div>
          <div className="selected-village-metrics">
            <Metric label="Risk" value={selectedVillage.impact ? selectedVillage.risk : 'Monitoring'} />
            <Metric label="ETA" value={selectedVillage.eta != null ? `${Math.round(selectedVillage.eta)} min` : 'Not assessed'} />
            <Metric label="Population" value={number(selectedVillage.impact?.population_at_risk ?? selectedVillage.village.population)} />
            <Metric label="Downstream" value={selectedVillage.impact?.downstream_order ? `#${selectedVillage.impact.downstream_order}` : '—'} />
          </div>
          <button className="selected-close" onClick={() => props.onSelectVillage(null)}>Close</button>
        </section>
      )}
    </div>
  )
}

function ScoreBar({ label, value, max }: { label: string; value?: number | null; max: number }) {
  const actual = typeof value === 'number' ? value : 0
  return (
    <div className="score-bar-row">
      <div><span>{label}</span><b>{typeof value === 'number' ? `${number(value, 1)}/${max}` : '—'}</b></div>
      <div className="score-track"><span style={{ width: `${scoreWidth(value, max)}%` }} /></div>
      <small>{actual === 0 ? 'No contribution' : `${Math.round(scoreWidth(value, max))}% of factor weight`}</small>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>
}
