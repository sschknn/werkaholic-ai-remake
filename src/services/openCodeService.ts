// src/services/openCodeService.ts
export type AdOutput = {
  title: string;
  short_description: string;
  long_description: string;
  category: string;
  condition: string;
  price_text: string;
  price_value: number | null;
  tags: string[];
  confidence: number | null;
}

const OPEN_CODE_API_URL = "https://api.opencode.example/v1/generate"; // TODO: ersetzen
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

const PROMPT_FULL_JSON = (imageCaptions: string[], extraNotes = "") => `
Du bist ein Assistent, der aus Produktbildern ein komplettes Kleinanzeigen‑Inserat in deutscher Sprache erstellt.
Antworte ausschließlich mit einem sauberen JSON‑Objekt im folgenden Format:
{ "title", "short_description", "long_description", "category", "condition", "price_text", "price_value", "tags", "confidence" }.
Fülle alle Felder so gut wie möglich. Schreibe verkaufsförderndes, klares Deutsch.
Bild‑Beschreibungen:\n${imageCaptions.map((c,i)=>`Bild${i+1}: ${c}`).join("\n")}
${extraNotes ? `Zusatzinfo: ${extraNotes}` : ""}
Wichtig: Gib nur gültiges JSON ohne weitere Erklärungen zurück.
`;

async function fetchWithTimeout(url: string, opts: RequestInit, timeout = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

function tryParseJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch (e) {
    const match = text.match(/{[\s\S]*}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (_) { return null; }
    }
    return null;
  }
}

function validateAdOutput(obj: any): obj is AdOutput {
  if (!obj || typeof obj !== "object") return false;
  const okTitle = typeof obj.title === "string" && obj.title.length > 0;
  const okShort = typeof obj.short_description === "string";
  const okLong = typeof obj.long_description === "string";
  const okCategory = typeof obj.category === "string";
  const okCondition = typeof obj.condition === "string";
  const okPriceText = typeof obj.price_text === "string";
  const okTags = Array.isArray(obj.tags);
  return !!(okTitle && okShort && okLong && okCategory && okCondition && okPriceText && okTags);
}

export async function generateAdFromCaptions(
  imageCaptions: string[],
  apiKey: string,
  extraNotes = ""
): Promise<AdOutput> {
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Kein API‑Key gesetzt. Bitte den Free Trial API Key von Open Code eintragen.");
  }
  const prompt = PROMPT_FULL_JSON(imageCaptions, extraNotes);

  const body = {
    prompt,
    max_tokens: 800,
    temperature: 0.2,
    format: "text"
  };

  let lastError: any = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(OPEN_CODE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      }, DEFAULT_TIMEOUT_MS);

      if (!res.ok) {
        lastError = new Error(`API antwortete mit Status ${res.status}`);
        if (res.status >= 400 && res.status < 500) break;
        continue;
      }

      const text = await res.text();
      const parsed = tryParseJson(text);
      if (!parsed) {
        lastError = new Error("Konnte keine gültige JSON‑Antwort aus der KI extrahieren.");
        throw lastError;
      }

      if (!validateAdOutput(parsed)) {
        lastError = new Error("JSON ist nicht im erwarteten Format.");
        throw lastError;
      }

      return parsed as AdOutput;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error("Unbekannter Fehler beim KI‑Aufruf.");
}
