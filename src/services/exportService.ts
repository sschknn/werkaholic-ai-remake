import type { AdAnalysis } from '../types'

export function formatAdForClipboard(ad: AdAnalysis): string {
  const parts = [
    ad.title,
    '',
    ad.description,
    '',
    `Kategorie: ${ad.category}`,
    `Zustand: ${ad.condition}`,
    `Preis: ${ad.price_estimate}`,
    ad.brand_detected ? `Marke: ${ad.brand_detected}` : '',
    ad.shipping_cost ? `Versand: ${ad.shipping_cost}` : '',
    `Keywords: ${ad.keywords.join(', ')}`,
  ].filter((p, i) => p !== '' || i < 4)
  return parts.join('\n')
}

export async function copyAdToClipboard(ad: AdAnalysis): Promise<void> {
  const text = formatAdForClipboard(ad)
  await navigator.clipboard.writeText(text)
}

export async function exportAdPdf(ad: AdAnalysis, images: string[] = []): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  let y = 15
  doc.setFontSize(16)
  doc.text(ad.title.slice(0, 90), 10, y)
  y += 10
  doc.setFontSize(11)
  const meta = `Kategorie: ${ad.category} | Zustand: ${ad.condition} | Preis: ${ad.price_estimate}`
  for (const line of doc.splitTextToSize(`${ad.description}\n\n${meta}`, 180)) {
    if (y > 280) {
      doc.addPage()
      y = 15
    }
    doc.text(line, 10, y)
    y += 6
  }
  if (ad.keywords.length > 0) {
    if (y > 280) {
      doc.addPage()
      y = 15
    }
    doc.text(`Keywords: ${ad.keywords.join(', ').slice(0, 170)}`, 10, y + 4)
    y += 4
  }
  // Bilder optional einbetten (nur Data-URLs, max 3, Fehler tolerant)
  for (const src of images.slice(0, 3)) {
    try {
      if (!src.startsWith('data:image')) continue
      if (y > 220) {
        doc.addPage()
        y = 15
      }
      doc.addImage(src, 'JPEG', 10, y + 8, 80, 60)
      y += 72
    } catch {
      // ignorieren
    }
  }
  doc.save(`${ad.title.slice(0, 30).replace(/[^\wäöüÄÖÜß-]+/gi, '_') || 'inserat'}.pdf`)
}

export async function exportAdZip(ad: AdAnalysis, images: string[] = []): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  zip.file('inserat.txt', formatAdForClipboard(ad))
  zip.file('inserat.json', JSON.stringify(ad, null, 2))
  let i = 0
  for (const src of images) {
    try {
      if (!src.startsWith('data:')) continue
      const base64 = src.split(',')[1]
      const ext = src.includes('png') ? 'png' : 'jpg'
      zip.file(`bild-${++i}.${ext}`, base64, { base64: true })
    } catch {
      // ignorieren
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'inserat.zip'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}
