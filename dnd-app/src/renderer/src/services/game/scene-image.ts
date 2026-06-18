/**
 * PHASE-35 35E — downscale + re-encode any scene-art source (upload / library / map background) to a
 * JPEG data URL under the 4 MB broadcast ceiling, renderer-side. Mirrors the map-image encode (F4),
 * reimplemented here because that one is module-private + map-specific.
 */

const MAX_BYTES = 4 * 1024 * 1024
const CAP_W = 2560
const CAP_H = 1440

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = src
  })
}

export async function prepareSceneImage(src: string): Promise<string> {
  const img = await loadImage(src)
  const scale = Math.min(1, CAP_W / img.width, CAP_H / img.height)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2D context available for scene image')
  ctx.drawImage(img, 0, 0, w, h)

  let out = canvas.toDataURL('image/jpeg', 0.85)
  // Iteratively rescale + drop quality until under the 4 MB ceiling (peers reject anything larger).
  let curW = w
  let curH = h
  let quality = 0.7
  while (out.length > MAX_BYTES && (curW > 1 || curH > 1)) {
    const factor = Math.min(0.9, Math.sqrt(MAX_BYTES / out.length) * 0.9)
    curW = Math.max(1, Math.round(curW * factor))
    curH = Math.max(1, Math.round(curH * factor))
    canvas.width = curW
    canvas.height = curH
    ctx.drawImage(img, 0, 0, curW, curH)
    out = canvas.toDataURL('image/jpeg', quality)
    quality = Math.max(0.4, quality - 0.1)
  }
  return out
}
