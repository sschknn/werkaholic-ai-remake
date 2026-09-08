/** Sanitize KI-/User-Strings vor Anzeige. React escapet bereits, aber wir strippen zusätzlich Tags. */
export function sanitizeText(input: unknown, maxLen = 5000): string {
  if (typeof input !== 'string') return ''
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .slice(0, maxLen)
    .trim()
}

export function sanitizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((t) => sanitizeText(t, 60))
    .filter(Boolean)
    .slice(0, 20)
}
