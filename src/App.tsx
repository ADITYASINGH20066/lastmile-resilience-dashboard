import { useMemo, useState } from 'react'
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

type Zone = { name: string; risk: string; eta: number; coverage: number; status: string; x: number; y: number; color: string }
type NetworkKey = 'internet' | 'cellular' | 'mesh'

const initialZones: Zone[] = [
  { name: 'Ramnagar', risk: 'CRITICAL', eta: 8, coverage: 92, status: 'reached', x: 20, y: 29, color: '#ff6b4a' },
  { name: 'Bhairavpur', risk: 'HIGH', eta: 14, coverage: 63, status: 'relaying', x: 45, y: 45, color: '#f3c969' },
  { name: 'Kalyanpur', risk: 'HIGH', eta: 22, coverage: 31, status: 'at risk', x: 66, y: 27, color: '#f3c969' },
  { name: 'Devgarh', risk: 'WATCH', eta: 37, coverage: 8, status: 'unreached', x: 78, y: 60, color: '#74c69d' },
]

function App() {
  const [zones, setZones] = useState(initialZones)
  const [started, setStarted] = useState(false)
  const [tick, setTick] = useState(0)
  const [networks, setNetworks] = useState<Record<NetworkKey, boolean>>({ internet: true, cellular: true, mesh: false })
  const [activeTab, setActiveTab] = useState('Command view')
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationState, setNotificationState] = useState<'idle' | 'sent' | 'blocked'>('idle')

  const totalCoverage = Math.round(zones.reduce((sum, zone) => sum + zone.coverage, 0) / zones.length)
  const highestRiskGap = useMemo(() => [...zones].sort((a, b) => a.coverage - b.coverage)[0], [zones])
  const routeText = networks.internet ? 'Cloud → tower → village' : networks.mesh ? '17 → 23 → 41 → Kalyanpur' : 'No active route'

  function launchAlert() {
    setStarted(true)
    setNetworks({ internet: true, cellular: true, mesh: false })
    setZones(initialZones)
    setTick(0)
  }

  function simulateFailure() {
    setNetworks({ internet: false, cellular: false, mesh: true })
    setStarted(true)
    setZones((current) => current.map((zone) => zone.name === 'Ramnagar' ? { ...zone, coverage: 100, status: 'reached' } : zone.name === 'Bhairavpur' ? { ...zone, coverage: 71, status: 'relaying' } : { ...zone, coverage: Math.max(0, zone.coverage - 4), status: 'at risk' }))
  }

  function advanceMesh() {
    setNetworks((current) => ({ ...current, mesh: true }))
    setStarted(true)
    setTick((value) => value + 1)
    setZones((current) => current.map((zone) => {
      if (zone.name === 'Kalyanpur') return { ...zone, coverage: Math.min(100, zone.coverage + 21), status: zone.coverage + 21 >= 80 ? 'reached' : 'relaying' }
      if (zone.name === 'Devgarh') return { ...zone, coverage: Math.min(100, zone.coverage + 13), status: zone.coverage + 13 >= 60 ? 'relaying' : 'at risk' }
      if (zone.name === 'Bhairavpur') return { ...zone, coverage: Math.min(100, zone.coverage + 8) }
      return zone
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
    new Notification('P0 flood warning / LastMile', { body: 'Bhairavpur: 14 minutes to impact. Move to higher ground.', icon: '/lastmile-icon.svg', tag: 'lastmile-p0' })
    setNotificationState('sent')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Route size={18} /></div><span>lastmile</span><small>/ resilience command</small></div>
        <nav className="topnav">{['Command view', 'Scenarios', 'Network twin'].map((item) => <button className={activeTab === item ? 'nav-link active' : 'nav-link'} key={item} onClick={() => setActiveTab(item)}>{item}</button>)}</nav>
        <div className="top-actions"><span className="live-pill"><span className="pulse-dot" /> LIVE SIMULATION</span><button className="icon-btn mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu"><Menu size={18} /></button><div className="operator"><div className="avatar">AS</div><span>operator<br /><b>Control room</b></span><ChevronDown size={14} /></div></div>
      </header>
      {menuOpen && <div className="mobile-nav">{['Command view', 'Scenarios', 'Network twin'].map((item) => <button key={item} onClick={() => { setActiveTab(item); setMenuOpen(false) }}>{item}</button>)}</div>}

      <main className="content">
        <section className="intro-row"><div><div className="eyebrow"><span className="eyebrow-line" /> OPERATIONS / FLOOD 07</div><h1>When the network dies,<br /><em>the warning doesn't.</em></h1><p className="intro-copy">A live digital twin of the last-mile alert network.<br />Route urgency to the people who need it next.</p></div><div className="intro-actions"><button className="scenario-select"><CloudRain size={16} /> Monsoon flood / Uttarakhand <ChevronDown size={15} /></button><button className="refresh" onClick={launchAlert} title="Reset scenario"><RefreshCw size={17} /></button></div></section>

        <section className="stats-grid"><Stat label="TIME TO IMPACT" value={zones[1].eta + ' min'} suffix="Bhairavpur downstream" icon={<Gauge size={17} />} accent="coral" /><Stat label="POPULATION REACHED" value={totalCoverage + '%'} suffix="across 4 villages" icon={<ShieldCheck size={17} />} accent="lime" /><Stat label="ACTIVE RELAYS" value={networks.mesh ? '04' : '00'} suffix={networks.mesh ? 'offline mesh nodes' : 'waiting for failover'} icon={<Radio size={17} />} accent="yellow" /><Stat label="MESSAGE PRIORITY" value="P0" suffix="life threatening" icon={<Siren size={17} />} accent="coral" /></section>

        <section className="phone-alert-strip"><div><b>Phone delivery</b><span>Install LastMile on your phone to receive a local emergency notification.</span></div><button className="phone-notify-btn" onClick={sendPhoneNotification}><Smartphone size={15} /> {notificationState === 'sent' ? 'Notification sent' : notificationState === 'blocked' ? 'Permission blocked' : 'Send test notification'}</button></section>

        <section className="workspace-grid">
          <div className="map-panel panel"><div className="panel-head"><div><span className="section-kicker">01 / GEOGRAPHIC TWIN</span><h2>Propagation map</h2></div><div className="map-legend"><span><i className="legend-dot danger" /> Impact path</span><span><i className="legend-dot relay" /> Relay active</span></div></div><div className="map-canvas"><div className="map-grid-lines" /><svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M 19 30 C 28 35, 34 42, 45 45 S 57 38, 66 27" className="route-path faint" /><path d="M 45 45 C 55 49, 64 57, 78 60" className="route-path" /><path d="M 45 45 C 53 40, 58 32, 66 27" className="route-path mesh-route" /></svg><div className="map-compass"><Crosshair size={15} /> N</div><div className="river river-one" /><div className="river river-two" />{zones.map((zone) => <div className={'zone-node ' + (zone.name === highestRiskGap.name ? 'selected' : '')} style={{ left: zone.x + '%', top: zone.y + '%' }} key={zone.name}><div className="zone-ring" style={{ borderColor: zone.color }}><div className="zone-core" style={{ backgroundColor: zone.color }} /></div><div className="zone-label"><b>{zone.name}</b><span>{zone.coverage}% reached</span></div></div>)}<div className="source-marker"><div className="source-icon"><CloudRain size={16} /></div><span>flood source</span></div><div className="map-scale">0 <span /> 10 km</div></div><div className="map-footer"><div className="map-status"><span className="status-dot" /> {routeText}</div><button className="outline-btn"><LocateFixed size={15} /> Locate risk gap</button></div></div>

          <aside className="side-column"><div className="panel alert-card"><div className="alert-top"><span className="section-kicker">ACTIVE ALERT / P0</span><span className="verified"><ShieldCheck size={14} /> VERIFIED</span></div><div className="alert-title"><div className="alert-symbol"><AlertTriangle size={21} /></div><div><h2>Flash flood warning</h2><p>Upstream rainfall exceeds threshold</p></div></div><div className="alert-meta"><span><b>18:42</b> issued</span><span><b>6.4 km</b> flood front</span></div><button className="primary-btn" onClick={started ? simulateFailure : launchAlert}>{started ? 'Simulate network failure' : 'Launch verified alert'} <Send size={16} /></button></div><div className="panel coverage-card"><div className="panel-head compact"><div><span className="section-kicker">02 / COVERAGE GAPS</span><h2>Who needs it next?</h2></div><span className="gap-count">{zones.filter((zone) => zone.coverage < 50).length} gaps</span></div>{zones.map((zone) => <div className="village-row" key={zone.name}><div className="village-icon" style={{ color: zone.color }}><CircleDot size={15} /></div><div className="village-info"><div><b>{zone.name}</b><span className={'risk ' + zone.risk.toLowerCase()}>{zone.risk}</span></div><div className="coverage-bar"><span style={{ width: zone.coverage + '%', backgroundColor: zone.color }} /></div></div><div className="village-percent"><b>{zone.coverage}%</b><small>{zone.eta}m</small></div></div>)}<div className="gap-callout"><AlertTriangle size={16} /><div><b>Priority gap detected</b><span>{highestRiskGap.name} / {highestRiskGap.coverage}% coverage / {highestRiskGap.eta} min ETA</span></div></div></div></aside>
        </section>

        <section className="bottom-grid"><div className="panel network-panel"><div className="panel-head compact"><div><span className="section-kicker">03 / NETWORK TWIN</span><h2>Communication health</h2></div><span className="health-badge"><span className="status-dot" /> {Object.values(networks).filter(Boolean).length}/3 paths live</span></div><div className="network-rows"><NetworkRow label="Internet / cloud" icon={<Wifi size={17} />} active={networks.internet} onClick={() => toggleNetwork('internet')} /><NetworkRow label="Cellular towers" icon={<TowerControl size={17} />} active={networks.cellular} onClick={() => toggleNetwork('cellular')} /><NetworkRow label="Offline mesh" icon={<Radio size={17} />} active={networks.mesh} onClick={() => toggleNetwork('mesh')} /></div></div><div className="panel relay-panel"><div className="panel-head compact"><div><span className="section-kicker">04 / OPPORTUNISTIC ROUTING</span><h2>Best next-hop relays</h2></div><span className="sort-label">FORWARDING SCORE ↓</span></div><div className="relay-list"><Relay rank="01" device="Phone 17" location="Bhairavpur" score="92" battery="84" direction="south-east" /><Relay rank="02" device="Phone 23" location="Kalyanpur road" score="78" battery="61" direction="south" /><Relay rank="03" device="Phone 41" location="Devgarh" score="64" battery="38" direction="east" /></div><button className="mesh-advance" onClick={advanceMesh}><Radio size={16} /> Advance mesh propagation <span>STEP {String(tick + 1).padStart(2, '0')}</span></button></div></section>
      </main>
      <footer><span><span className="pulse-dot" /> Last sync 18:44:12 IST</span><span>CAP-compatible alert simulator <span className="footer-divider" /> v0.1 / field test</span></footer>
    </div>
  )
}

function Stat({ label, value, suffix, icon, accent }: { label: string; value: string; suffix: string; icon: React.ReactNode; accent: string }) { return <div className={'stat-card ' + accent}><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong>{value}</strong><small>{suffix}</small></div> }
function NetworkRow({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) { return <button className="network-row" onClick={onClick}><div className="network-icon">{icon}</div><div className="network-name"><b>{label}</b><span>{active ? 'Operational' : 'Unavailable'}</span></div><div className={'network-state ' + (active ? 'on' : '')}>{active ? <Signal size={16} /> : <WifiOff size={16} />}</div><div className={'toggle ' + (active ? 'enabled' : '')}><span /></div></button> }
function Relay({ rank, device, location, score, battery, direction }: { rank: string; device: string; location: string; score: string; battery: string; direction: string }) { return <div className="relay-row"><span className="relay-rank">{rank}</span><div className="phone-icon"><Smartphone size={16} /></div><div className="relay-name"><b>{device}</b><span>{location} / moving {direction}</span></div><div className="relay-score"><b>{score}</b><span>score</span></div><div className="battery"><BatteryMedium size={14} /> {battery}%</div></div> }

export default App
