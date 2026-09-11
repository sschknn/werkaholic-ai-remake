import { SETTINGS_KEY, defaultAppSettings, type AppSettings, type ProviderId } from '../types';
import type { EbayConfig, EtsyConfig, HoodConfig, FacebookConfig } from '../types';

function readEnv(name: string): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[name] || '';
  } catch {
    return '';
  }
}

function emptyAppSettings(): AppSettings {
  return defaultAppSettings();
}

/** Leere Defaults für Marktplatz-Blöcke (nur ""-Werte + ENV-Namen, keine Secrets). */
function defaultEbayBlock(): EbayConfig {
  return {
    oAuthToken: '',
    marketplaceId: 'EBAY_DE',
    currency: 'EUR',
    categoryId: '',
    fulfillmentPolicyId: '',
    paymentPolicyId: '',
    returnPolicyId: '',
    merchantLocationKey: '',
    sandbox: false,
  };
}

function defaultEtsyBlock(): EtsyConfig {
  return {
    apiKey: '',
    accessToken: '',
    shopId: '',
    taxonomyId: '',
    shippingProfileId: '',
    whoMade: 'i_did',
    whenMade: 'made_to_order',
  };
}

function defaultHoodBlock(): HoodConfig {
  return { accountName: '', accountPass: '', apiUrl: '' };
}

function defaultFacebookBlock(): FacebookConfig {
  return { catalogId: '', accessToken: '', sellerId: '', apiVersion: 'v20.0' };
}

/** Tolerant Migration: alte Formate {apiKey}/{providers} -> neue AppSettings. */
export function migrateToAppSettings(raw: unknown): AppSettings {
  const base = emptyAppSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const o = raw as Record<string, unknown>;

  // Bereits neues Format?
  if (typeof o.opencode === 'object' && o.opencode !== null) {
    const oc = o.opencode as Record<string, unknown>;
    const or_ = (o.openrouter as Record<string, unknown> | undefined) ?? {};
    const oai = (o.openai as Record<string, unknown> | undefined) ?? {};
    const xai = (o.xai as Record<string, unknown> | undefined) ?? {};
    const gem = (o.gemini as Record<string, unknown> | undefined) ?? {};
    const validProviders: ProviderId[] = ['opencode', 'openrouter', 'openai', 'xai', 'gemini'];
    const active: ProviderId = validProviders.includes(o.activeProvider as ProviderId)
      ? (o.activeProvider as ProviderId)
      : 'opencode';
    const str = (r: Record<string, unknown>, k: string): string => (typeof r[k] === 'string' ? (r[k] as string) : '');
    return {
      activeProvider: active,
      opencode: {
        apiKey: str(oc, 'apiKey'),
        model: str(oc, 'model'),
        apiUrl: str(oc, 'apiUrl'),
      },
      openrouter: {
        apiKey: str(or_, 'apiKey'),
        model: str(or_, 'model'),
        apiUrl: typeof or_.apiUrl === 'string' ? or_.apiUrl : undefined,
      },
      openai: { apiKey: str(oai, 'apiKey'), model: str(oai, 'model') },
      xai: { apiKey: str(xai, 'apiKey'), model: str(xai, 'model') },
      gemini: { apiKey: str(gem, 'apiKey'), model: str(gem, 'model') },
      tradera: Array.isArray((o as { tradera?: unknown }).tradera)
        ? undefined
        : (o.tradera as AppSettings['tradera']),
      ebay: typeof o.ebay === 'object' && o.ebay !== null ? (o.ebay as AppSettings['ebay']) : undefined,
      etsy: typeof o.etsy === 'object' && o.etsy !== null ? (o.etsy as AppSettings['etsy']) : undefined,
      hood: typeof o.hood === 'object' && o.hood !== null ? (o.hood as AppSettings['hood']) : undefined,
      facebook:
        typeof o.facebook === 'object' && o.facebook !== null
          ? (o.facebook as AppSettings['facebook'])
          : undefined,
    };
  }

  // Legacy { apiKey, apiUrl, model } (WerkaholicSettings)
  if (typeof o.apiKey === 'string') {
    base.opencode.apiKey = o.apiKey;
    if (typeof o.apiUrl === 'string') base.opencode.apiUrl = o.apiUrl;
    if (typeof o.model === 'string') base.opencode.model = o.model;
    return base;
  }

  // Legacy { providers: [{ id, apiKey, model }] } (Orig blackbox-Format)
  if (Array.isArray(o.providers)) {
    for (const p of o.providers as Array<Record<string, unknown>>) {
      if (typeof p !== 'object' || p === null) continue;
      const key = typeof p.apiKey === 'string' ? p.apiKey : '';
      const model = typeof p.model === 'string' ? p.model : '';
      const id = String(p.id ?? '');
      if (id === 'openrouter') {
        base.openrouter.apiKey = key;
        base.openrouter.model = model;
      } else {
        // blackbox / opencode / default -> opencode mappen
        if (key) base.opencode.apiKey = key;
        if (model) base.opencode.model = model;
      }
    }
    return base;
  }

  return base;
}

