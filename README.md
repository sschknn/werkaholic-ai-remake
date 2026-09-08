# Werkaholic AI Remake

Mobile-first PWA (React + Vite + TypeScript, optional Capacitor). Scanner-Kasse: Gegenstände fotografieren → KI erzeugt Kleinanzeigen-Inserate (Titel, Beschreibung, Kategorie, Zustand, Preis, Tags) → editieren, lokal speichern (IndexedDB), exportieren (Copy/PDF/ZIP).

## Quickstart

```bash
npm install
cp .env.example .env.local  # echte URL eintragen
npm run dev                 # http://localhost:5173
npm run build
npm test                    # vitest run
```

## Open Code API — How to set up locally

1. Open Code Konto erstellen, Free Trial aktivieren, API-Key kopieren.
2. Zwei Wege für den Key (nur lokal, nie committen):
   - **App-Settings (empfohlen):** App → Settings → API-Key einfügen → Speichern (localStorage `werkaholic_settings`).
   - **Env:** `.env.local` mit `VITE_OPEN_CODE_API_URL=https://<echte-url>` anlegen.
3. `OPEN_CODE_API_URL` Beispiel: siehe `.env.example` (Platzhalter `https://api.opencode.example/v1/ad-generation`).
4. Request: `POST $URL` mit `Authorization: Bearer <apiKey>`, Body `{ prompt, messages }`. Antwort: reines `AdOutput`-JSON oder OpenAI-ähnlich `{ choices[0].message.content }` mit JSON drin.
5. Sicherheit: Bilder bleiben lokal (Data-URLs in IndexedDB). Kein automatischer Bild-Upload. Alle KI-Strings werden vor Anzeige sanitized (`src/utils/sanitize.ts`).

## How-to-test

- **Test A (Tool):** Scan → 1 Foto + Caption „Gebrauchtes Bosch Handbohrgerät, Kratzer, inkl. Koffer“ → Inserat erstellen → Felder editierbar → Save → Eintrag in Verlauf.
- **Test B (3 Bilder):** 3 Bilder hochladen → Save → Verlauf zeigt 3 Bilder → Kopieren enthält nur Text, keine Bild-URLs.
- **Test C (kein Key):** Settings-Key leeren → Inserat erstellen → Hinweis „Kein API-Key gesetzt“.
- **Test D (Offline):** Netzwerk blocken / falsche URL → Fehler + „Als Platzhalter speichern“ → Platzhalter im Verlauf.
- Unit: `npm test` prüft JSON-Extraktion (Codefence/Text), Schema-Validierung, Beispiel Ein-/Ausgabe aus Spec.

## Projektstruktur

- `src/services/openCodeService.ts` — `generateAdFromCaptions`, Timeout 30s, 2 Retries exp. Backoff
- `src/services/storageService.ts` — IndexedDB (`getHistory`, `saveHistoryItem`, `deleteHistoryItem`)
- `src/services/settings.ts`, `src/services/prompts.ts`, `src/services/exportService.ts`
- `src/components/Scanner.tsx`, `ResultView.tsx`, `SettingsView.tsx`, `HistoryView.tsx`
- `src/utils/sanitize.ts`, `src/types.ts`

## Env-Variablen

| Var | Zweck |
|---|---|
| `VITE_OPEN_CODE_API_URL` / `OPEN_CODE_API_URL` | Open Code Endpoint (Platzhalter möglich) |

## Marktplätze

Generisches Publish-System unter `src/services/marketplaces/` (Dispatch via `publishToMarketplace` in `registry.ts`).

| Marktplatz | Status | Auth | Schritte |
|---|---|---|---|
| Tradera | live | App-Key + Token-Login | `publishListing(cfg, ad, images, opts)` (Referenz-Adapter: items → images → commit) |
| eBay | live | OAuth2 User-Token, Scope `sell.inventory` | PUT `inventory_item/{sku}` → POST `offer` (Header `Content-Language: de-DE`, `EBAY_DE`, EUR) → POST `offer/{id}/publish`; Sandbox per Flag (`api.sandbox.ebay.com`); DataURL-Bilder → Warnung, Item ohne Bilder |
| Etsy | live | `x-api-key` + Bearer, Scope `listings_w` | POST `shops/{shop_id}/listings` (draft, urlencoded) → POST `listings/{id}/images` (multipart, rank) → PATCH `listings/{id}` (`state: active`); Tags aus Keywords (max 13) |
| Hood.de | live | Platin-Shop (AccountName + Schnittstellen-Passwort), konfigurierbare `apiUrl` | POST JSON `{auth, item}` an `apiUrl`; ohne `apiUrl` → CSV-Fallback (`buildHoodCsv`/`downloadHoodCsv`: `Titel;Beschreibung;Preis;Kategorie`) |
| Facebook Marketplace | partner | Nur zugelassene Partner (Graph API Catalog: Catalog-ID + Token) | POST `/{catalog_id}/items_batch` (CREATE) → GET `check_batch_request_status` (Poll max 3x); nur http(s)-`image_link`, DataURLs → `config`-Fehler |
| Kleinanzeigen | unsupported | Keine Public Listing-API | Fallback `clipboard-deeplink` (Clipboard + Deep-Link, siehe `exportService`) |
| Vinted | unsupported | Keine Public API (nur Pro-Allowlist) | Fallback `manual-csv` (manuell anlegen) |
| Ricardo | unsupported | Öffentliche API am 01.09.2026 abgeschaltet | Fallback `manual-csv` (manuell anlegen) |
| Willhaben | unsupported | Keine Public Listing-API | Fallback `manual-csv` (manuell anlegen) |

## Offene Fragen

- Reale `OPEN_CODE_API_URL` + erwartet Auth-Scope für Free Trial Key?
- Unterstützt Provider Multipart-Bild-Upload? Falls ja, nur mit expliziter UI-Zustimmung.
- Ziel-Modellname für `small_model`/Default?
