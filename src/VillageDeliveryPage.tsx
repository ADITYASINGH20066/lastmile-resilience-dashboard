import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Radio, RefreshCw, Route, ShieldAlert, Wifi, WifiOff } from 'lucide-react'
import { getVillageDeliverySummary, type VillageDeliveryRow, type VillageDeliverySummary } from './api'

type RiverCode = 'TEESTA' | 'DESANG'

function pretty(value: string | null | undefined) {
  if (!value) return '—'
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function number(value: number | null | undefined) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : '—'
}

function eta(value: number | null | undefined) {
  return typeof value === 'number' ? `${Math.round(value)} min` : '—'
}

function deliveryLabel(state: string) {
  if (state === 'delivered') return 'DELIVERED'
  if (state === 'awaiting_approval') return 'AWAITING APPROVAL'
  if (state === 'not_dispatched') return 'NOT DISPATCHED'
  if (state === 'failed') return 'FAILED'
  if (state === 'monitoring') return 'MONITORING'
  return pretty(state).toUpperCase()
}

function deliveryTone(state: string) {
  if (state === 'delivered') return 'positive'
  if (state === 'failed') return 'negative'
  if (state === 'awaiting_approval' || state === 'pending') return 'warning'
  return 'neutral'
}

function routeLabel(route: string[]) {
  if (route.includes('app_push')) return 'App / push'
  if (route.includes('sms') && route.includes('call')) return 'Cellular · SMS + call'
  if (route.includes('sms')) return 'Cellular · SMS'
  if (route.includes('call')) return 'Cellular · call'
  if (route.includes('offline_relay')) return 'Offline relay'
  return route.join(' · ') || 'No route'
}

function latestDelivery(row: VillageDeliveryRow) {
  return row.deliveries?.[0] ?? null
}

