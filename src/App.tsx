import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BatteryMedium,
  CheckCircle2,
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
  ShieldCheck,
  ShieldAlert,
  Signal,
  UserRound,
  UsersRound,
  ClipboardList,
  MapPinned,
  BellRing,
  Settings2,
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

type RiverCode = 'TEESTA' | 'DESANG'
type NetworkKey = 'internet' | 'cellular' | 'mesh'


type DemoRole = 'control_room' | 'disaster_authority' | 'village_authority' | 'community_member' | 'admin'

const ROLE_META: Record<DemoRole, { label: string; title: string; subtitle: string; icon: ReactNode }> = {
  control_room: { label: 'Control room', title: 'Control Room', subtitle: 'Regional monitoring, alert review and public-dispatch workflow', icon: <ShieldAlert size={18} /> },
  disaster_authority: { label: 'Disaster authority', title: 'Disaster Authority', subtitle: 'Authority-level oversight of hazard events, impact and public warnings', icon: <BellRing size={18} /> },
  village_authority: { label: 'Village authority', title: 'Village Authority', subtitle: 'Local warning visibility, village status and situation awareness', icon: <MapPinned size={18} /> },
  community_member: { label: 'Community member', title: 'Community Member', subtitle: 'Citizen-facing warning, local reporting and acknowledgement', icon: <UsersRound size={18} /> },
  admin: { label: 'System admin', title: 'System Administrator', subtitle: 'System health, role readiness and configuration oversight', icon: <Settings2 size={18} /> },
}

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
  const [demoRole, setDemoRole] = useState<DemoRole>('control_room')
  const [demoVillageId, setDemoVillageId] = useState<string | null>(null)

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
        setDemoVillageId(villageResponse.items[0]?.id ?? null)
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
  const displayAlertTitle = alertTitle.replace(/CascadeGuard/gi, PRODUCT_NAME)
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
    setDemoVillageId(zones[0]?.id ?? null)
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
      icon: '/sentinel-x-icon.svg',
      tag: 'sentinel-x-p0',
    })
    setNotificationState('sent')
  }

  function locateRiskGap() {
    if (!highestRiskGap) return
    setSelectedVillageId(highestRiskGap.id)
    document.getElementById('village-impact-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
        <nav className="topnav">
          {['Command view', 'Scenarios', 'Network twin', 'Role workspaces'].map((item) => (
            <button className={activeTab === item ? 'nav-link active' : 'nav-link'} key={item} onClick={() => setActiveTab(item)}>{item}</button>
          ))}
        </nav>
        <div className="top-actions">
          <span className="live-pill"><span className="pulse-dot" /> BACKEND CONNECTED</span>
          <button className="icon-btn mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={18} /></button>
          <div className="operator role-demo-wrap">
            <div className="avatar"><UserRound size={15} /></div>
            <label className="role-demo-label" htmlFor="demo-role-select">DEMO ROLE</label>
            <select id="demo-role-select" className="role-demo-select" value={demoRole} onChange={(event) => setDemoRole(event.target.value as DemoRole)}>
              <option value="control_room">Control room</option>
              <option value="disaster_authority">Disaster authority</option>
              <option value="village_authority">Village authority</option>
              <option value="community_member">Community member</option>
              <option value="admin">System admin</option>
            </select>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="mobile-nav">
          {['Command view', 'Scenarios', 'Network twin', 'Role workspaces'].map((item) => (
            <button key={item} onClick={() => { setActiveTab(item); setMenuOpen(false) }}>{item}</button>
          ))}
        </div>
      )}

      <main className="content">
        {activeTab === 'Role workspaces' ? (
          <RoleWorkspace
            role={demoRole}
            onRoleChange={setDemoRole}
            zones={zones}
            impactAssessments={impactAssessments}
            station={station}
            reading={reading}
            latestEvaluation={latestEvaluation}
            activeAlert={activeAlert}
            displayAlertTitle={displayAlertTitle}
            alertStatus={alertStatus}
            networks={networks}
            onNetworkToggle={toggleNetwork}
            demoVillageId={demoVillageId}
            onVillageChange={setDemoVillageId}
            onOpenAlertReview={openAlertReview}
          />
        ) : (
        <>
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
          <Stat label="ACTIVE RELAYS" value={networks.mesh ? String(Math.max(1, zones.length)).padStart(2, '0') : '00'} suffix={networks.mesh ? 'offline mesh simulation' : 'standby'} icon={<Radio size={17} />} accent="yellow" />
          <Stat label="MESSAGE PRIORITY" value={priority} suffix={`${riskLabel(latestEvaluation?.risk_level)} / score ${latestEvaluation?.total_score ?? '—'}`} icon={<Siren size={17} />} accent="coral" />
        </section>

        {error && <div className="panel error-banner"><AlertTriangle size={16} /> Backend error: {error}</div>}

        <section className="phone-alert-strip">
          <div><b>Phone delivery test</b><span>Preview how an emergency warning appears on an installed field device.</span></div>
          <button className="phone-notify-btn" onClick={sendPhoneNotification} disabled={!hasAlert}>
            <Smartphone size={15} /> {notificationState === 'sent' ? 'Notification sent' : notificationState === 'blocked' ? 'Permission blocked' : 'Send test notification'}
          </button>
        </section>

        <section className="workspace-grid">
          <div className="map-panel panel">
            <div className="panel-head">
              <div><span className="section-kicker">01 / GEOGRAPHIC TWIN</span><h2>Hazard & impact map</h2></div>
              <div className="map-legend"><span><i className="legend-dot danger" /> Impact path</span><span><i className="legend-dot relay" /> Relay active</span></div>
            </div>

            <div className="map-canvas">
              <div className="map-grid-lines" />
              <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={routePath} className="route-path faint" />
                <path d={routePath} className="route-path" />
                {networks.mesh && <path d={routePath} className="route-path mesh-route" />}
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
              <div className="map-status"><span className="status-dot" /> {routeText}</div>
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
                <div><h2>{displayAlertTitle}</h2><p>{latestEvaluation?.reasons?.[0] ?? activeAlert?.description ?? 'Rule engine monitoring station thresholds'}</p></div>
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
                    <span><span className={'delivery-chip ' + (zone.coverage >= 80 ? 'reached' : zone.coverage > 0 ? 'relaying' : 'pending')}>{zone.coverage >= 80 ? 'Reached' : zone.coverage > 0 ? 'Relaying' : 'Pending'}</span><small>{zone.coverage}%</small></span>
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

        <section className="phone-alert-strip secondary-strip">
          <div><b>Last-mile communication state</b><span>Network controls below are prototype simulation controls; they do not represent a live physical LoRa link.</span></div>
          <span className="simulation-chip">SIMULATION</span>
        </section>

        <section className="bottom-grid">
          <div className="panel network-panel">
            <div className="panel-head compact"><div><span className="section-kicker">03 / NETWORK TWIN</span><h2>Communication health</h2></div><span className="health-badge"><span className="status-dot" /> {Object.values(networks).filter(Boolean).length}/3 paths live</span></div>
            <div className="network-rows">
              <NetworkRow label="Internet / cloud" icon={<Wifi size={17} />} active={networks.internet} onClick={() => toggleNetwork('internet')} />
              <NetworkRow label="Cellular towers" icon={<TowerControl size={17} />} active={networks.cellular} onClick={() => toggleNetwork('cellular')} />
              <NetworkRow label="Offline mesh" icon={<Radio size={17} />} active={networks.mesh} onClick={() => toggleNetwork('mesh')} />
            </div>
          </div>

          <div className="panel relay-panel">
            <div className="panel-head compact"><div><span className="section-kicker">04 / OPPORTUNISTIC ROUTING</span><h2>Best next-hop relays</h2></div><span className="sort-label">FORWARDING SCORE ↓</span></div>
            <div className="relay-list">
              <Relay rank="01" device="Phone 17" location={zones[0]?.name ?? 'Village 1'} score="92" battery="84" direction="south-east" />
              <Relay rank="02" device="Phone 23" location={zones[1]?.name ?? 'Village 2'} score="78" battery="61" direction="south" />
              <Relay rank="03" device="Phone 41" location={zones[2]?.name ?? 'Village 3'} score="64" battery="38" direction="east" />
            </div>
            <button className="mesh-advance" onClick={advanceMesh}><Radio size={16} /> {networks.mesh ? 'Advance mesh propagation' : 'Activate mesh fallback'} <span>STEP {String(tick + 1).padStart(2, '0')}</span></button>
          </div>
        </section>

        <section className="demo-flow panel">
          <div><span className="section-kicker">05 / SYSTEM FLOW</span><h2>Detect → evaluate → approve → route → reach</h2></div>
          <div className="flow-items">
            <FlowItem title="Detect" detail="CWC + sensor" />
            <ArrowRight size={15} />
            <FlowItem title="Evaluate" detail="Rule engine" />
            <ArrowRight size={15} />
            <FlowItem title="Approve" detail="Human gate" />
            <ArrowRight size={15} />
            <FlowItem title="Route" detail="Cloud / mesh" />
            <ArrowRight size={15} />
            <FlowItem title="Reach" detail="Village device" />
          </div>
        </section>
        </>
        )}
      </main>

      <footer>
        <span><span className="pulse-dot" /> Last sync {formatTime(latestEvaluation?.evaluated_at ?? reading?.observed_at)} IST</span>
        <span>{PRODUCT_NAME} <span className="footer-divider" /> CAP-compatible alert simulator <span className="footer-divider" /> v0.2 / field test</span>
      </footer>

      {alertModalOpen && (
        <div className="modal-backdrop" role="presentation" onClick={() => setAlertModalOpen(false)}>
          <section className="modal-card approval-modal" role="dialog" aria-modal="true" aria-labelledby="alert-review-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div><span className="section-kicker">ALERT REVIEW / HUMAN GATE</span><h2 id="alert-review-title">{(alertDetail?.title ?? alertTitle).replace(/CascadeGuard/gi, PRODUCT_NAME)}</h2></div>
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
              <div className="timeline-step current"><span>03</span><b>Approval</b><small>Awaiting authorized user</small></div>
              <div className="timeline-line" />
              <div className="timeline-step"><span>04</span><b>Dispatch</b><small>Blocked until approval</small></div>
            </div>

            <div className="modal-copy">{alertDetail?.description ?? latestEvaluation?.reasons?.join(' · ') ?? 'No extended alert description available.'}</div>
            {alertDetail?.instruction && <div className="instruction-box"><Info size={16} /><span>{alertDetail.instruction}</span></div>}

            <div className="modal-grid">
              <div><small>Affected villages</small><b>{impactAssessments.length || alertTargets.length}</b></div>
              <div><small>Population at risk</small><b>{formatNumber(totalPopulationAtRisk)}</b></div>
              <div><small>Deliveries recorded</small><b>{alertDeliveries.length}</b></div>
              <div><small>Approval</small><b>Authenticated user required</b></div>
            </div>

            <div className="approval-action-panel auth-gated-panel">
              <ShieldAlert size={18} />
              <div><b>Approval controls are intentionally unavailable</b><span>This interface is showing the review stage only. Public dispatch approval will be enabled once authentication and role-based authorization are connected.</span></div>
            </div>

            <div className="approval-note"><ShieldCheck size={16} /><span>Authentication and real public dispatch remain intentionally disabled. Only an authenticated control-room, disaster-authority, or authorized admin role will be able to approve public dispatch.</span></div>
            <button className="primary-btn modal-close" onClick={() => setAlertModalOpen(false)}><CheckCircle2 size={16} /> Close review</button>
          </section>
        </div>
      )}
    </div>
  )
}

