const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000/api'

type ApiEnvelope<T> = T

export type River = {
  id: string
  basin_code: string
  basin_name: string
  river_system?: string | null
}

export type Station = {
  id: string
  station_code: string
  station_name: string
  river_name?: string | null
  district?: string | null
  state?: string | null
  latitude?: number | null
  longitude?: number | null
  warning_level_m?: number | null
  danger_level_m?: number | null
  highest_flood_level_m?: number | null
}

export type HydroReading = {
  id: string
  station_id: string
  observed_at: string
  water_level_m?: number | null
  water_level_rate_m_hr?: number | null
  data_mode?: string | null
}

export type Village = {
  id: string
  village_code: string
  village_name: string
  district?: string | null
  state?: string | null
  latitude?: number | null
  longitude?: number | null
  population?: number | null
  vulnerability_score?: number | null
  internet_available?: boolean | null
  cellular_available?: boolean | null
}

export type RuleEvaluation = {
  id: string
  hydro_reading_id?: string | null
  event_id?: string | null
  total_score: number
  risk_level: string
  alert_recommended: boolean
  alert_priority?: string | null
  reasons?: string[] | null
  evaluated_at: string
}

export type Alert = {
  id: string
  alert_code?: string | null
  title: string
  description?: string | null
  instruction?: string | null
  priority?: string | null
  urgency?: string | null
  severity?: string | null
  certainty?: string | null
  status: string
  created_at: string
  event_id?: string | null
}

export type ImpactAssessment = {
  event_id?: string | null
  village_id: string
  risk_score: number
  risk_level: string
  time_to_impact_minutes: number
  hazard_path_distance_km?: number | null
  downstream_order?: number | null
  population_at_risk?: number | null
  calculation_method?: string | null
  model_version?: string | null
}

export type DashboardSummary = {
  stations: Array<{
    station: Station
    latest_reading: HydroReading | null
  }>
  recent_evaluations: RuleEvaluation[]
  active_alerts: Alert[]
}

export type VillagesResponse = {
  river: River
  items: Village[]
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(body || `API request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export function getDashboardSummary() {
  return apiRequest<DashboardSummary>('/dashboard/summary')
}

export function getVillages(riverCode: string) {
  return apiRequest<VillagesResponse>(`/rivers/${encodeURIComponent(riverCode)}/villages`)
}

export function getStations(riverCode: string) {
  return apiRequest<{ river: River; items: Station[] }>(`/rivers/${encodeURIComponent(riverCode)}/stations`)
}

export function getHydroReadings(stationCode: string, limit = 50) {
  return apiRequest<{ station: Station; items: HydroReading[] }>(
    `/hydro/readings?station_code=${encodeURIComponent(stationCode)}&limit=${limit}`,
  )
}

export function getActiveAlerts() {
  return apiRequest<{ items: Alert[] }>('/alerts/active')
}

export function getAlert(alertId: string) {
  return apiRequest<{ alert: Alert; targets: unknown[]; deliveries: unknown[] }>(`/alerts/${alertId}`)
}

export function getAlertImpact(alertId: string) {
  return apiRequest<{ event_id: string | null; items: ImpactAssessment[] }>(`/alerts/${alertId}/impact`)
}

export function startReplay(riverCode: string, payload: { station_code?: string; limit?: number; delay_seconds?: number }) {
  return apiRequest<unknown>(`/demo/replay/${encodeURIComponent(riverCode)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
