import { useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  RefreshCw,
  ShieldCheck,
  UserRound,
  Users,
  Wifi,
  XCircle,
} from 'lucide-react'
import { getAdminSummary, type AdminSummary } from './api'

function formatTime(value: string | null | undefined) {
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

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={'admin-status ' + (ok ? 'ok' : 'warn')}>
      {ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      {label}
    </span>
  )
}

export default function AdminPage() {
  const [data, setData] = useState<AdminSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setData(await getAdminSummary())
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load admin summary')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !data) {
    return <div className="empty-state"><span className="pulse-dot" /> Loading system administration data…</div>
  }

  if (error && !data) {
    return (
      <section className="panel admin-error-panel">
        <XCircle size={18} />
        <div>
          <b>System administration data unavailable</b>
          <p>{error}</p>
        </div>
        <button className="outline-btn" onClick={() => void load()}><RefreshCw size={15} /> Retry</button>
      </section>
    )
  }

  if (!data) return null

  const allHealthy = data.service_checks.every((item) => item.status === 'ok')

  return (
    <div className="admin-page">
      <section className="admin-overview-grid">
        <section className="panel admin-hero-card">
          <div className="admin-hero-icon"><ShieldCheck size={22} /></div>
          <div>
            <span className="section-kicker">SYSTEM ADMIN / PLATFORM STATE</span>
            <h2>{allHealthy ? 'Platform operational' : 'Platform requires attention'}</h2>
            <p>Administrative read-only view of service health, data inventory, authorization readiness and freshness.</p>
          </div>
          <button className="icon-btn admin-refresh" onClick={() => void load()} aria-label="Refresh admin data" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </section>

        <section className="panel admin-stat-card">
          <span className="section-kicker">ACTIVE ALERTS</span>
          <strong>{formatNumber(data.metrics.active_alerts)}</strong>
          <small>Across both monitored basins</small>
        </section>
        <section className="panel admin-stat-card">
          <span className="section-kicker">COMMUNITY REPORTS</span>
          <strong>{formatNumber(data.metrics.community_reports)}</strong>
          <small>Stored in canonical community_reports</small>
        </section>
        <section className="panel admin-stat-card">
          <span className="section-kicker">USER PROFILES</span>
          <strong>{formatNumber(data.metrics.user_profiles)}</strong>
          <small>Auth directory readiness</small>
        </section>
      </section>

      {error && <div className="admin-inline-warning"><XCircle size={15} /> {error}</div>}

      <div className="admin-main-grid">
        <section className="panel admin-section-card">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">01 / SERVICE HEALTH</span>
              <h2>Backend and data services</h2>
            </div>
          </div>
          <div className="admin-service-grid">
            {data.service_checks.map((item) => (
              <div className="admin-service-row" key={item.key}>
                <span className="admin-service-icon">{item.status === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}</span>
                <div><b>{item.label}</b><small>{item.detail}</small></div>
                <Status ok={item.status === 'ok'} label={item.status === 'ok' ? 'OK' : 'ATTENTION'} />
              </div>
            ))}
          </div>
        </section>

        <section className="panel admin-section-card">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">02 / DATA INVENTORY</span>
              <h2>Persisted prototype data</h2>
            </div>
          </div>
          <div className="admin-metric-list">
            <div><Database size={15} /><span>Hydro stations</span><b>{formatNumber(data.metrics.hydro_stations)}</b></div>
            <div><Activity size={15} /><span>Hydro readings</span><b>{formatNumber(data.metrics.hydro_readings)}</b></div>
            <div><Gauge size={15} /><span>Sensor readings</span><b>{formatNumber(data.metrics.sensor_readings)}</b></div>
            <div><FileText size={15} /><span>Rule evaluations</span><b>{formatNumber(data.metrics.rule_evaluations)}</b></div>
            <div><Activity size={15} /><span>Events</span><b>{formatNumber(data.metrics.events)}</b></div>
            <div><Wifi size={15} /><span>Delivery records</span><b>{formatNumber(data.metrics.alert_deliveries)}</b></div>
          </div>
        </section>

        <section className="panel admin-section-card admin-wide">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">03 / BASIN INVENTORY</span>
              <h2>Teesta and Desang data state</h2>
            </div>
          </div>
          <div className="admin-basin-table">
            <div className="admin-basin-head"><span>BASIN</span><span>STATION</span><span>LATEST LEVEL</span><span>LAST OBSERVED</span><span>VILLAGES</span><span>ACTIVE ALERTS</span></div>
            {data.basins.map((basin) => (
              <div className="admin-basin-row" key={basin.code}>
                <div><b>{basin.name}</b><small>{basin.code}</small></div>
                <div><b>{basin.station_name ?? '—'}</b><small>{basin.station_code ?? 'No station'}</small></div>
                <div><b>{basin.latest_water_level_m != null ? `${basin.latest_water_level_m.toFixed(2)} m` : '—'}</b><small>{basin.latest_risk_level ? basin.latest_risk_level.toUpperCase() : 'No evaluation'}</small></div>
                <div>{formatTime(basin.latest_observed_at)}</div>
                <div>{formatNumber(basin.village_count)}</div>
                <div>{formatNumber(basin.active_alerts)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel admin-section-card">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">04 / AUTHORIZATION READINESS</span>
              <h2>Role directory</h2>
            </div>
            <span className="simulation-chip">AUTH PENDING</span>
          </div>
          <div className="admin-role-counts">
            {data.role_counts.map((item) => (
              <div key={item.role}><span>{item.label}</span><b>{formatNumber(item.count)}</b></div>
            ))}
          </div>
          <div className="auth-boundary"><UserRound size={15} /><span>Current demo routing is UI-selected. Later, Supabase Auth + user_profiles will become the authoritative source of role and village scope.</span></div>
        </section>

        <section className="panel admin-section-card">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">05 / DATA FRESHNESS</span>
              <h2>Latest activity</h2>
            </div>
          </div>
          <div className="admin-freshness-list">
            {data.freshness.map((item) => (
              <div key={item.label}><span>{item.label}</span><b>{formatTime(item.timestamp)}</b></div>
            ))}
          </div>
        </section>

        <section className="panel admin-section-card admin-wide">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">06 / FUTURE INTEGRATIONS</span>
              <h2>Held outside the active prototype path</h2>
            </div>
          </div>
          <div className="admin-future-grid">
            <div><b>SACHET ingestion</b><span>Idle / future scope</span></div>
            <div><b>Sentinel integration</b><span>Idle / future scope</span></div>
            <div><b>Offline Android relay telemetry</b><span>Integration pending</span></div>
            <div><b>Real authentication</b><span>Next security integration</span></div>
          </div>
        </section>

        <section className="panel admin-section-card admin-wide">
          <div className="panel-head compact">
            <div>
              <span className="section-kicker">07 / ADMIN BOUNDARY</span>
              <h2>What this workspace can change</h2>
            </div>
          </div>
          <div className="admin-boundary-grid">
            <div><Users size={16} /><b>Read platform state</b><span>Health, counts, freshness and authorization readiness.</span></div>
            <div><ShieldCheck size={16} /><b>No alert approval here</b><span>Public warning approval remains with authorized operational roles.</span></div>
            <div><Database size={16} /><b>No raw-data editing</b><span>Source records remain controlled by their ingestion/reporting paths.</span></div>
          </div>
        </section>
      </div>
    </div>
  )
}
