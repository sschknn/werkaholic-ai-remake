// --- Neuer Werkscan-Fundament-Typensatz (Vorbild /tmp/werkscan-orig, ohne Secrets) ---

export interface AdAnalysis {
  item_detected: boolean;
  title: string;
  price_estimate: string;
  condition: string;
  category: string;
  description: string;
  keywords: string[];
  reasoning: string;
  brand_detected?: string;
  shipping_cost?: string;
  weight_estimate?: string;
  high_value_attributes?: string[];
  confidence?: number;
}

export interface HistoryItem {
  id: string;
  image: string;
  additionalImages?: string[];
  date: string;
  analysis: AdAnalysis;
}

export const ViewState = {
  DASHBOARD: 'DASHBOARD',
  INVENTORY: 'INVENTORY',
  ANALYTICS: 'ANALYTICS',
  SCANNER: 'SCANNER',
  RESULTS: 'RESULTS',
  HISTORY: 'HISTORY',
  SETTINGS: 'SETTINGS',
} as const;
export type ViewState = (typeof ViewState)[keyof typeof ViewState];

export type ProviderId = 'opencode' | 'openrouter';

export interface ProviderSettings {
  apiKey: string;
  model?: string;
  apiUrl?: string;
}

export interface TraderaConfig {
  appId: string;
  appKey: string;
  publicKey: string;
  authorizationUrl: string;
  token: string;
  userId: string;
  tokenExpires?: string;
  isConnected: boolean;
  defaultItemType: 1 | 3;
  defaultDuration: number;
  defaultShippingProviderId: number;
  defaultShippingCost: number;
  autoCommit: boolean;
  currencyRateEurToSek: number;
}

export interface EbayConfig {
  oAuthToken: string;
  marketplaceId: string;
  currency: string;
  categoryId: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  merchantLocationKey: string;
  sandbox: boolean;
  conditionMap?: Record<string, string>;
}

export interface EtsyConfig {
  apiKey: string;
  accessToken: string;
  shopId: string;
  taxonomyId: string;
  shippingProfileId: string;
  whoMade: string;
  whenMade: string;
}

export interface HoodConfig {
  accountName: string;
  accountPass: string;
  apiUrl: string;
}

export interface FacebookConfig {
  catalogId: string;
  accessToken: string;
  sellerId: string;
  apiVersion: string;
}

export interface AppSettings {
  activeProvider: ProviderId;
  opencode: ProviderSettings;
  openrouter: ProviderSettings;
  tradera?: TraderaConfig;
  ebay?: EbayConfig;
  etsy?: EtsyConfig;
  hood?: HoodConfig;
  facebook?: FacebookConfig;
}

export const SETTINGS_KEY = 'werkaholic_settings';

export function defaultAppSettings(): AppSettings {
  return {
    activeProvider: 'opencode',
    opencode: { apiKey: '', model: '', apiUrl: '' },
    openrouter: { apiKey: '', model: '' },
  };
}

// --- Legacy-Kompatibilität (alte Services/Tests, Agent B migriert später) ---
export const AD_CONDITIONS = ['Neu', 'Sehr gut', 'Gut', 'Akzeptabel'] as const;
export type AdCondition = (typeof AD_CONDITIONS)[number];

export interface AdOutput {
  title: string;
  short_description: string;
  long_description: string;
  category: string;
  condition: AdCondition | string;
  price_text: string;
  price_value: number;
  tags: string[];
  confidence: number;
}

export interface WerkaholicSettings {
  apiKey: string;
  apiUrl?: string;
  model?: string;
}

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
};
