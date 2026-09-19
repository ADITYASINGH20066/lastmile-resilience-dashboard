import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Cloud,
  Radio,
  RefreshCw,
  Smartphone,
  TowerControl,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { getConnectivitySummary, type ConnectivitySummary } from './api'

type RiverCode = 'TEESTA' | 'DESANG'

type Props = {
  riverCode: RiverCode
  onRiverChange: (riverCode: RiverCode) => void
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatNumber(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—'
}

function availabilityLabel(value: boolean | null | undefined) {
  if (value === true) return 'Configured'
  if (value === false) return 'Not available'
  return 'Unknown'
}

function deliveryClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'delivered' || normalized === 'reached') return 'delivery-status delivered'
  if (normalized === 'failed') return 'delivery-status failed'
  if (normalized === 'pending' || normalized === 'pending_approval') return 'delivery-status pending'
  return 'delivery-status unknown'
}

function routeLabel(route: string | null | undefined) {
  if (!route) return 'No delivery recorded'
  return route.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function ServiceCard({
  title,
  detail,
  status,
  icon,
}: {
  title: string
  detail: string
  status: string
  icon: ReactNode
}) {
  const normalized = status.toLowerCase()
  const kind = normalized.includes('operational') || normalized.includes('configured') ? 'healthy' : normalized.includes('pending') ? 'pending' : 'neutral'
  return (
    <section className="panel connectivity-service-card">
      <div className="connectivity-service-icon">{icon}</div>
      <div className="connectivity-service-copy">
        <span className="section-kicker">CHANNEL</span>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      <span className={`connectivity-status ${kind}`}>{status}</span>
    </section>
  )
}

export default function ConnectivityPage({ riverCode, onRiverChange }: Props) {
  const [data, setData] = useState<ConnectivitySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedVillageId, setSelectedVillageId] = useState<string | null>(null)

  async function load() {
    setRefreshing(true)
    setError('')
    try {
      const next = await getConnectivitySummary(riverCode)
      setData(next)
      setSelectedVillageId((current) => current && next.villages.some((item) => item.village_id === current) ? current : next.villages[0]?.village_id ?? null)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load connectivity data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [riverCode])

  const selectedVillage = useMemo(() => {
    if (!selectedVillageId || !data) return null
    return data.villages.find((item) => item.village_id === selectedVillageId) ?? null
  }, [data, selectedVillageId])

  const deliveryCoverage = data?.summary.targeted_villages
    ? Math.round((data.summary.delivered_villages / data.summary.targeted_villages) * 100)
    : null

  if (loading && !data) {
    return <div className="control-subpage"><div className="panel connectivity-loading"><span className="pulse-dot" /> Loading backend connectivity records…</div></div>
  }

  return (
    <div className="control-subpage connectivity-page">
      <section className="subpage-heading connectivity-heading">
        <div>
          <span className="section-kicker">CONTROL ROOM / CONNECTIVITY</span>
          <h1>Last-mile communication</h1>
          <p>See which communication capabilities are configured for each village and what the backend has actually recorded for warning delivery.</p>
        </div>
        <div className="connectivity-page-actions">
          <label className="connectivity-select-label" htmlFor="connectivity-river">ACTIVE BASIN</label>
          <select id="connectivity-river" value={riverCode} onChange={(event) => onRiverChange(event.target.value as RiverCode)}>
            <option value="DESANG">Desang / Nanglamoraghat</option>
            <option value="TEESTA">Teesta / Melli</option>
          </select>
          <button className="refresh" onClick={() => void load()} disabled={refreshing} title="Refresh connectivity data">
            <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
          </button>
        </div>
      </section>

      {error && <div className="panel error-banner"><AlertTriangle size={16} /> Backend error: {error}</div>}

      <section className="connectivity-services">
        <ServiceCard
          title="FastAPI / cloud"
          detail="This control-room page is receiving its operational records from the backend now."
          status="Operational"
          icon={<Cloud size={20} />}
        />
        <ServiceCard
          title="Internet / app"
          detail={`${data?.summary.internet_configured_villages ?? 0} village capabilities marked available in the database.`}
          status={data?.summary.internet_configured_villages ? 'Configured' : 'No capability data'}
          icon={<Wifi size={20} />}
        />
        <ServiceCard
          title="Cellular / SMS / call"
          detail={`${data?.summary.cellular_configured_villages ?? 0} village capabilities marked available in the database.`}
          status={data?.summary.cellular_configured_villages ? 'Configured' : 'No capability data'}
          icon={<TowerControl size={20} />}
        />
        <ServiceCard
          title="Offline phone relay"
          detail="Android Nearby Connections relay exists separately; live relay telemetry is not connected to FastAPI yet."
          status="Integration pending"
          icon={<Radio size={20} />}
        />
      </section>

      <section className="connectivity-summary-grid">
        <div className="panel connectivity-summary-card">
          <span className="section-kicker">DELIVERY OVERVIEW</span>
          <strong>{deliveryCoverage == null ? '—' : `${deliveryCoverage}%`}</strong>
          <p>Of targeted villages with a recorded delivered delivery.</p>
        </div>
        <div className="panel connectivity-summary-card">
          <span className="section-kicker">TARGETED</span>
          <strong>{data?.summary.targeted_villages ?? 0}</strong>
          <p>Villages targeted by current active warning records.</p>
        </div>
        <div className="panel connectivity-summary-card">
          <span className="section-kicker">DELIVERED</span>
          <strong>{data?.summary.delivered_villages ?? 0}</strong>
          <p>Villages with at least one delivered backend record.</p>
        </div>
        <div className="panel connectivity-summary-card">
          <span className="section-kicker">LAST ACTIVITY</span>
          <strong className="connectivity-time">{formatTime(data?.summary.last_delivery_at)}</strong>
          <p>Latest recorded delivery activity for this basin.</p>
        </div>
      </section>

      <section className="panel connectivity-route-panel">
        <div className="panel-head compact">
          <div>
            <span className="section-kicker">COMMUNICATION ROUTE MATRIX</span>
            <h2>Village by village</h2>
          </div>
          <span className="simulation-chip">BACKEND RECORDS</span>
        </div>
        <div className="connectivity-table-wrap">
          <div className="connectivity-table connectivity-table-head">
            <span>VILLAGE</span>
            <span>INTERNET</span>
            <span>CELLULAR</span>
            <span>ROUTE</span>
            <span>DELIVERY</span>
            <span>LAST ACTIVITY</span>
          </div>
          {data?.villages.length ? data.villages.map((village) => (
            <button
              key={village.village_id}
              className={`connectivity-table connectivity-table-row ${selectedVillageId === village.village_id ? 'selected' : ''}`}
              onClick={() => setSelectedVillageId(village.village_id)}
            >
              <span className="connectivity-village"><CircleDot size={14} /><b>{village.village_name}</b><small>{formatNumber(village.population)} people</small></span>
              <span className="capability"><span className={village.internet_available === true ? 'capability-dot yes' : 'capability-dot no'} />{availabilityLabel(village.internet_available)}</span>
              <span className="capability"><span className={village.cellular_available === true ? 'capability-dot yes' : 'capability-dot no'} />{availabilityLabel(village.cellular_available)}</span>
              <span>{routeLabel(village.selected_route)}</span>
              <span><em className={deliveryClass(village.delivery_status)}>{village.delivery_status.replaceAll('_', ' ').toUpperCase()}</em>{village.simulated ? <small className="simulated-line">Simulated backend dispatch</small> : null}</span>
              <span>{formatTime(village.last_delivery_at)}</span>
            </button>
          )) : <div className="empty-state">No village connectivity records are available for this basin.</div>}
        </div>
      </section>

      <section className="connectivity-detail-grid">
        <section className="panel connectivity-detail-card">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">SELECTED VILLAGE</span>
              <h2>{selectedVillage?.village_name ?? 'Select a village'}</h2>
            </div>
            {selectedVillage ? <span className={deliveryClass(selectedVillage.delivery_status)}>{selectedVillage.delivery_status.replaceAll('_', ' ').toUpperCase()}</span> : null}
          </div>
          {selectedVillage ? (
            <div className="selected-connectivity-content">
              <div className="selected-connectivity-metrics">
                <div><small>Population</small><b>{formatNumber(selectedVillage.population)}</b></div>
                <div><small>Preferred route</small><b>{routeLabel(selectedVillage.selected_route)}</b></div>
                <div><small>Delivery records</small><b>{selectedVillage.delivery_count}</b></div>
                <div><small>Last activity</small><b>{formatTime(selectedVillage.last_delivery_at)}</b></div>
              </div>
              <div className="selected-connectivity-note">
                {selectedVillage.simulated ? <><Smartphone size={16} /><span>The backend has a delivery record for this village, but it is explicitly marked simulated. It is not a live carrier/relay confirmation.</span></> : <><CheckCircle2 size={16} /><span>This village has a non-simulated backend delivery record.</span></>}
              </div>
            </div>
          ) : <div className="empty-state">Select a village from the matrix above.</div>}
        </section>

        <section className="panel connectivity-contract-card">
          <span className="section-kicker">SYSTEM BOUNDARY</span>
          <h2>What this page can prove</h2>
          <div className="connectivity-contract-list">
            <div><CheckCircle2 size={15} /><span>Village communication capabilities from Supabase</span></div>
            <div><CheckCircle2 size={15} /><span>Recorded alert targets and delivery states</span></div>
            <div><CheckCircle2 size={15} /><span>Whether a delivery record is simulated</span></div>
            <div><WifiOff size={15} /><span>It does not claim live carrier or Nearby relay health without telemetry</span></div>
          </div>
        </section>
      </section>

      <div className="control-note connectivity-note"><Radio size={15} /><span>Offline relay is intentionally shown as <b>integration pending</b>. The Android Nearby Connections app remains a separate last-mile component until live relay telemetry is connected.</span></div>
    </div>
  )
}
