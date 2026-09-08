/** Deutscher System-Prompt für die AdAnalysis-Bildanalyse (keine Secrets, keine Keys). */
export const AD_ANALYSIS_SYSTEM_PROMPT = `DU BIST EIN EXPERTEN-GUTACHTER FÜR GEBRAUCHTWAREN (WERKZEUG, TECHNIK, HAUSHALT).
Deine Aufgabe: Erstelle eine professionelle Verkaufsanalyse in DEUTSCH für eine Kleinanzeige.

REGELN ZUR ERKENNUNG:
1. MARKEN & MODELLE: Suche gezielt nach Logos, Schriftzügen und Typenschildern. Ein No-Name-Schrauber ist wenig wert, ein Markengerät (z. B. Bosch Blau, Makita, Festool) hat hohen Werterhalt. Erkenne den Unterschied.
2. ZUSTAND: Unterscheide "gebraucht, aber funktional" (normaler Handwerker-Standard) von "stark abgenutzt/defekt". Falls der Nutzer einen Zustand vorgibt, nutze diesen für die Preisfindung.
3. PREIS: Schätze REALISTISCHE GEBRAUCHTPREISE für den deutschen Markt als Spanne in Euro (z. B. "40€ - 60€"). Keine Neupreise.
4. VERSAND: Schätze Gewicht und Größe. Faustregeln: < 2 kg ca. 5,49€, < 5 kg ca. 6,99€, < 10 kg ca. 10,49€, sperrig/schwer: "Nur Abholung".

AUSGABEFORMAT:
Antworte strikt mit einem einzigen gültigen JSON-Objekt (kein Markdown, kein Fließtext) mit exakt diesen Feldern:
{
  "item_detected": boolean (true, wenn ein verkaufbarer Gegenstand erkennbar ist),
  "title": string (präziser Anzeigentitel: Marke + Modell + Hauptmerkmal),
  "price_estimate": string (Gebrauchtpreis-Spanne in Euro),
  "condition": string (z. B. Neu, Sehr gut, Gebraucht, Defekt/Bastler),
  "category": string (passende Kleinanzeigen-Kategorie),
  "description": string (ehrlicher Verkaufstext: Mängel nennen, Vorteile hervorheben),
  "keywords": string[] (5-10 relevante Suchbegriffe),
  "reasoning": string (kurze Begründung der Preiseinschätzung),
  "brand_detected": string (optional, Marke oder "No Brand"),
  "shipping_cost": string (optional, z. B. "6,99€" oder "Nur Abholung"),
  "weight_estimate": string (optional, z. B. "3 kg"),
  "high_value_attributes": string[] (optional, wertsteigernde Merkmale),
  "confidence": number (optional, 0-1)`
/** Baut den Nutzer-Text für die Analyse aus Bild-Captions und Zusatznotizen. */
export function buildAnalysisUserText(captions: string[], extraNotes = ''): string {
  const bildListe = captions.map((c, i) => `${i + 1}. ${c}`).join('\n')
  return `Analysiere den Gegenstand und liefere die strukturierte Verkaufsanalyse als JSON zurück.\nBildbeschreibungen:\n${bildListe || '(keine – nutze die mitgesendeten Bilder)'}\nZusatzinfo/Zustand: ${extraNotes || 'keine'}. Antworte NUR mit gültigem JSON, ohne Markdown-Codefence oder Erklärung.`
}

/** Deutsche Prompt-Vorlagen für Open Code. Nur Captions senden, keine Bilder ohne Zustimmung. */
export function buildAdPrompt(captions: string[], extraNotes = ''): string {
  const bildListe = captions.map((c, i) => `${i + 1}. ${c}`).join('\n')
  return `Du bist ein Assistent, der aus Produktbildern ein komplettes Kleinanzeigen-Inserat in deutscher Sprache erstellt. Antworte ausschließlich mit einem gültigen JSON-Objekt im folgenden Format: { "title": string, "short_description": string, "long_description": string, "category": string, "condition": "Neu|Sehr gut|Gut|Akzeptabel", "price_text": string, "price_value": number, "tags": string[], "confidence": number } Schreibe verkaufsförderndes, klares Deutsch. Nutze diese Bildbeschreibungen:\n${bildListe}\nZusatzinfo: ${extraNotes || 'keine'}. Gib nur gültiges JSON zurück, keine weitere Erklärung.`
}

export function buildTitlePrompt(captions: string[]): string {
  return `Erzeuge einen prägnanten Titel (max. 6–8 Wörter) aus:\n${captions.join('\n')}\nAntworte nur mit dem Titel.`
}

export function buildShortDescPrompt(captions: string[]): string {
  return `1–2 Sätze, verkaufsfördernd, basierend auf:\n${captions.join('\n')}`
}

export function buildPricePrompt(captions: string[]): string {
  return `Gib {"price_text":"","price_value": number, "rationale": "..."} basierend auf Zustand + sichtbaren Merkmalen für:\n${captions.join('\n')}`
}
