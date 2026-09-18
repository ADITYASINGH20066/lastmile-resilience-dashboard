import { useEffect, useMemo, useState } from 'react'
import { getDashboardSummary, getVillages, type Alert, type DashboardSummary, type Village } from './api'
import {
  AlertTriangle,
  BatteryMedium,
  ChevronDown,
  CircleDot,
  CloudRain,
  Crosshair,
  Gauge,
  LocateFixed,
  Menu,
  Radio,
  RefreshCw,
  Route,
  Satellite,
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

type Zone = {
  id: string
  name: string
  risk: string
  eta: number
  coverage: number
  status: string
  x: number
  y: number
  color: string
  population: number
  vulnerability: number
}
type NetworkKey = 'internet' | 'cellular' | 'mesh'
type RiverCode = 'TEESTA' | 'DESANG'

const DEFAULT_RIVER: RiverCode = 'DESANG'

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

function buildRoutePath(zones: Zone[]) {
  if (zones.length < 2) return ''
  const [first, ...rest] = zones
  return [
    `M ${first.x} ${first.y}`,
    ...rest.map((zone, index) => {
      const previous = index === 0 ? first : rest[index - 1]
      const midX = (previous.x + zone.x) / 2
      const midY = (previous.y + zone.y) / 2
      return `Q ${midX} ${previous.y}, ${zone.x} ${zone.y}`
    }),
  ].join(' ')
}

function projectVillages(villages: Village[], riskLevel: string) {
  const usable = villages.filter((v) => typeof v.latitude === 'number' && typeof v.longitude === 'number')
  if (!usable.length) return [] as Zone[]

  const minLat = Math.min(...usable.map((v) => v.latitude as number))
  const maxLat = Math.max(...usable.map((v) => v.latitude as number))
  const minLon = Math.min(...usable.map((v) => v.longitude as number))
  const maxLon = Math.max(...usable.map((v) => v.longitude as number))
  const latSpan = Math.max(maxLat - minLat, 0.0001)
  const lonSpan = Math.max(maxLon - minLon, 0.0001)

  return [...usable]
    .sort((a, b) => (b.vulnerability_score ?? 0) - (a.vulnerability_score ?? 0))
    .map((village, index) => ({
      id: village.id,
      name: village.village_name,
      risk: riskLabel(riskLevel),
      eta: 15 * (index + 1),
      coverage: 0,
      status: 'unreached',
      x: 16 + (((village.longitude as number) - minLon) / lonSpan) * 68,
      y: 21 + (1 - ((village.latitude as number) - minLat) / latSpan) * 58,
      color: riskColor(riskLevel),
      population: village.population ?? 0,
      vulnerability: village.vulnerability_score ?? 0,
    }))
}

function App() {
  const [riverCode, setRiverCode] = useState<RiverCode>(DEFAULT_RIVER)
  const [zones, setZones] = useState<Zone[]>([])
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null)
  const [started, setStarted] = useState(false)
  const [tick, setTick] = useState(0)
  const [networks, setNetworks] = useState<Record<NetworkKey, boolean>>({ internet: true, cellular: true, mesh: false })
  const [activeTab, setActiveTab] = useState('Command view')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationState, setNotificationState] = useState<'idle' | 'sent' | 'blocked'>('idle')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError('')
      try {
        const [summary, villageResponse] = await Promise.all([
          getDashboardSummary(),
          getVillages(riverCode),
        ])

        if (cancelled) return

        setDashboard(summary)
        const stationForRiver = summary.stations.find((entry) => {
          const code = entry.station.station_code.toUpperCase()
          return riverCode === 'TEESTA' ? code === 'CWC_MELLI' : code === 'CWC_NANGLAMORAGHAT'
        })
        const latestReadingId = stationForRiver?.latest_reading?.id
        const evaluation = latestReadingId
          ? summary.recent_evaluations.find((item) => item.hydro_reading_id === latestReadingId)
          : undefined
        const risk = evaluation?.risk_level ?? 'watch'

        setZones(projectVillages(villageResponse.items, risk))
        setStarted(false)
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
    return dashboard.active_alerts.find((alert) => alert.event_id && alert.event_id === latestEvaluation?.event_id) ?? null
  }, [dashboard, latestEvaluation])

  const totalCoverage = zones.length
    ? Math.round(zones.reduce((sum, zone) => sum + zone.coverage, 0) / zones.length)
    : 0
  const highestRiskGap = useMemo(() => {
    if (!zones.length) return null
    return [...zones].sort((a, b) => a.coverage - b.coverage)[0]
  }, [zones])
  const routeText = networks.internet ? 'Cloud → tower → village' : networks.mesh ? 'Gateway → relay → village' : 'No active route'
  const routePath = useMemo(() => buildRoutePath(zones), [zones])
  const station = stationSnapshot?.station
  const reading = stationSnapshot?.latest_reading
  const priority = activeAlert?.priority ?? latestEvaluation?.alert_priority ?? 'P3'
  const alertTitle = activeAlert?.title ?? 'No active public alert'
  const alertStatus = activeAlert?.status?.replaceAll('_', ' ') ?? 'standby'

  function resetScenario() {
    setStarted(Boolean(dashboard?.active_alerts.length))
    setNetworks({ internet: true, cellular: true, mesh: false })
    setZones((current) => current.map((zone) => ({ ...zone, coverage: 0, status: 'unreached' })))
    setTick(0)
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
      if (index === 0) return { ...zone, coverage: Math.min(100, zone.coverage + 21), status: zone.coverage + 21 >= 80 ? 'reached' : 'relaying' }
      if (index === 1) return { ...zone, coverage: Math.min(100, zone.coverage + 16), status: zone.coverage + 16 >= 60 ? 'relaying' : 'at risk' }
      return { ...zone, coverage: Math.min(100, zone.coverage + 10), status: zone.coverage + 10 >= 60 ? 'relaying' : 'at risk' }
    }))
  }

  function toggleNetwork(key: NetworkKey) {
    setNetworks((current) => ({ ...current, [key]: !current[key] }))
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
    new Notification(`${priority} flood warning / LastMile`, { body: `${station?.station_name ?? 'Downstream villages'}: resilient alert test.`, icon: '/lastmile-icon.svg', tag: 'lastmile-p0' })
    setNotificationState('sent')
  }

  if (loading) {
    return <div className="app-shell"><main className="content"><div className="panel" style={{ padding: 24 }}>Loading live command data…</div></main></div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Route size={18} /></div><span>lastmile</span><small>/ resilience command</small></div>
        <nav className="topnav">{['Command view', 'Scenarios', 'Network twin'].map((item) => <button className={activeTab === item ? 'nav-link active' : 'nav-link'} key={item} onClick={() => setActiveTab(item)}>{item}</button>)}</nav>
        <div className="top-actions"><span className="live-pill"><span className="pulse-dot" /> BACKEND CONNECTED</span><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={18} /></button><div className="operator"><div className="avatar">AS</div><span>operator<br /><b>Control room</b></span><ChevronDown size={14} /></div></div>
      </header>
      {menuOpen && <div className="mobile-nav">{['Command view', 'Scenarios', 'Network twin'].map((item) => <button key={item} onClick={() => { setActiveTab(item); setMenuOpen(false) }}>{item}</button>)}</div>}

      <main className="content">
        <section className="intro-row"><div><div className="eyebrow"><span className="eyebrow-line" /> OPERATIONS / FLOOD 07</div><h1>When the network dies,<br /><em>the warning doesn't.</em></h1><p className="intro-copy">A live digital twin of the last-mile alert network.<br />Route urgency to the people who need it next.</p></div><div className="intro-actions"><select className="scenario-select" value={riverCode} onChange={(event) => { setRiverCode(event.target.value as RiverCode); setTick(0); setStarted(false) }} aria-label="Select river scenario"><option value="TEESTA">Teesta / CWC Melli</option><option value="DESANG">Desang / CWC Nanglamoraghat</option></select><button className="refresh" onClick={resetScenario} title="Reset scenario"><RefreshCw size={17} /></button></div></section>

        <section className="stats-grid"><Stat label="LATEST WATER LEVEL" value={reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : '—'} suffix={station?.station_name ?? 'No station data'} icon={<Gauge size={17} />} accent="coral" /><Stat label="POPULATION REACHED" value={totalCoverage + '%'} suffix={`${zones.length} mapped villages / simulation`} icon={<ShieldCheck size={17} />} accent="lime" /><Stat label="ACTIVE RELAYS" value={networks.mesh ? String(Math.max(1, zones.length + 1)).padStart(2, '0') : '00'} suffix={networks.mesh ? 'offline mesh nodes' : 'waiting for failover'} icon={<Radio size={17} />} accent="yellow" /><Stat label="MESSAGE PRIORITY" value={priority} suffix={`score ${latestEvaluation?.total_score ?? '—'} / ${riskLabel(latestEvaluation?.risk_level)}`} icon={<Siren size={17} />} accent="coral" /></section>

        {error && <div className="panel" style={{ padding: 12, marginBottom: 16, borderColor: 'rgba(255,107,74,.5)', color: 'var(--coral)' }}>Backend error: {error}</div>}

        <section className="phone-alert-strip"><div><b>Phone delivery</b><span>Install LastMile on your phone to receive a local emergency notification.</span></div><button className="phone-notify-btn" onClick={sendPhoneNotification}><Smartphone size={15} /> {notificationState === 'sent' ? 'Notification sent' : notificationState === 'blocked' ? 'Permission blocked' : 'Send test notification'}</button></section>

        <section className="workspace-grid">
          <div className="map-panel panel"><div className="panel-head"><div><span className="section-kicker">01 / GEOGRAPHIC TWIN</span><h2>Propagation map / {riverCode}</h2></div><div className="map-legend"><span><i className="legend-dot danger" /> Impact path</span><span><i className="legend-dot relay" /> Relay active</span></div></div><div className="map-canvas"><div className="map-grid-lines" /><svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d={routePath} className="route-path faint" /><path d={routePath} className="route-path" /><path d={routePath} className="route-path mesh-route" /></svg><div className="map-compass"><Crosshair size={15} /> N</div><div className="river river-one" /><div className="river river-two" />{zones.map((zone) => <div className={'zone-node ' + (zone.name === highestRiskGap?.name ? 'selected' : '')} style={{ left: zone.x + '%', top: zone.y + '%' }} key={zone.id}><div className="zone-ring" style={{ borderColor: zone.color }}><div className="zone-core" style={{ backgroundColor: zone.color }} /></div><div className="zone-label"><b>{zone.name}</b><span>{formatNumber(zone.population)} people</span></div></div>)}<div className="source-marker"><div className="source-icon"><CloudRain size={16} /></div><span>{station?.station_name ?? 'hydro station'}</span></div><div className="map-scale">0 <span /> 10 km</div></div><div className="map-footer"><div className="map-status"><span className="status-dot" /> {routeText}</div><button className="outline-btn"><LocateFixed size={15} /> Locate risk gap</button></div></div>

          <aside className="side-column"><div className="panel alert-card"><div className="alert-top"><span className="section-kicker">ACTIVE ALERT / {priority}</span><span className="verified"><ShieldCheck size={14} /> {alertStatus.toUpperCase()}</span></div><div className="alert-title"><div className="alert-symbol"><AlertTriangle size={21} /></div><div><h2>{alertTitle}</h2><p>{latestEvaluation?.reasons?.[0] ?? 'Rule engine monitoring station thresholds'}</p></div></div><div className="alert-meta"><span><b>{formatTime(activeAlert?.created_at ?? latestEvaluation?.evaluated_at)}</b> issued</span><span><b>{reading?.water_level_m != null ? `${Number(reading.water_level_m).toFixed(2)} m` : '—'}</b> water level</span></div><button className="primary-btn" onClick={started ? simulateFailure : () => { setStarted(true); setNetworks({ internet: true, cellular: true, mesh: false }) }}>{started ? 'Simulate network failure' : 'Start delivery simulation'} <Send size={16} /></button></div><div className="panel coverage-card"><div className="panel-head compact"><div><span className="section-kicker">02 / COVERAGE GAPS</span><h2>Who needs it next?</h2></div><span className="gap-count">{zones.filter((zone) => zone.coverage < 50).length} gaps</span></div>{zones.map((zone) => <div className="village-row" key={zone.id}><div className="village-icon" style={{ color: zone.color }}><CircleDot size={15} /></div><div className="village-info"><div><b>{zone.name}</b><span className={'risk ' + zone.risk.toLowerCase()}>{zone.risk}</span></div><div className="coverage-bar"><span style={{ width: clamp(zone.coverage, 0, 100) + '%', backgroundColor: zone.color }} /></div></div><div className="village-percent"><b>{zone.coverage}%</b><small>{zone.eta}m</small></div></div>)}<div className="gap-callout"><AlertTriangle size={16} /><div><b>Priority gap detected</b><span>{highestRiskGap ? `${highestRiskGap.name} / ${highestRiskGap.coverage}% coverage / ${highestRiskGap.eta} min ETA` : 'No village data'}</span></div></div></div></aside>
        </section>

        <section className="bottom-grid"><div className="panel network-panel"><div className="panel-head compact"><div><span className="section-kicker">03 / NETWORK TWIN</span><h2>Communication health</h2></div><span className="health-badge"><span className="status-dot" /> {Object.values(networks).filter(Boolean).length}/3 paths live</span></div><div className="network-rows"><NetworkRow label="Internet / cloud" icon={<Wifi size={17} />} active={networks.internet} onClick={() => toggleNetwork('internet')} /><NetworkRow label="Cellular towers" icon={<TowerControl size={17} />} active={networks.cellular} onClick={() => toggleNetwork('cellular')} /><NetworkRow label="Offline mesh" icon={<Radio size={17} />} active={networks.mesh} onClick={() => toggleNetwork('mesh')} /></div></div><div className="panel relay-panel"><div className="panel-head compact"><div><span className="section-kicker">04 / OPPORTUNISTIC ROUTING</span><h2>Best next-hop relays</h2></div><span className="sort-label">FORWARDING SCORE ↓</span></div><div className="relay-list"><Relay rank="01" device="Phone 17" location={zones[0]?.name ?? 'Village 1'} score="92" battery="84" direction="south-east" /><Relay rank="02" device="Phone 23" location={zones[1]?.name ?? 'Village 2'} score="78" battery="61" direction="south" /><Relay rank="03" device="Phone 41" location={zones[2]?.name ?? 'Village 3'} score="64" battery="38" direction="east" /></div><button className="mesh-advance" onClick={advanceMesh}><Radio size={16} /> Advance mesh propagation <span>STEP {String(tick + 1).padStart(2, '0')}</span></button></div></section>
      </main>
      <footer><span><span className="pulse-dot" /> Last sync {formatTime(latestEvaluation?.evaluated_at ?? reading?.observed_at)} IST</span><span>CAP-compatible alert simulator <span className="footer-divider" /> v0.1 / field test</span></footer>
    </div>
  )
}

function Stat({ label, value, suffix, icon, accent }: { label: string; value: string; suffix: string; icon: React.ReactNode; accent: string }) { return <div className={'stat-card ' + accent}><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong>{value}</strong><small>{suffix}</small></div> }
function NetworkRow({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) { return <button className="network-row" onClick={onClick}><div className="network-icon">{icon}</div><div className="network-name"><b>{label}</b><span>{active ? 'Operational' : 'Unavailable'}</span></div><div className={'network-state ' + (active ? 'on' : '')}>{active ? <Signal size={16} /> : <WifiOff size={16} />}</div><div className={'toggle ' + (active ? 'enabled' : '')}><span /></div></button> }
function Relay({ rank, device, location, score, battery, direction }: { rank: string; device: string; location: string; score: string; battery: string; direction: string }) { return <div className="relay-row"><span className="relay-rank">{rank}</span><div className="phone-icon"><Smartphone size={16} /></div><div className="relay-name"><b>{device}</b><span>{location} / moving {direction}</span></div><div className="relay-score"><b>{score}</b><span>score</span></div><div className="battery"><BatteryMedium size={14} /> {battery}%</div></div> }

export default App