function applyEnvFallbacks(s: AppSettings): AppSettings {
  const out: AppSettings = {
    activeProvider: s.activeProvider,
    opencode: { ...s.opencode },
    openrouter: { ...s.openrouter },
    openai: { ...(s.openai ?? { apiKey: '', model: '' }) },
    xai: { ...(s.xai ?? { apiKey: '', model: '' }) },
    gemini: { ...(s.gemini ?? { apiKey: '', model: '' }) },
    tradera: s.tradera,
    ebay: s.ebay,
    etsy: s.etsy,
    hood: s.hood,
    facebook: s.facebook,
  };
  if (!out.opencode.apiKey) {
    const v = readEnv('VITE_OPEN_CODE_API_KEY');
    if (v) out.opencode.apiKey = v;
  }
  if (!out.opencode.apiUrl) {
    const v = readEnv('VITE_OPEN_CODE_API_URL');
    if (v) out.opencode.apiUrl = v;
  }
  if (!out.openrouter.apiKey) {
    const v = readEnv('VITE_OPENROUTER_API_KEY');
    if (v) out.openrouter.apiKey = v;
  }
  if (!out.openrouter.model) {
    const v = readEnv('VITE_OPENROUTER_MODEL');
    if (v) out.openrouter.model = v;
  }
  if (!out.openai.apiKey) {
    const v = readEnv('VITE_OPENAI_API_KEY');
    if (v) out.openai.apiKey = v;
  }
  if (!out.openai.model) {
    const v = readEnv('VITE_OPENAI_MODEL');
    if (v) out.openai.model = v;
  }
  if (!out.xai.apiKey) {
    const v = readEnv('VITE_XAI_API_KEY');
    if (v) out.xai.apiKey = v;
  }
  if (!out.xai.model) {
    const v = readEnv('VITE_XAI_MODEL');
    if (v) out.xai.model = v;
  }
  if (!out.gemini.apiKey) {
    const v = readEnv('VITE_GEMINI_API_KEY');
    if (v) out.gemini.apiKey = v;
  }
  if (!out.gemini.model) {
    const v = readEnv('VITE_GEMINI_MODEL');
    if (v) out.gemini.model = v;
  }
  // Marktplatz-ENV-Fallbacks: Defaults bleiben "" (keine echten Werte im Repo),
  // ENV-Namen nur als optionale Build-/Runtime-Quelle.
  if (!out.ebay?.oAuthToken) {
    const v = readEnv('VITE_EBAY_TOKEN');
    if (v) out.ebay = { ...defaultEbayBlock(), ...out.ebay, oAuthToken: v };
  }
  if (!out.etsy?.apiKey) {
    const v = readEnv('VITE_ETSY_API_KEY');
    if (v) out.etsy = { ...defaultEtsyBlock(), ...out.etsy, apiKey: v };
  }
  if (!out.etsy?.accessToken) {
    const v = readEnv('VITE_ETSY_TOKEN');
    if (v) out.etsy = { ...defaultEtsyBlock(), ...out.etsy, accessToken: v };
  }
  if (!out.etsy?.shopId) {
    const v = readEnv('VITE_ETSY_SHOP_ID');
    if (v) out.etsy = { ...defaultEtsyBlock(), ...out.etsy, shopId: v };
  }
  if (!out.hood?.accountName) {
    const v = readEnv('VITE_HOOD_ACCOUNT');
    if (v) out.hood = { ...defaultHoodBlock(), ...out.hood, accountName: v };
  }
  if (!out.facebook?.catalogId) {
    const v = readEnv('VITE_FB_CATALOG_ID');
    if (v) out.facebook = { ...defaultFacebookBlock(), ...out.facebook, catalogId: v };
  }
  return out;
}

export function loadSettings(): AppSettings {
  try {
    if (typeof localStorage === 'undefined') return applyEnvFallbacks(emptyAppSettings());
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return applyEnvFallbacks(emptyAppSettings());
    const parsed: unknown = JSON.parse(raw);
    return applyEnvFallbacks(migrateToAppSettings(parsed));
  } catch {
    return applyEnvFallbacks(emptyAppSettings());
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** Legacy-Helper (alter openCodeService nutzt noch WerkaholicSettings direkt). */
export function envApiKey(): string {
  return readEnv('VITE_OPEN_CODE_API_KEY');
}

export function getActiveProvider(): ProviderId {
  return loadSettings().activeProvider;
}

export function getProviderKey(id: ProviderId): string {
  const s = loadSettings();
  return s[id]?.apiKey || '';
}

export function getProviderModel(id: ProviderId): string {
  const s = loadSettings();
  return s[id]?.model || '';
}

export function getApiUrl(): string {
  const s = loadSettings();
  if (s.activeProvider === 'opencode' && s.opencode.apiUrl) return s.opencode.apiUrl;
  return readEnv('VITE_OPEN_CODE_API_URL') || '';
}
