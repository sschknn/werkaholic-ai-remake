import { describe, expect, it, vi, beforeEach } from 'vitest';
import { publishEbayListing } from '../ebay';
import { publishEtsyListing } from '../etsy';
import { buildHoodCsv, publishHoodListing } from '../hood';
import { publishFacebookListing } from '../facebook';
import { MARKETPLACES, publishToMarketplace } from '../registry';
import type { AdAnalysis } from '../../../types';

const AD: AdAnalysis = {
  item_detected: true,
  title: 'Bosch Akkuschrauber 18V mit Koffer',
  price_estimate: '45 €',
  condition: 'Gebraucht - Gut',
  category: 'Werkzeug',
  description: 'Gebrauchter Bosch Akkuschrauber, voll funktionsfähig, inkl. Koffer.',
  keywords: ['Bosch', 'Akkuschrauber', 'Werkzeug'],
  reasoning: 'Test',
};

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
  stubLocalStorage();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ebay', () => {
  it('item → offer → publish mit Bearer-Auth und Sandbox-Base', async () => {
    const calls: Array<[string, RequestInit?]> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (String(url).includes('/inventory_item/')) return jsonResponse({});
      if (String(url).endsWith('/offer')) return jsonResponse({ offerId: 'off-1' });
      if (String(url).endsWith('/publish')) return jsonResponse({ listingId: '12345' });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await publishEbayListing(
      {
        oAuthToken: 'ebay-tok',
        marketplaceId: 'EBAY_DE',
        currency: 'EUR',
        categoryId: 'cat-1',
        fulfillmentPolicyId: 'ful-1',
        paymentPolicyId: 'pay-1',
        returnPolicyId: 'ret-1',
        merchantLocationKey: 'loc-1',
        sandbox: true,
      },
      AD,
      ['https://cdn.example/bild.jpg'],
      {},
    );

    expect(res.marketplace).toBe('ebay');
    expect(res.externalId).toBe('12345');
    expect(res.url).toBe('https://www.ebay.de/itm/12345');
    expect(res.isDraft).toBe(false);
    // Sandbox-Base + Bearer auf allen 3 Calls
    expect(calls).toHaveLength(3);
    for (const [url, init] of calls) {
      expect(url.startsWith('https://api.sandbox.ebay.com')).toBe(true);
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer ebay-tok');
    }
    expect(calls[0][0]).toContain('/sell/inventory/v1/inventory_item/');
    expect(calls[1][0]).toContain('/sell/inventory/v1/offer');
    expect(calls[2][0]).toContain('/publish');
  });

  it('warnt bei DataURL-Bildern per Progress, publiziert aber ohne Bilder', async () => {
    const progress: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/inventory_item/')) return jsonResponse({});
      if (String(url).endsWith('/offer')) return jsonResponse({ offerId: 'off-2' });
      return jsonResponse({ listingId: '999' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await publishEbayListing(
      {
        oAuthToken: 't',
        marketplaceId: 'EBAY_DE',
        currency: 'EUR',
        categoryId: 'c',
        fulfillmentPolicyId: 'f',
        paymentPolicyId: 'p',
        returnPolicyId: 'r',
        merchantLocationKey: '',
        sandbox: false,
      },
      AD,
      ['data:image/jpeg;base64,/9j/'],
      { onProgress: (msg) => void progress.push(msg) },
    );
    expect(res.url).toBe('https://www.ebay.de/itm/999');
    expect(progress.some((m) => m.includes('gehostete URLs'))).toBe(true);
  });
});

