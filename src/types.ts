export const AD_CONDITIONS = ['Neu', 'Sehr gut', 'Gut', 'Akzeptabel'] as const
export type AdCondition = (typeof AD_CONDITIONS)[number]

export interface AdOutput {
  title: string
  short_description: string
  long_description: string
  category: string
  condition: AdCondition | string
  price_text: string
  price_value: number
  tags: string[]
  confidence: number
}

export interface HistoryItem {
  id: string
  createdAt: string
  images: string[]
  captions: string[]
  extraNotes?: string
  analysis: AdOutput
  placeholder?: boolean
}

export interface WerkaholicSettings {
  apiKey: string
  apiUrl?: string
  model?: string
}

export const SETTINGS_KEY = 'werkaholic_settings'

export const EXAMPLE_AD: AdOutput = {
  title: 'Bosch Handbohrgerät mit Koffer',
  short_description: 'Robustes Bosch Handbohrgerät, gebraucht, voll funktionsfähig.',
  long_description:
    'Verkauft wird ein gebrauchtes Bosch Handbohrgerät mit kleinem Koffer. Das Gerät zeigt Gebrauchsspuren, funktioniert aber einwandfrei.',
  category: 'Werkzeug',
  condition: 'Gut',
  price_text: '45 €',
  price_value: 45.0,
  tags: ['Bosch', 'Handbohrgerät', 'Werkzeug', 'gebraucht', 'Koffer'],
  confidence: 0.78,
}
