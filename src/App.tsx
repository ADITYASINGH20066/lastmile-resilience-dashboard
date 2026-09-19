import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BatteryMedium,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  CloudRain,
  Crosshair,
  Gauge,
  Info,
  LocateFixed,
  Menu,
  Radio,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Signal,
  Siren,
  Smartphone,
  TowerControl,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import {
  getAlert,
  getAlertImpact,
  getDashboardSummary,
  getVillages,
  type Alert,
  type DashboardSummary,
  type ImpactAssessment,
  type Village,
} from './api'
import { RoleWorkspace, type RoleKey } from './roleWorkspaces'
import ConnectivityPage from './ConnectivityPage'

type RiverCode = 'TEESTA' | 'DESANG'
type NetworkKey = 'internet' | 'cellular' | 'mesh'

type Zone = {
  id: string
  name: string
  risk: string
  riskScore: number | null
  eta: number | null
  coverage: number
  status: string
  x: number
  y: number
  color: string
  population: number
  vulnerability: number
  downstreamOrder: number | null
}

const DEFAULT_RIVER: RiverCode = 'DESANG'

// Keep the brand copy centralized so the exact Sentinel-X expansion from the pitch deck
// can be inserted here later without touching the UI components.
const PRODUCT_NAME = 'SENTINEL-X'
const PRODUCT_DESCRIPTOR = 'Resilient emergency warning & last-mile network'
const TAGLINE = "When the network dies, the warning doesn't."

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function riskLabel(riskLevel: string | null | undefined) {
  const normalized = (riskLevel ?? 'watch').toLowerCase()
  if (normalized === 'critical') return 'CRITICAL'
  if (normalized === 'high') return 'HIGH'
  if (normalized === 'warning') return 'WARNING'
  if (normalized === 'watch') return 'WATCH'
  return 'NORMAL'
}

function riskColor(riskLevel: string | null | undefined) {
  const normalized = (riskLevel ?? 'watch').toLowerCase()
  if (normalized === 'critical' || normalized === 'high') return '#ff6b4a'
  if (normalized === 'warning') return '#f3c969'
  if (normalized === 'watch') return '#74c69d'
  return '#72d9c6'
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—'
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatEta(value: number | null | undefined) {
  if (typeof value !== 'number') return '—'
  return `${Math.round(value)} min`
}

function buildRoutePath(zones: Zone[]) {
  if (zones.length < 2) return ''
  const [first, ...rest] = zones
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((zone, index) => {
      const previous = index === 0 ? first : rest[index - 1]
      const midX = (previous.x + zone.x) / 2
      return `Q ${midX} ${previous.y}, ${zone.x} ${zone.y}`
    }),
  ].join(' ')
}

function projectVillages(villages: Village[], impacts: ImpactAssessment[], fallbackRisk: string) {
  const usable = villages.filter((v) => typeof v.latitude === 'number' && typeof v.longitude === 'number')
  if (!usable.length) return [] as Zone[]

  const minLat = Math.min(...usable.map((v) => v.latitude as number))
  const maxLat = Math.max(...usable.map((v) => v.latitude as number))
  const minLon = Math.min(...usable.map((v) => v.longitude as number))
  const maxLon = Math.max(...usable.map((v) => v.longitude as number))
  const latSpan = Math.max(maxLat - minLat, 0.0001)
  const lonSpan = Math.max(maxLon - minLon, 0.0001)
  const impactByVillage = new Map(impacts.map((impact) => [impact.village_id, impact]))

  return [...usable]
    .sort((a, b) => {
      const aOrder = impactByVillage.get(a.id)?.downstream_order ?? Number.MAX_SAFE_INTEGER
      const bOrder = impactByVillage.get(b.id)?.downstream_order ?? Number.MAX_SAFE_INTEGER
      if (aOrder !== bOrder) return aOrder - bOrder
      return (b.vulnerability_score ?? 0) - (a.vulnerability_score ?? 0)
    })
    .map((village) => {
      const impact = impactByVillage.get(village.id)
      const risk = impact?.risk_level ?? fallbackRisk
      return {
        id: village.id,
        name: village.village_name,
        risk: riskLabel(risk),
        riskScore: impact?.risk_score ?? null,
        eta: impact?.time_to_impact_minutes ?? null,
        coverage: 0,
        status: 'unreached',
        x: 16 + (((village.longitude as number) - minLon) / lonSpan) * 68,
        y: 21 + (1 - ((village.latitude as number) - minLat) / latSpan) * 58,
        color: riskColor(risk),
        population: village.population ?? 0,
        vulnerability: village.vulnerability_score ?? 0,
        downstreamOrder: impact?.downstream_order ?? null,
      }
    })
}

function mergeImpact(zones: Zone[], impacts: ImpactAssessment[]) {
  const impactByVillage = new Map(impacts.map((impact) => [impact.village_id, impact]))
  return zones.map((zone) => {
    const impact = impactByVillage.get(zone.id)
    if (!impact) return zone
    return {
      ...zone,
      risk: riskLabel(impact.risk_level),
      riskScore: impact.risk_score,
      eta: impact.time_to_impact_minutes,
      downstreamOrder: impact.downstream_order ?? null,
      color: riskColor(impact.risk_level),
    }
  })
}

