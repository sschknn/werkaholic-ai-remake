/** Mittelwert aller Zahlen im String, z. B. "150€ - 200€" -> 175. */
export function parsePrice(priceStr: string): number {
  try {
    if (!priceStr) return 0;
    const numbers = priceStr.match(/(\d+[.,]?\d*)/g);
    if (!numbers) return 0;
    const parsed = numbers
      .map((n) => parseFloat(n.replace(',', '.')))
      .filter((n) => Number.isFinite(n));
    if (parsed.length === 0) return 0;
    return parsed.reduce((a, b) => a + b, 0) / parsed.length;
  } catch {
    return 0;
  }
}