export function VillageDeliveryPage({
  riverCode,
  onRiverChange,
  onRefresh,
  refreshToken,
}: {
  riverCode: RiverCode
  onRiverChange: (river: RiverCode) => void
  onRefresh: () => void
  refreshToken: number
}) {
  const [data, setData] = useState<VillageDeliverySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedVillageId, setSelectedVillageId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSelectedVillageId(null)
    getVillageDeliverySummary(riverCode)
      .then((response) => {
        if (!cancelled) setData(response)
      })
      .catch((loadError) => {
        if (!cancelled) {
          setData(null)
          setError(loadError instanceof Error ? loadError.message : 'Unable to load village delivery data')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [riverCode, refreshToken])

  const selected = useMemo(
    () => data?.villages.find((row) => row.village.id === selectedVillageId) ?? null,
    [data, selectedVillageId],
  )

  const totalPopulation = data?.villages.reduce((sum, row) => sum + (row.impact?.population_at_risk ?? row.village.population ?? 0), 0) ?? 0

  return (
    <div className="delivery-page">
      <section className="delivery-page-head">
        <div>
          <span className="section-kicker">CONTROL ROOM / 03 — VILLAGE DELIVERY</span>
          <h1>Who receives what</h1>
          <p>Trace the warning from the approved alert to each affected village. Delivery status is read from backend target and delivery records; this page does not simulate dispatch.</p>
        </div>
        <div className="delivery-head-actions">
          <label>
            <span>ACTIVE BASIN</span>
            <select value={riverCode} onChange={(event) => onRiverChange(event.target.value as RiverCode)}>
              <option value="DESANG">Desang / Nanglamoraghat</option>
              <option value="TEESTA">Teesta / Melli</option>
            </select>
          </label>
          <button onClick={onRefresh} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh</button>
        </div>
      </section>

      {error && <div className="delivery-error"><AlertTriangle size={16} /> {error}</div>}

      <section className="delivery-kpis">
        <div className="panel"><span>VILLAGES IN BASIN</span><strong>{data?.summary.villages ?? 0}</strong><small>Configured downstream villages</small></div>
        <div className="panel"><span>TARGETED</span><strong>{data?.summary.targeted ?? 0}</strong><small>Alert targets created</small></div>
        <div className="panel"><span>DELIVERED</span><strong>{data?.summary.delivered ?? 0}</strong><small>Delivery records marked delivered</small></div>
        <div className="panel"><span>POPULATION CONTEXT</span><strong>{number(totalPopulation)}</strong><small>Population represented in this view</small></div>
      </section>

      <section className="delivery-alert panel">
        <div className="delivery-alert-icon"><ShieldAlert size={18} /></div>
        <div className="delivery-alert-main">
          <span className="section-kicker">CURRENT WARNING PACKAGE</span>
          <h2>{data?.alert?.title ?? 'No active alert for this basin'}</h2>
          <p>{data?.alert?.instruction ?? 'Villages remain in monitoring state until an alert is approved and targeted.'}</p>
        </div>
        <div className={'delivery-alert-status ' + (data?.alert?.status === 'active' ? 'positive' : 'warning')}>
          {pretty(data?.alert?.status ?? 'monitoring')}
        </div>
      </section>

      <section className="panel delivery-table-panel">
        <div className="delivery-panel-head">
          <div><span className="section-kicker">VILLAGE TARGET MATRIX</span><h2>Every village, one operational row</h2></div>
          <span className="delivery-source-note">Targets + deliveries from Supabase</span>
        </div>
        {loading ? <div className="delivery-empty"><RefreshCw size={16} className="spin" /> Loading delivery state…</div> : data?.villages.length ? (
          <div className="delivery-table">
            <div className="delivery-table-head"><span>VILLAGE</span><span>IMPACT</span><span>WARNING</span><span>ROUTE</span><span>DELIVERY</span></div>
            {data.villages.map((row) => {
              const selectedRow = row.village.id === selectedVillageId
              const d = latestDelivery(row)
              return (
                <button key={row.village.id} className={'delivery-row ' + (selectedRow ? 'selected' : '')} onClick={() => setSelectedVillageId(selectedRow ? null : row.village.id)}>
                  <span><b>{row.village.village_name}</b><small>{row.village.village_code} · {number(row.village.population)} people</small></span>
                  <span><b>{row.impact ? `${Math.round(row.impact.risk_score)} · ${pretty(row.impact.risk_level)}` : 'Not assessed'}</b><small>ETA {eta(row.impact?.time_to_impact_minutes)}</small></span>
                  <span><b>{data.alert?.priority ?? '—'}</b><small>{data.alert ? 'Current alert' : 'No active warning'}</small></span>
                  <span><b>{routeLabel(row.route)}</b><small>{row.is_simulated_delivery ? 'Simulation record' : row.deliveries.length ? `${row.deliveries.length} delivery record(s)` : row.target ? 'Target exists' : 'Preferred route only'}</small></span>
                  <span><strong className={'delivery-state ' + deliveryTone(row.delivery_state)}>{deliveryLabel(row.delivery_state)}</strong><small>{d?.delivered_at ? `Delivered ${new Date(d.delivered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'No delivery timestamp'}</small></span>
                </button>
              )
            })}
          </div>
        ) : <div className="delivery-empty">No villages are configured for this basin.</div>}
      </section>

      {selected && (
        <section className="delivery-detail-grid">
          <section className="panel delivery-detail-card">
            <div className="delivery-detail-head"><div><span className="section-kicker">SELECTED VILLAGE</span><h2>{selected.village.village_name}</h2></div><span className={'delivery-state ' + deliveryTone(selected.delivery_state)}>{deliveryLabel(selected.delivery_state)}</span></div>
            <div className="delivery-detail-stats">
              <div><small>Risk</small><b>{selected.impact ? `${Math.round(selected.impact.risk_score)} / ${pretty(selected.impact.risk_level)}` : 'Not assessed'}</b></div>
              <div><small>Time to impact</small><b>{eta(selected.impact?.time_to_impact_minutes)}</b></div>
              <div><small>Population</small><b>{number(selected.impact?.population_at_risk ?? selected.village.population)}</b></div>
              <div><small>Downstream order</small><b>{selected.impact?.downstream_order ?? '—'}</b></div>
            </div>
            <div className="delivery-route-box"><Route size={16} /><div><b>Current communication route</b><span>{routeLabel(selected.route)}</span></div></div>
          </section>

          <section className="panel delivery-detail-card">
            <div className="delivery-detail-head"><div><span className="section-kicker">DELIVERY RECORDS</span><h2>What actually happened</h2></div><span className="delivery-record-count">{selected.deliveries.length} record(s)</span></div>
            {selected.deliveries.length ? selected.deliveries.map((delivery) => (
              <div className="delivery-record" key={delivery.id}>
                <div className="delivery-record-icon">{delivery.delivery_status === 'delivered' ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}</div>
                <div><b>{pretty(delivery.channel)}</b><small>{pretty(delivery.delivery_status)} · attempt {delivery.attempt_number ?? 1}</small></div>
                <div><b>{delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</b><small>{delivery.is_simulated ? 'Simulated backend record' : 'Provider record'}</small></div>
              </div>
            )) : <div className="delivery-empty compact">{data?.alert?.status === 'pending_approval' ? 'No delivery exists because the alert is awaiting authorized approval.' : 'No delivery record exists for this village yet.'}</div>}
          </section>
        </section>
      )}

      <section className="delivery-footnote panel">
        <Radio size={15} />
        <span><b>Backend boundary:</b> approval creates/updates targets and dispatch records. This page only reads those records. Any current simulated delivery is explicitly marked as such.</span>
        <span><Wifi size={13} /> Internet</span><span><WifiOff size={13} /> Cellular/offline fallback</span>
      </section>
    </div>
  )
}