function RoleWorkspace({
  role,
  onRoleChange,
  zones,
  impactAssessments,
  station,
  reading,
  latestEvaluation,
  activeAlert,
  displayAlertTitle,
  alertStatus,
  networks,
  onNetworkToggle,
  demoVillageId,
  onVillageChange,
  onOpenAlertReview,
}: {
  role: DemoRole
  onRoleChange: (role: DemoRole) => void
  zones: Zone[]
  impactAssessments: ImpactAssessment[]
  station?: {
    station_code: string
    station_name: string
    river_name?: string | null
    warning_level_m?: number | null
    danger_level_m?: number | null
    highest_flood_level_m?: number | null
  }
  reading?: {
    water_level_m?: number | null
    water_level_rate_m_hr?: number | null
    observed_at: string
    data_mode?: string | null
  }
  latestEvaluation: DashboardSummary['recent_evaluations'][number] | null
  activeAlert: Alert | null
  displayAlertTitle: string
  alertStatus: string
  networks: Record<NetworkKey, boolean>
  onNetworkToggle: (key: NetworkKey) => void
  demoVillageId: string | null
  onVillageChange: (id: string) => void
  onOpenAlertReview: () => void
}) {
  const meta = ROLE_META[role]
  const selected = zones.find((zone) => zone.id === demoVillageId) ?? zones[0] ?? null
  const atRisk = zones.filter((zone) => ['CRITICAL', 'HIGH', 'WARNING'].includes(zone.risk)).length
  const authorizedApprovalRole = role === 'control_room' || role === 'disaster_authority' || role === 'admin'

  return (
    <>
      <section className="intro-row role-workspace-hero">
        <div>
          <div className="eyebrow"><span className="eyebrow-line" /> MULTI-USER / ROLE WORKSPACE</div>
          <h1>{meta.title}<br /><em>role panel</em></h1>
          <p className="intro-copy">{meta.subtitle}.<br />Authentication is intentionally disabled for this prototype.</p>
        </div>
        <div className="intro-actions role-picker-wrap">
          <label className="scenario-label" htmlFor="workspace-role-select">DEMO ROLE</label>
          <select id="workspace-role-select" className="scenario-select" value={role} onChange={(event) => onRoleChange(event.target.value as DemoRole)}>
            {Object.entries(ROLE_META).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
          </select>
        </div>
      </section>

      <section className="brand-context-bar role-context-bar">
        <div className="role-context-title">{meta.icon}<div><b>{meta.label}</b><span>{ROLE_META[role].subtitle}</span></div></div>
        <div className="context-tag">DEMO SESSION / AUTH OFF</div>
        <div className="data-mode-tag"><span className="status-dot" /> BACKEND DATA AVAILABLE</div>
      </section>

      {role === 'control_room' && (
        <RoleControlRoomCard
          zones={zones}
          impactAssessments={impactAssessments}
          latestEvaluation={latestEvaluation}
          activeAlert={activeAlert}
          displayAlertTitle={displayAlertTitle}
          alertStatus={alertStatus}
          onOpenAlertReview={onOpenAlertReview}
        />
      )}

      {role === 'disaster_authority' && (
        <div className="role-grid">
          <RoleMetricCard icon={<BellRing size={18} />} title="Regional alert status" value={activeAlert ? `${activeAlert.priority ?? 'P3'} / ${alertStatus}` : 'No active alert'} detail={activeAlert ? displayAlertTitle : 'Monitor events across available basins'} />
          <RoleMetricCard icon={<Gauge size={18} />} title="Highest assessed risk" value={latestEvaluation ? `${riskLabel(latestEvaluation.risk_level)} / ${latestEvaluation.total_score}` : '—'} detail={station ? `${station.river_name ?? 'River'} / ${station.station_name}` : 'No station selected'} />
          <RoleMetricCard icon={<UsersRound size={18} />} title="Population at risk" value={formatNumber(impactAssessments.reduce((sum, item) => sum + (item.population_at_risk ?? 0), 0))} detail={`${impactAssessments.length} affected village assessments`} />
          <RoleMetricCard icon={<Route size={18} />} title="Communication posture" value={networks.internet || networks.cellular ? 'Primary paths available' : networks.mesh ? 'Mesh fallback active' : 'No path'} detail="Public warning route shown for operator review" />
        </div>
      )}

      {role === 'village_authority' && (
        <div className="role-grid village-role-grid">
          <div className="panel role-panel role-primary-panel">
            <div className="panel-head compact"><div><span className="section-kicker">LOCAL WARNING</span><h2>Village situation</h2></div><span className="role-status-chip">RECEIVER / LOCAL</span></div>
            <div className="role-panel-body">
              <label className="role-field-label" htmlFor="village-role-select">DEMO VILLAGE</label>
              <select id="village-role-select" className="role-full-select" value={selected?.id ?? ''} onChange={(event) => onVillageChange(event.target.value)}>
                {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
              {selected ? <>
                <div className="role-emergency-card"><div className="alert-symbol"><AlertTriangle size={20} /></div><div><span className="section-kicker">CURRENT LOCAL STATE</span><h3>{selected.risk} RISK / {formatEta(selected.eta)}</h3><p>{selected.name} · population {formatNumber(selected.population)} · vulnerability {selected.vulnerability || '—'}</p></div></div>
                <div className="role-action-list"><div><MapPinned size={16} /><span><b>Local status</b>{selected.status === 'unreached' ? 'Warning not yet confirmed as delivered' : `Message state: ${selected.status}`}</span></div><div><BellRing size={16} /><span><b>Required action</b>{selected.risk === 'CRITICAL' ? 'Move to the designated safer area immediately when instructed.' : 'Remain alert and follow local authority instructions.'}</span></div></div>
              </> : <div className="empty-state">No village selected.</div>}
            </div>
          </div>
          <div className="panel role-panel">
            <div className="panel-head compact"><div><span className="section-kicker">AUTHORITY BOUNDARY</span><h2>What this role can do</h2></div></div>
            <div className="role-permission-list"><PermissionRow allowed label="Receive village warnings" /><PermissionRow allowed label="View local impact assessment" /><PermissionRow allowed label="Report/confirm local conditions (auth later)" /><PermissionRow label="Approve public dispatch" note="Reserved for authorized disaster/control-room roles" /></div>
          </div>
        </div>
      )}

      {role === 'community_member' && (
        <div className="role-grid community-role-grid">
          <div className="panel role-panel role-primary-panel">
            <div className="panel-head compact"><div><span className="section-kicker">CITIZEN ALERT</span><h2>Your warning</h2></div><span className="role-status-chip">USER VIEW</span></div>
            <div className="role-panel-body">
              <label className="role-field-label" htmlFor="community-village-select">DEMO VILLAGE</label>
              <select id="community-village-select" className="role-full-select" value={selected?.id ?? ''} onChange={(event) => onVillageChange(event.target.value)}>
                {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
              <div className={'citizen-alert ' + (activeAlert ? 'active' : 'standby')}>
                <div className="citizen-alert-kicker"><BellRing size={16} /> {activeAlert ? `${activeAlert.priority ?? 'P3'} / ${riskLabel(latestEvaluation?.risk_level)}` : 'NO ACTIVE PUBLIC ALERT'}</div>
                <h3>{activeAlert ? displayAlertTitle : 'You are currently in a monitoring state.'}</h3>
                <p>{activeAlert ? (activeAlert.instruction ?? 'Follow local disaster-management instructions and move toward the designated safe area if directed.') : 'No public warning has been issued for the selected scenario.'}</p>
                <div className="citizen-meta"><span><b>{selected ? formatEta(selected.eta) : '—'}</b> time to impact</span><span><b>{selected?.name ?? '—'}</b> village</span><span><b>{networks.internet ? 'Internet' : networks.cellular ? 'Cellular' : networks.mesh ? 'Offline relay' : 'Disconnected'}</b> delivery path</span></div>
              </div>
            </div>
          </div>
          <div className="panel role-panel">
            <div className="panel-head compact"><div><span className="section-kicker">COMMUNITY TO SYSTEM</span><h2>Local reporting</h2></div></div>
            <div className="community-report-demo">
              <div className="report-row"><ClipboardList size={17} /><div><b>Report a local situation</b><span>Flooding, water rise, blocked route or unusual local condition</span></div></div>
              <div className="report-row"><BellRing size={17} /><div><b>Acknowledge received warning</b><span>Records that the warning was seen on the user's device once authentication is connected.</span></div></div>
              <div className="auth-boundary"><ShieldCheck size={15} /><span>Submission/acknowledgement will be API-backed after authentication. No unauthenticated community data is written from this screen.</span></div>
            </div>
          </div>
        </div>
      )}

      {role === 'admin' && (
        <div className="role-grid">
          <RoleMetricCard icon={<Settings2 size={18} />} title="System health" value="Backend connected" detail="FastAPI service responding to dashboard requests" />
          <RoleMetricCard icon={<UsersRound size={18} />} title="Role model" value="5 roles defined" detail="Control room, disaster authority, village authority, community member, admin" />
          <RoleMetricCard icon={<ShieldAlert size={18} />} title="Authorization" value="Disabled in UI" detail="Supabase Auth integration remains a later phase" />
          <RoleMetricCard icon={<Route size={18} />} title="Dispatch integration" value="Future" detail="Real public-dispatch authorization and provider integration are not active" />
          <div className="panel role-panel role-wide-panel">
            <div className="panel-head compact"><div><span className="section-kicker">SYSTEM BOUNDARIES</span><h2>Protected actions</h2></div></div>
            <div className="role-permission-list">
              <PermissionRow allowed label="View operational data" />
              <PermissionRow allowed label="Inspect system configuration status" />
              <PermissionRow label="Approve public alert" note="Authentication + role authorization required" />
              <PermissionRow label="Dispatch to external providers" note="Provider integrations are future scope" />
              <PermissionRow label="Change user roles" note="Admin UI can be implemented after authentication" />
            </div>
          </div>
        </div>
      )}

      <section className="role-footer-strip panel">
        <div><span className="section-kicker">CURRENT SCENARIO</span><b>{station?.river_name ?? 'River'} / {station?.station_name ?? 'Station'}</b><span>{reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : 'No reading'} · {riskLabel(latestEvaluation?.risk_level)} · {atRisk} elevated villages</span></div>
        <div className="role-footer-actions">
          <span className="auth-badge">AUTHENTICATION: OFF</span>
          {activeAlert && <button className="outline-btn" onClick={onOpenAlertReview}><ShieldAlert size={15} /> Review current alert</button>}
          {authorizedApprovalRole && <span className="auth-hint">Approval unlocks only after sign-in.</span>}
        </div>
      </section>
    </>
  )
}

function RoleControlRoomCard({ zones, impactAssessments, latestEvaluation, activeAlert, displayAlertTitle, alertStatus, onOpenAlertReview }: { zones: Zone[]; impactAssessments: ImpactAssessment[]; latestEvaluation: DashboardSummary['recent_evaluations'][number] | null; activeAlert: Alert | null; displayAlertTitle: string; alertStatus: string; onOpenAlertReview: () => void }) {
  return (
    <>
      <div className="role-grid">
        <RoleMetricCard icon={<Siren size={18} />} title="Alert queue" value={activeAlert ? `${activeAlert.priority ?? 'P3'} / ${alertStatus}` : 'No active alert'} detail={activeAlert ? displayAlertTitle : 'No public alert currently waiting for review'} />
        <RoleMetricCard icon={<Gauge size={18} />} title="Current risk" value={latestEvaluation ? `${riskLabel(latestEvaluation.risk_level)} / ${latestEvaluation.total_score}` : '—'} detail="Backend rule-evaluation result" />
        <RoleMetricCard icon={<UsersRound size={18} />} title="Affected villages" value={String(impactAssessments.length)} detail={`Population ${formatNumber(impactAssessments.reduce((sum, item) => sum + (item.population_at_risk ?? 0), 0))}`} />
        <RoleMetricCard icon={<Radio size={18} />} title="Failover" value={zones.length ? 'Ready for simulation' : 'No villages loaded'} detail="Internet / cellular / offline mesh controls remain in the Network Twin" />
      </div>
      <section className="panel role-primary-action">
        <div className="panel-head compact"><div><span className="section-kicker">CONTROL-ROOM DECISION</span><h2>Human approval gate</h2></div><span className="role-status-chip">AUTH REQUIRED</span></div>
        <div className="role-decision-body">
          <div><div className="decision-icon"><ShieldAlert size={21} /></div><div><h3>{activeAlert ? 'Alert ready for authorized review' : 'No alert awaiting approval'}</h3><p>{activeAlert ? 'A backend-generated recommendation exists. This role can review evidence now; authorization is still required before public dispatch.' : 'The rule engine has not produced an active public alert for the selected scenario.'}</p></div></div>
          <div className="decision-actions">
            {activeAlert && <button className="primary-btn" onClick={onOpenAlertReview}><ShieldCheck size={16} /> Open alert review <ArrowRight size={15} /></button>}
            <button className="primary-btn disabled-btn" disabled title="Authentication is not connected yet"><CheckCircle2 size={16} /> Approve public dispatch</button>
          </div>
        </div>
      </section>
    </>
  )
}

function RoleMetricCard({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string; detail: string }) {
  return <div className="panel role-metric-card"><div className="role-metric-icon">{icon}</div><span className="section-kicker">{title}</span><strong>{value}</strong><p>{detail}</p></div>
}

function PermissionRow({ allowed = false, label, note }: { allowed?: boolean; label: string; note?: string }) {
  return <div className={'permission-row ' + (allowed ? 'allowed' : 'locked')}><span className="permission-dot" /> <div><b>{label}</b>{note && <small>{note}</small>}</div><span className="permission-state">{allowed ? 'VISIBLE' : 'LOCKED'}</span></div>
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