function ControlRoomPanel({
  section,
  station,
  reading,
  latestEvaluation,
  activeAlert,
  dashboard,
  zones,
  networks,
  totalPopulationAtRisk,
  onReviewAlert,
}: {
  section: string
  station: any
  reading: any
  latestEvaluation: any
  activeAlert: Alert | null
  dashboard: DashboardSummary | null
  zones: Zone[]
  networks: Record<NetworkKey, boolean>
  totalPopulationAtRisk: number
  onReviewAlert: () => void
}) {
  if (section === 'Inbound data') {
    return <div className="control-subpage">
      <section className="subpage-heading"><span className="section-kicker">CONTROL ROOM / INBOUND DATA</span><h1>Who sent what data</h1><p>Trace the operational inputs currently feeding the rule engine. Source identity is shown separately from the risk decision.</p></section>
      <div className="control-card-grid">
        <section className="panel control-card"><span className="section-kicker">HYDROLOGICAL SOURCE</span><h2>{station?.station_name ?? 'No station'}</h2><div className="data-row"><b>CWC</b><span>Historical / replayed station observation</span></div><div className="data-row"><b>Water level</b><span>{reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : '—'}</span></div><div className="data-row"><b>Observed</b><span>{formatTime(reading?.observed_at)}</span></div></section>
        <section className="panel control-card"><span className="section-kicker">SENSOR INPUT</span><h2>Field sensor channel</h2><div className="data-row"><b>Path</b><span>ESP32 / Wokwi → FastAPI → Supabase</span></div><div className="data-row"><b>Purpose</b><span>Independent sensor confirmation</span></div><div className="data-row"><b>Decision</b><span>{latestEvaluation?.sensor_score ?? '—'} / 10 sensor score</span></div></section>
        <section className="panel control-card"><span className="section-kicker">COMMUNITY INPUT</span><h2>Local reports</h2><div className="data-row"><b>Path</b><span>Community app → reports API → rule engine</span></div><div className="data-row"><b>Current contribution</b><span>{latestEvaluation?.community_score ?? '0'} / 5</span></div><div className="data-row"><b>Verification</b><span>Verified reports contribute to scoring</span></div></section>
        <section className="panel control-card"><span className="section-kicker">DECISION OUTPUT</span><h2>Rule engine</h2><div className="data-row"><b>Score</b><span>{latestEvaluation?.total_score ?? '—'} / 100</span></div><div className="data-row"><b>Risk</b><span>{latestEvaluation?.risk_level?.toUpperCase() ?? '—'}</span></div><div className="data-row"><b>Alert</b><span>{latestEvaluation?.alert_recommended ? 'Recommended' : 'Not recommended'}</span></div></section>
      </div>
    </div>
  }

  if (section === 'Village delivery') {
    return <div className="control-subpage">
      <section className="subpage-heading"><span className="section-kicker">CONTROL ROOM / VILLAGE DELIVERY</span><h1>Who receives what</h1><p>One operational view of the warning package, affected village, delivery path and current last-mile state.</p></section>
      <section className="panel delivery-board">
        <div className="delivery-board-head"><span>VILLAGE</span><span>RISK / ETA</span><span>POPULATION</span><span>WARNING PACKAGE</span><span>PATH</span></div>
        {zones.length ? zones.map((zone) => <div className="delivery-board-row" key={zone.id}><div><b>{zone.name}</b><small>Downstream #{zone.downstreamOrder ?? '—'}</small></div><div><strong className={'risk-pill '+zone.risk.toLowerCase()}>{zone.risk}</strong><small>{formatEta(zone.eta)}</small></div><div>{formatNumber(zone.population)}</div><div><b>{activeAlert?.title ?? 'No active public warning'}</b><small>{activeAlert ? 'Pending human authorization' : 'Monitoring only'}</small></div><div><b>{networks.internet ? 'Internet' : networks.cellular ? 'Cellular' : networks.mesh ? 'Offline relay' : 'Unavailable'}</b><small>{zone.coverage}% simulated delivery</small></div></div>) : <div className="empty-state">No village assessment loaded.</div>}
      </section>
      <section className="panel visibility-card"><div className="panel-head compact"><div><span className="section-kicker">ROLE VISIBILITY</span><h2>What each role is shown</h2></div></div><div className="visibility-grid"><div><b>Control Room</b><span>All operational data, inbound evidence, impact and delivery state.</span></div><div><b>Disaster Authority</b><span>Regional risk, population at risk and authorization readiness.</span></div><div><b>Village Authority</b><span>Only the local warning, village conditions and local reporting tools.</span></div><div><b>Community Member</b><span>Actionable warning, ETA, acknowledgement and local reporting.</span></div><div><b>System Admin</b><span>Platform health, integrations and authorization directory.</span></div></div></section>
    </div>
  }

  if (section === 'Connectivity') {
    return <div className="control-subpage"><section className="subpage-heading"><span className="section-kicker">CONTROL ROOM / CONNECTIVITY</span><h1>Last-mile network state</h1><p>Monitor the available communication paths and the fallback route used when infrastructure fails.</p></section><div className="connectivity-grid">{[['Internet / cloud', networks.internet, 'Primary backend path'],['Cellular towers', networks.cellular, 'Carrier delivery path'],['Offline mesh', networks.mesh, 'Phone-to-phone fallback']].map(([label, active, detail]) => <section className="panel connectivity-card" key={label as string}><div className="connectivity-icon">{active ? <Wifi size={20}/> : <WifiOff size={20}/>}</div><b>{label as string}</b><span>{detail as string}</span><strong>{active ? 'AVAILABLE' : 'OFFLINE'}</strong></section>)}</div><section className="panel control-note"><Radio size={16}/><span>The network twin controls remain simulation controls in this prototype; they do not represent a live physical LoRa link.</span></section></div>
  }

  return <div className="control-subpage"><section className="subpage-heading"><span className="section-kicker">CONTROL ROOM / AUDIT</span><h1>Operational activity</h1><p>Review the current decision chain without changing alert state from the dashboard.</p></section><div className="audit-list"><div><span>01</span><b>Hazard observation</b><small>{station?.station_name ?? 'Station'} · {formatTime(reading?.observed_at)}</small></div><div><span>02</span><b>Rule evaluation</b><small>{latestEvaluation?.total_score ?? '—'}/100 · {latestEvaluation?.risk_level ?? '—'}</small></div><div><span>03</span><b>Impact assessment</b><small>{zones.length} villages · {formatNumber(totalPopulationAtRisk)} people at risk</small></div><div><span>04</span><b>Alert gate</b><small>{activeAlert ? `${activeAlert.priority ?? 'P3'} · ${activeAlert.status.replaceAll('_',' ')}` : 'No active alert'}</small></div></div><section className="panel control-note"><ShieldCheck size={16}/><span>Approval remains a protected backend action. This workspace only exposes the review package until Supabase Auth is wired.</span>{activeAlert && <button className="outline-btn" onClick={onReviewAlert}>Review alert</button>}</section></div>
}

function App() {
  const [riverCode, setRiverCode] = useState<RiverCode>(DEFAULT_RIVER)
  const [villages, setVillages] = useState<Village[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [impactAssessments, setImpactAssessments] = useState<ImpactAssessment[]>([])
  const [started, setStarted] = useState(false)
  const [tick, setTick] = useState(0)
  const [networks, setNetworks] = useState<Record<NetworkKey, boolean>>({ internet: true, cellular: true, mesh: false })
  const [activeTab, setActiveTab] = useState('Command view')
  const [selectedRole, setSelectedRole] = useState<RoleKey>('control_room')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationState, setNotificationState] = useState<'idle' | 'sent' | 'blocked'>('idle')
  const [loading, setLoading] = useState(true)
  const [impactLoading, setImpactLoading] = useState(false)
  const [error, setError] = useState('')
  const [impactError, setImpactError] = useState('')
  const [selectedVillageId, setSelectedVillageId] = useState<string | null>(null)
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [alertDetail, setAlertDetail] = useState<Alert | null>(null)
  const [alertTargets, setAlertTargets] = useState<unknown[]>([])
  const [alertDeliveries, setAlertDeliveries] = useState<unknown[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')
      setImpactAssessments([])
      setImpactError('')
      setSelectedVillageId(null)

      try {
        const [summary, villageResponse] = await Promise.all([
          getDashboardSummary(),
          getVillages(riverCode),
        ])

        if (cancelled) return

        setDashboard(summary)
        setVillages(villageResponse.items)

        const stationForRiver = summary.stations.find((entry) => {
          const code = entry.station.station_code.toUpperCase()
          return riverCode === 'TEESTA' ? code === 'CWC_MELLI' : code === 'CWC_NANGLAMORAGHAT'
        })
        const latestReadingId = stationForRiver?.latest_reading?.id
        const evaluation = latestReadingId
          ? summary.recent_evaluations.find((item) => item.hydro_reading_id === latestReadingId)
          : undefined

        setZones(projectVillages(villageResponse.items, [], evaluation?.risk_level ?? 'watch'))
        setStarted(false)
        setNetworks({ internet: true, cellular: true, mesh: false })
        setTick(0)
      } catch (loadError) {
        if (cancelled) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load dashboard data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()
    return () => { cancelled = true }
  }, [riverCode])

  const stationSnapshot = useMemo(() => {
    if (!dashboard) return null
    return dashboard.stations.find((entry) => {
      const code = entry.station.station_code.toUpperCase()
      return riverCode === 'TEESTA' ? code === 'CWC_MELLI' : code === 'CWC_NANGLAMORAGHAT'
    }) ?? null
  }, [dashboard, riverCode])

  const latestEvaluation = useMemo(() => {
    const readingId = stationSnapshot?.latest_reading?.id
    if (!readingId || !dashboard) return null
    return dashboard.recent_evaluations.find((item) => item.hydro_reading_id === readingId) ?? null
  }, [dashboard, stationSnapshot])

  const activeAlert = useMemo<Alert | null>(() => {
    if (!dashboard?.active_alerts.length) return null
    const matchingEvent = latestEvaluation?.event_id
      ? dashboard.active_alerts.find((alert) => alert.event_id === latestEvaluation.event_id)
      : null
    if (matchingEvent) return matchingEvent

    const stationName = stationSnapshot?.station.station_name?.toLowerCase() ?? ''
    const riverName = stationSnapshot?.station.river_name?.toLowerCase() ?? ''
    return dashboard.active_alerts.find((alert) => {
      const haystack = `${alert.title ?? ''} ${alert.description ?? ''}`.toLowerCase()
      return (stationName && haystack.includes(stationName)) || (riverName && haystack.includes(riverName))
    }) ?? null
  }, [dashboard, latestEvaluation, stationSnapshot])

  useEffect(() => {
    if (!activeAlert?.id) {
      setImpactAssessments([])
      return
    }

    const alertId = activeAlert.id
    let cancelled = false
    setImpactLoading(true)
    setImpactError('')

    async function loadImpact() {
      try {
        const response = await getAlertImpact(alertId)
        if (cancelled) return
        setImpactAssessments(response.items ?? [])
      } catch (impactLoadError) {
        if (cancelled) return
        setImpactAssessments([])
        setImpactError(impactLoadError instanceof Error ? impactLoadError.message : 'Unable to load impact assessment')
      } finally {
        if (!cancelled) setImpactLoading(false)
      }
    }

    void loadImpact()
    return () => { cancelled = true }
  }, [activeAlert?.id])

  useEffect(() => {
    if (!villages.length) {
      setZones([])
      return
    }
    setZones((current) => {
      const next = projectVillages(villages, impactAssessments, latestEvaluation?.risk_level ?? 'watch')
      if (!current.length) return next
      return mergeImpact(next.map((zone) => {
        const existing = current.find((item) => item.id === zone.id)
        return existing ? { ...zone, coverage: existing.coverage, status: existing.status } : zone
      }), impactAssessments)
    })
  }, [villages, impactAssessments, latestEvaluation?.risk_level])

  const station = stationSnapshot?.station
  const reading = stationSnapshot?.latest_reading
  const priority = activeAlert?.priority ?? latestEvaluation?.alert_priority ?? 'P3'
  const alertTitle = activeAlert?.title ?? (latestEvaluation?.alert_recommended ? 'Alert recommended — pending approval' : 'No active public alert')
  const backendAlertStatus = activeAlert?.status?.replaceAll('_', ' ') ?? (latestEvaluation?.alert_recommended ? 'pending approval' : 'standby')
  const alertStatus = backendAlertStatus
  const hasAlert = Boolean(activeAlert || latestEvaluation?.alert_recommended)

  const totalPopulationAtRisk = impactAssessments.length
    ? impactAssessments.reduce((sum, item) => sum + (item.population_at_risk ?? 0), 0)
    : zones.reduce((sum, zone) => sum + zone.population, 0)

  const nearestImpact = impactAssessments.length
    ? [...impactAssessments].sort((a, b) => a.time_to_impact_minutes - b.time_to_impact_minutes)[0]
    : null

  const totalCoverage = zones.length
    ? Math.round(zones.reduce((sum, zone) => sum + zone.coverage, 0) / zones.length)
    : 0

  const highestRiskGap = useMemo(() => {
    if (!zones.length) return null
    return [...zones].sort((a, b) => {
      if (a.coverage !== b.coverage) return a.coverage - b.coverage
      return (a.eta ?? Number.MAX_SAFE_INTEGER) - (b.eta ?? Number.MAX_SAFE_INTEGER)
    })[0]
  }, [zones])

  const selectedVillage = useMemo(() => {
    if (!selectedVillageId) return null
    return zones.find((zone) => zone.id === selectedVillageId) ?? null
  }, [selectedVillageId, zones])

  const routeText = networks.internet
    ? 'Cloud → tower → village'
    : networks.cellular
      ? 'Cellular → tower → village'
      : networks.mesh
        ? 'Gateway → relay → village'
        : 'No active route'

  const routePath = useMemo(() => buildRoutePath(zones), [zones])
  const dataMode = String(reading?.data_mode ?? 'historical').toLowerCase()
  const dataModeLabel = dataMode === 'replay' ? 'HISTORICAL DATA REPLAY' : dataMode === 'live' ? 'LIVE DATA' : 'HISTORICAL DATA'

  function resetScenario() {
    setStarted(false)
    setNetworks({ internet: true, cellular: true, mesh: false })
    setZones((current) => current.map((zone) => ({ ...zone, coverage: 0, status: 'unreached' })))
    setTick(0)
    setSelectedVillageId(null)
  }

  function simulateFailure() {
    setNetworks({ internet: false, cellular: false, mesh: true })
    setStarted(true)
    setZones((current) => current.map((zone, index) => ({
      ...zone,
      coverage: index === 0 ? 35 : Math.max(0, zone.coverage - 4),
      status: index === 0 ? 'relaying' : 'at risk',
    })))
  }

  function advanceMesh() {
    setNetworks((current) => ({ ...current, mesh: true }))
    setStarted(true)
    setTick((value) => value + 1)
    setZones((current) => current.map((zone, index) => {
      const increment = index === 0 ? 21 : index === 1 ? 16 : 10
      const nextCoverage = Math.min(100, zone.coverage + increment)
      return {
        ...zone,
        coverage: nextCoverage,
        status: nextCoverage >= 80 ? 'reached' : nextCoverage > 0 ? 'relaying' : 'unreached',
      }
    }))
  }

  function toggleNetwork(key: NetworkKey) {
    setNetworks((current) => ({ ...current, [key]: !current[key] }))
  }

  async function openAlertReview() {
    if (!activeAlert?.id) return
    try {
      const details = await getAlert(activeAlert.id)
      setAlertDetail(details.alert)
      setAlertTargets(details.targets)
      setAlertDeliveries(details.deliveries)
      setAlertModalOpen(true)
    } catch (loadError) {
      setImpactError(loadError instanceof Error ? loadError.message : 'Unable to load alert details')
    }
  }

  async function sendPhoneNotification() {
    if (!('Notification' in window)) {
      setNotificationState('blocked')
      return
    }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') {
      setNotificationState('blocked')
      return
    }
    const villageName = highestRiskGap?.name ?? 'downstream villages'
    const eta = nearestImpact ? formatEta(nearestImpact.time_to_impact_minutes) : 'immediate'
    new Notification(`${priority} flood warning / ${PRODUCT_NAME}`, {
      body: `${villageName}: estimated impact ${eta}. Move toward the designated safe area if directed.`,
      icon: '/lastmile-icon.svg',
      tag: 'sentinel-x-p0',
    })
    setNotificationState('sent')
  }

  function locateRiskGap() {
    if (!highestRiskGap) return
    setSelectedVillageId(highestRiskGap.id)
    document.getElementById('village-impact-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const roleLabel: Record<RoleKey, string> = {
    control_room: 'Control Room',
    disaster_authority: 'Disaster Authority',
    village_authority: 'Village Authority',
    community_member: 'Community Member',
    admin: 'System Admin',
  }

  function handleRoleChange(nextRole: RoleKey) {
    setSelectedRole(nextRole)
    setActiveTab('Command view')
    setMenuOpen(false)
  }

  if (loading) {
    return <div className="app-shell"><main className="content"><div className="panel loading-card"><span className="pulse-dot" /> Connecting to {PRODUCT_NAME} command services…</div></main></div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Route size={18} /></div>
          <span>{PRODUCT_NAME}</span>
          <small>/ {PRODUCT_DESCRIPTOR}</small>
        </div>
        {selectedRole === 'control_room' ? (
          <nav className="control-nav" aria-label="Control Room workspace">
            {['Command view', 'Inbound data', 'Village delivery', 'Connectivity'].map((item) => (
              <button className={activeTab === item ? 'nav-link active' : 'nav-link'} key={item} onClick={() => setActiveTab(item)}>{item}</button>
            ))}
          </nav>
        ) : <div className="role-header-spacer" />}
        <div className="top-actions">
          <span className="live-pill"><span className="pulse-dot" /> BACKEND CONNECTED</span>
          {selectedRole === 'disaster_authority' && (
            <label className="role-switcher">
              <span>ACTIVE BASIN</span>
              <select
                value={riverCode}
                onChange={(event) => {
                  setRiverCode(event.target.value as RiverCode)
                  setTick(0)
                  setStarted(false)
                }}
                aria-label="Select active basin for Disaster Authority"
              >
                <option value="TEESTA">Teesta / Melli</option>
                <option value="DESANG">Desang / Nanglamoraghat</option>
              </select>
            </label>
          )}
          <button className="icon-btn mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={18} /></button>
          <label className="role-switcher">
            <span>DEMO ROLE</span>
            <select value={selectedRole} onChange={(event) => handleRoleChange(event.target.value as RoleKey)} aria-label="Select demo role">
              {(['control_room', 'disaster_authority', 'village_authority', 'community_member'] as RoleKey[]).map((key) => <option key={key} value={key}>{roleLabel[key]}</option>)}
            </select>
          </label>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-nav">
          {selectedRole === 'control_room' && ['Command view', 'Inbound data', 'Village delivery', 'Connectivity'].map((item) => (
            <button key={item} className={activeTab === item ? 'selected' : ''} onClick={() => { setActiveTab(item); setMenuOpen(false) }}>{item}</button>
          ))}
          {selectedRole === 'disaster_authority' && (
            <div className="mobile-role-list">
              <span>ACTIVE BASIN</span>
              <button className={riverCode === 'TEESTA' ? 'selected' : ''} onClick={() => { setRiverCode('TEESTA'); setMenuOpen(false) }}>Teesta / Melli</button>
              <button className={riverCode === 'DESANG' ? 'selected' : ''} onClick={() => { setRiverCode('DESANG'); setMenuOpen(false) }}>Desang / Nanglamoraghat</button>
            </div>
          )}
          <div className="mobile-role-list">
            <span>DEMO ROLE</span>
            {(['control_room', 'disaster_authority', 'village_authority', 'community_member'] as RoleKey[]).map((key) => <button className={selectedRole === key ? 'selected' : ''} key={key} onClick={() => handleRoleChange(key)}>{roleLabel[key]}</button>)}
          </div>
        </div>
      )}

      <main className="content">
        {selectedRole !== 'control_room' ? (
          <RoleWorkspace
            role={selectedRole}
            riverCode={riverCode}
            station={station}
            reading={reading}
            latestEvaluation={latestEvaluation}
            activeAlert={activeAlert}
            dashboard={dashboard}
            zones={zones}
            impactAssessments={impactAssessments}
            networks={networks}
            totalPopulationAtRisk={totalPopulationAtRisk}
            nearestImpact={nearestImpact}
            onSelectVillage={setSelectedVillageId}
            onReviewAlert={() => { void openAlertReview() }}
          />
        ) : (
        activeTab === 'Command view' ? <>
        <section className="intro-row">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> {PRODUCT_NAME} / RESILIENCE COMMAND</div>
            <h1>When the network dies,<br /><em>the warning doesn't.</em></h1>
            <p className="intro-copy">A resilient emergency warning network for the last mile.<br />Detect risk, route urgency, and keep communities informed when infrastructure fails.</p>
          </div>
          <div className="intro-actions">
            <label className="scenario-label" htmlFor="river-select">ACTIVE BASIN</label>
            <select id="river-select" className="scenario-select" value={riverCode} onChange={(event) => { setRiverCode(event.target.value as RiverCode); setTick(0); setStarted(false) }} aria-label="Select river scenario">
              <option value="TEESTA">Teesta / CWC Melli</option>
              <option value="DESANG">Desang / CWC Nanglamoraghat</option>
            </select>
            <button className="refresh" onClick={resetScenario} title="Reset delivery simulation"><RefreshCw size={17} /></button>
          </div>
        </section>

        <section className="brand-context-bar">
          <div><b>{PRODUCT_NAME}</b><span>{PRODUCT_DESCRIPTOR}</span></div>
          <div className="context-tag">{TAGLINE}</div>
          <div className="data-mode-tag"><span className="status-dot" /> {dataModeLabel}</div>
        </section>

        <section className="stats-grid">
          <Stat label="TIME TO IMPACT" value={nearestImpact ? formatEta(nearestImpact.time_to_impact_minutes) : '—'} suffix={nearestImpact ? zones.find((z) => z.id === nearestImpact.village_id)?.name ?? 'nearest downstream village' : 'impact assessment pending'} icon={<Gauge size={17} />} accent="coral" />
          <Stat label="POPULATION AT RISK" value={formatNumber(totalPopulationAtRisk)} suffix={`${zones.length} mapped villages`} icon={<ShieldCheck size={17} />} accent="lime" />
          <Stat label="VILLAGES MAPPED" value={String(zones.length).padStart(2, '0')} suffix="basin village layer" icon={<CircleDot size={17} />} accent="yellow" />
          <Stat label="MESSAGE PRIORITY" value={priority} suffix={`${riskLabel(latestEvaluation?.risk_level)} / score ${latestEvaluation?.total_score ?? '—'}`} icon={<Siren size={17} />} accent="coral" />
        </section>

        {error && <div className="panel error-banner"><AlertTriangle size={16} /> Backend error: {error}</div>}

                <section className="workspace-grid">
          <div className="map-panel panel">
            <div className="panel-head">
              <div><span className="section-kicker">01 / GEOGRAPHIC TWIN</span><h2>Hazard & impact map</h2></div>
              <div className="map-legend"><span><i className="legend-dot danger" /> Impact path</span></div>
            </div>

            <div className="map-canvas">
              <div className="map-grid-lines" />
              <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={routePath} className="route-path faint" />
                <path d={routePath} className="route-path" />
              </svg>
              <div className="map-compass"><Crosshair size={15} /> N</div>
              <div className="river river-one" /><div className="river river-two" />

              {zones.map((zone) => (
                <button
                  className={'zone-node ' + (zone.id === highestRiskGap?.id ? 'selected' : '') + (zone.id === selectedVillageId ? ' focused' : '')}
                  style={{ left: zone.x + '%', top: zone.y + '%' }}
                  key={zone.id}
                  onClick={() => setSelectedVillageId(zone.id)}
                  title={`${zone.name} — ${zone.risk}`}
                >
                  <div className="zone-ring" style={{ borderColor: zone.color }}><div className="zone-core" style={{ backgroundColor: zone.color }} /></div>
                  <div className="zone-label"><b>{zone.name}</b><span>{zone.risk}{zone.riskScore != null ? ` · ${zone.riskScore}` : ''}</span></div>
                </button>
              ))}

              <div className="source-marker">
                <div className="source-icon"><CloudRain size={16} /></div>
                <span>{station?.station_name ?? 'hydro station'}</span>
              </div>
              <div className="map-scale">0 <span /> 10 km</div>
            </div>

            <div className="map-footer">
              <div className="map-status"><span className="status-dot" /> {impactAssessments.length ? `${impactAssessments.length} assessed villages` : 'Impact assessment pending'}</div>
              <button className="outline-btn" onClick={locateRiskGap}><LocateFixed size={15} /> Locate risk gap</button>
            </div>
          </div>

          <aside className="side-column">
            <div className="panel hazard-card">
              <div className="panel-head compact">
                <div><span className="section-kicker">HAZARD STATE</span><h2>{station?.river_name ?? riverCode} / {station?.station_name ?? 'Station'}</h2></div>
                <span className={'risk-summary ' + riskLabel(latestEvaluation?.risk_level).toLowerCase()}>{riskLabel(latestEvaluation?.risk_level)}</span>
              </div>
              <div className="threshold-grid">
                <div><small>Current</small><b>{reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : '—'}</b></div>
                <div><small>Warning</small><b>{station?.warning_level_m != null ? `${Number(station.warning_level_m).toFixed(2)} m` : '—'}</b></div>
                <div><small>Danger</small><b>{station?.danger_level_m != null ? `${Number(station.danger_level_m).toFixed(2)} m` : '—'}</b></div>
                <div><small>HFL</small><b>{station?.highest_flood_level_m != null ? `${Number(station.highest_flood_level_m).toFixed(2)} m` : '—'}</b></div>
              </div>
              <div className="hazard-foot"><span>Rise rate <b>{reading?.water_level_rate_m_hr != null ? `${Number(reading.water_level_rate_m_hr).toFixed(2)} m/hr` : '—'}</b></span><span>Observed <b>{formatTime(reading?.observed_at)}</b></span></div>
            </div>

            <div className="panel alert-card">
              <div className="alert-top">
                <span className="section-kicker">ALERT CONTROL / {priority}</span>
                <span className="verified"><ShieldCheck size={14} /> {alertStatus.toUpperCase()}</span>
              </div>
              <div className="alert-title">
                <div className="alert-symbol"><AlertTriangle size={21} /></div>
                <div><h2>{alertTitle}</h2><p>{latestEvaluation?.reasons?.[0] ?? activeAlert?.description ?? 'Rule engine monitoring station thresholds'}</p></div>
              </div>
              <div className="alert-meta">
                <span><b>{formatTime(activeAlert?.created_at ?? latestEvaluation?.evaluated_at)}</b> generated</span>
                <span><b>{latestEvaluation?.total_score ?? '—'}</b> risk score</span>
              </div>
              {activeAlert ? (
                <button className="primary-btn" onClick={openAlertReview}><ShieldCheck size={16} /> Review alert & impact <ArrowRight size={15} /></button>
              ) : (
                <div className="approval-note"><Info size={15} /><span>{latestEvaluation?.alert_recommended ? 'An alert is recommended. Human approval is required before public dispatch.' : 'No public alert is currently recommended.'}</span></div>
              )}
            </div>
          </aside>
        </section>

        <section id="village-impact-list" className="panel impact-panel">
          <div className="panel-head">
            <div><span className="section-kicker">02 / IMPACT ASSESSMENT</span><h2>Affected villages & time to impact</h2></div>
            <div className="impact-head-meta"><span>{impactAssessments.length} assessed</span><span>{impactAssessments.reduce((sum, item) => sum + (item.population_at_risk ?? 0), 0).toLocaleString('en-IN')} people at risk</span></div>
          </div>

          {impactLoading ? (
            <div className="empty-state"><span className="pulse-dot" /> Loading backend impact assessment…</div>
          ) : impactError ? (
            <div className="empty-state error-text"><AlertTriangle size={16} /> {impactError}</div>
          ) : impactAssessments.length ? (
            <div className="impact-table">
              <div className="impact-table-head"><span>Village</span><span>Risk</span><span>ETA</span><span>Population</span><span>Downstream</span><span>Delivery</span></div>
              {zones.map((zone) => {
                const impact = impactAssessments.find((item) => item.village_id === zone.id)
                if (!impact) return null
                return (
                  <button key={zone.id} className={'impact-row ' + (selectedVillageId === zone.id ? 'selected' : '')} onClick={() => setSelectedVillageId(zone.id)}>
                    <span className="impact-village"><span className="village-icon" style={{ color: zone.color }}><CircleDot size={15} /></span><b>{zone.name}</b></span>
                    <span><span className={'risk ' + zone.risk.toLowerCase()}>{zone.risk}</span><small>{impact.risk_score.toFixed(0)}/100</small></span>
                    <span className="impact-strong">{formatEta(impact.time_to_impact_minutes)}</span>
                    <span>{formatNumber(impact.population_at_risk ?? zone.population)}</span>
                    <span>#{impact.downstream_order ?? '—'}</span>
                    <span><span className="delivery-chip reached">ASSESSED</span><small>{impact.calculation_method ?? 'Backend impact model'}</small></span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="empty-state"><Info size={16} /> No persisted impact assessment is available for the current alert yet.</div>
          )}

          <div className="impact-note"><Info size={14} /> Impact ETA and risk are backend assessments. Current prototype ordering uses the seeded downstream-order model and is not a terrain/DEM-derived evacuation forecast.</div>
        </section>

        {selectedVillage && (
          <section className="selected-village panel">
            <div><span className="section-kicker">SELECTED VILLAGE</span><h2>{selectedVillage.name}</h2></div>
            <div className="selected-metrics"><span><b>{selectedVillage.risk}</b> risk</span><span><b>{selectedVillage.riskScore ?? '—'}</b> score</span><span><b>{formatEta(selectedVillage.eta)}</b> impact</span><span><b>{formatNumber(selectedVillage.population)}</b> population</span><span><b>{selectedVillage.vulnerability || '—'}</b> vulnerability</span></div>
            <button className="icon-btn" onClick={() => setSelectedVillageId(null)} aria-label="Close selected village"><X size={16} /></button>
          </section>
        )}

        </> : activeTab === 'Connectivity' ? <ConnectivityPage riverCode={riverCode} onRiverChange={(nextRiver) => { setRiverCode(nextRiver); setTick(0); setStarted(false) }} /> : <ControlRoomPanel section={activeTab} station={station} reading={reading} latestEvaluation={latestEvaluation} activeAlert={activeAlert} dashboard={dashboard} zones={zones} networks={networks} totalPopulationAtRisk={totalPopulationAtRisk} onReviewAlert={() => { void openAlertReview() }} />
        )}
      </main>

      <footer>
        <span><span className="pulse-dot" /> Last sync {formatTime(latestEvaluation?.evaluated_at ?? reading?.observed_at)} IST</span>
        <span>{PRODUCT_NAME} <span className="footer-divider" /> {roleLabel[selectedRole]} workspace <span className="footer-divider" /> v0.2 / field test</span>
      </footer>

      {alertModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAlertModalOpen(false)}>
          <section className="modal-card approval-modal" role="dialog" aria-modal="true" aria-labelledby="alert-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="section-kicker">ALERT REVIEW / HUMAN GATE</span><h2 id="alert-review-title">{alertDetail?.title ?? alertTitle}</h2></div>
              <button className="icon-btn" onClick={() => setAlertModalOpen(false)} aria-label="Close alert review"><X size={17} /></button>
            </div>

            <div className="modal-severity">
              <div className="alert-symbol"><AlertTriangle size={19} /></div>
              <div><b>{alertDetail?.priority ?? priority} / {alertDetail?.severity ?? 'Severe'}</b><span>Status: {alertStatus}</span></div>
            </div>
            <div className="approval-timeline">
              <div className="timeline-step complete"><span>01</span><b>Detected</b><small>Evidence evaluated</small></div>
              <div className="timeline-line active" />
              <div className="timeline-step complete"><span>02</span><b>Recommended</b><small>Rule engine threshold met</small></div>
              <div className="timeline-line active" />
              <div className="timeline-step current"><span>03</span><b>Approval</b><small>Authenticated human required</small></div>
              <div className="timeline-line" />
              <div className="timeline-step"><span>04</span><b>Dispatch</b><small>Blocked until authorization</small></div>
            </div>

            <div className="modal-copy">{alertDetail?.description ?? latestEvaluation?.reasons?.join(' · ') ?? 'No extended alert description available.'}</div>
            {alertDetail?.instruction && <div className="instruction-box"><Info size={16} /><span>{alertDetail.instruction}</span></div>}

            <div className="modal-grid">
              <div><small>Affected villages</small><b>{impactAssessments.length || alertTargets.length}</b></div>
              <div><small>Population at risk</small><b>{formatNumber(totalPopulationAtRisk)}</b></div>
              <div><small>Deliveries recorded</small><b>{alertDeliveries.length}</b></div>
              <div><small>Approval</small><b>Authenticated user required</b></div>
            </div>

            <div className="approval-action-panel">
              <div><b>Authorization is not enabled yet</b><span>This review package is available to the appropriate role, but Supabase Auth and the protected approval API are the next phase. No alert status is changed here.</span></div>
            </div>

            <div className="approval-note"><ShieldCheck size={16} /><span>Only an authenticated authorized role can approve a public warning. Community members and village users can receive/report; they do not authorize public dispatch.</span></div>
            <button className="primary-btn modal-close" onClick={() => setAlertModalOpen(false)}><CheckCircle2 size={16} /> Close review</button>
          </section>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, suffix, icon, accent }: { label: string; value: string; suffix: string; icon: ReactNode; accent: string }) {
  return <div className={'stat-card ' + accent}><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong>{value}</strong><small>{suffix}</small></div>
}

function NetworkRow({ label, icon, active, onClick }: { label: string; icon: ReactNode; active: boolean; onClick: () => void }) {
  return <button className="network-row" onClick={onClick}><div className="network-icon">{icon}</div><div className="network-name"><b>{label}</b><span>{active ? 'Operational' : 'Unavailable'}</span></div><div className={'network-state ' + (active ? 'on' : '')}>{active ? <Signal size={16} /> : <WifiOff size={16} />}</div><div className={'toggle ' + (active ? 'enabled' : '')}><span /></div></button>
}

function Relay({ rank, device, location, score, battery, direction }: { rank: string; device: string; location: string; score: string; battery: string; direction: string }) {
  return <div className="relay-row"><span className="relay-rank">{rank}</span><div className="phone-icon"><Smartphone size={16} /></div><div className="relay-name"><b>{device}</b><span>{location} / moving {direction}</span></div><div className="relay-score"><b>{score}</b><span>score</span></div><div className="battery"><BatteryMedium size={14} /> {battery}%</div></div>
}

function FlowItem({ title, detail }: { title: string; detail: string }) {
  return <div className="flow-item"><b>{title}</b><span>{detail}</span></div>
}

export default App
