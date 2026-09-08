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