describe('etsy', () => {
  it('draft 201 → Bild-Upload → activate mit x-api-key', async () => {
    const seen: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
      const u = String(url);
      if (u.endsWith('/listings') && init?.method === 'POST') {
        return new Response(JSON.stringify({ listing_id: 777 }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (u.endsWith('/listings/777/images')) return jsonResponse({ listing_image_id: 1 });
      if (u.endsWith('/listings/777') && init?.method === 'PATCH') {
        return jsonResponse({ listing_id: 777, url: 'https://www.etsy.com/listing/777/test' });
      }
      // Bild-Bytes für fetch(dataURL)-Pfad
      return new Response('fakebytes', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await publishEtsyListing(
      {
        apiKey: 'etsy-key',
        accessToken: 'etsy-tok',
        shopId: 'shop-1',
        taxonomyId: 'tax-1',
        shippingProfileId: 'ship-1',
        whoMade: 'i_did',
        whenMade: 'made_to_order',
      },
      AD,
      ['data:image/jpeg;base64,ZmFrZQ=='],
      {},
    );

    expect(res.marketplace).toBe('etsy');
    expect(res.externalId).toBe('777');
    expect(res.url).toBe('https://www.etsy.com/listing/777/test');
    expect(res.isDraft).toBe(false);
    const draftCall = seen.find((s) => s.url.endsWith('/listings'));
    expect(draftCall?.headers['x-api-key']).toBe('etsy-key');
    expect(draftCall?.headers.Authorization).toBe('Bearer etsy-tok');
    expect(seen.some((s) => s.url.endsWith('/images'))).toBe(true);
  });
});

describe('hood', () => {
  it('ohne apiUrl → config-Fehler mit CSV-Hinweis', async () => {
    await expect(
      publishHoodListing({ accountName: 'a', accountPass: 'p', apiUrl: '' }, AD, [], {}),
    ).rejects.toMatchObject({ kind: 'config' });
    await expect(
      publishHoodListing({ accountName: 'a', accountPass: 'p', apiUrl: '' }, AD, [], {}),
    ).rejects.toThrowError(/CSV/);
  });

  it('buildHoodCsv enthält Titel und Preis', () => {
    const csv = buildHoodCsv(AD);
    expect(csv).toContain('Titel;Beschreibung;Preis;Kategorie');
    expect(csv).toContain('Bosch Akkuschrauber');
    expect(csv).toContain('45 €');
  });
});

describe('facebook', () => {
  it('ohne Catalog-ID → config-Fehler', async () => {
    await expect(
      publishFacebookListing({ catalogId: '', accessToken: '', sellerId: '', apiVersion: 'v20.0' }, AD, [
        'https://cdn.example/b.jpg',
      ]),
    ).rejects.toMatchObject({ kind: 'config' });
  });

  it('batch → status finished', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/items_batch')) return jsonResponse({ handle: 'h-1' });
      return jsonResponse({ status: 'finished' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await publishFacebookListing(
      { catalogId: 'cat-9', accessToken: 'fb-tok', sellerId: 'seller-1', apiVersion: 'v20.0' },
      AD,
      ['https://cdn.example/b.jpg'],
      {},
    );
    expect(res.marketplace).toBe('facebook');
    expect(res.externalId).toBe('h-1');
    const [batchUrl] = fetchMock.mock.calls[0] as [string];
    expect(batchUrl).toContain('/v20.0/cat-9/items_batch');
  });

  it('DataURL ohne gehostete URL → config-Fehler', async () => {
    await expect(
      publishFacebookListing(
        { catalogId: 'c', accessToken: 't', sellerId: '', apiVersion: 'v20.0' },
        AD,
        ['data:image/jpeg;base64,/9j/'],
      ),
    ).rejects.toThrowError(/Gehostete Bild-URL/);
  });
});

describe('registry', () => {
  it('unsupported wirft mit Fallback-Hinweis', async () => {
    await expect(publishToMarketplace('vinted', AD, [])).rejects.toMatchObject({
      name: 'ProviderError',
      kind: 'config',
    });
    await expect(publishToMarketplace('vinted', AD, [])).rejects.toThrowError(/manual-csv/);
    await expect(publishToMarketplace('kleinanzeigen', AD, [])).rejects.toThrowError(/clipboard-deeplink/);
    await expect(publishToMarketplace('ricardo', AD, [])).rejects.toThrowError(/manual-csv/);
    await expect(publishToMarketplace('willhaben', AD, [])).rejects.toThrowError(/manual-csv/);
  });

  it('MARKETPLACES enthält alle 9 mit Status', () => {
    expect(MARKETPLACES).toHaveLength(9);
    const byId = Object.fromEntries(MARKETPLACES.map((m) => [m.id, m.status]));
    expect(byId).toMatchObject({
      tradera: 'live',
      ebay: 'live',
      etsy: 'live',
      hood: 'live',
      facebook: 'partner',
      kleinanzeigen: 'unsupported',
      vinted: 'unsupported',
      ricardo: 'unsupported',
      willhaben: 'unsupported',
    });
    for (const m of MARKETPLACES) {
      expect(m.authHint.length).toBeGreaterThan(0);
      expect(m.fallbackHint.length).toBeGreaterThan(0);
    }
  });

  it('tradera-Adapter ist registriert (re-export, echte Signatur)', async () => {
    const { publishTraderaListing } = await import('../registry');
    expect(typeof publishTraderaListing).toBe('function');
    // ohne Token → auth-Fehler, d.h. Adapter lebt und prüft Config zuerst
    await expect(
      publishTraderaListing(
        {
          appId: '',
          appKey: '',
          publicKey: '',
          authorizationUrl: '',
          token: '',
          userId: '',
          isConnected: false,
          defaultItemType: 3,
          defaultDuration: 7,
          defaultShippingProviderId: 6,
          defaultShippingCost: 0,
          autoCommit: false,
          currencyRateEurToSek: 11.5,
        },
        AD,
        [],
        {},
      ),
    ).rejects.toMatchObject({ kind: 'auth' });
  });
});
