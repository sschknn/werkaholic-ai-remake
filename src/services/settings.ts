import { SETTINGS_KEY, type WerkaholicSettings } from '../types'

export function envApiKey(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    return env?.VITE_OPEN_CODE_API_KEY || ''
  } catch {
    return ''
  }
}

export function loadSettings(): WerkaholicSettings {
  const fallback = envApiKey()
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { apiKey: fallback }
    const parsed = JSON.parse(raw) as WerkaholicSettings
    if (!parsed.apiKey && fallback) return { ...parsed, apiKey: fallback }
    return { apiKey: parsed.apiKey || fallback, apiUrl: parsed.apiUrl, model: parsed.model }
  } catch {
    return { apiKey: fallback }
  }
}

export function saveSettings(s: WerkaholicSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}
