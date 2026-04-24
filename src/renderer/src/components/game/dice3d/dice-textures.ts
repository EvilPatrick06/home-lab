import * as THREE from 'three'
import type { DiceColors } from './dice-types'

// ─── Canvas texture generator ─────────────────────────────────

export function createDieTexture(
  faceText: string,
  bgColor: string,
  textColor: string,
  size: number = 256
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Background
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, size, size)

  // Text
  const fontSize = faceText.length > 2 ? size * 0.3 : faceText.length > 1 ? size * 0.38 : size * 0.5
  ctx.fillStyle = textColor
  ctx.font = `bold ${fontSize}px 'Segoe UI', Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(faceText, size / 2, size / 2)

  // Underline 6 and 9 to distinguish them
  if (faceText === '6' || faceText === '9') {
    const metrics = ctx.measureText(faceText)
    const underY = size / 2 + fontSize * 0.35
    const hw = metrics.width / 2
    ctx.strokeStyle = textColor
    ctx.lineWidth = Math.max(2, fontSize * 0.06)
    ctx.beginPath()
    ctx.moveTo(size / 2 - hw, underY)
    ctx.lineTo(size / 2 + hw, underY)
    ctx.stroke()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Create a hidden die texture with '?' and glow effect */
export function createHiddenTexture(bgColor: string, size: number = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, size, size)

  // Glow effect
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.4)
  gradient.addColorStop(0, 'rgba(138, 43, 226, 0.4)')
  gradient.addColorStop(1, 'rgba(138, 43, 226, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const fontSize = size * 0.45
  ctx.fillStyle = '#bb88ff'
  ctx.font = `bold ${fontSize}px 'Segoe UI', Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', size / 2, size / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ─── Material factories ──────────────────────────────────────

export function createFaceMaterials(
  faceLabels: string[],
  colors: DiceColors,
  isHidden: boolean = false
): THREE.MeshStandardMaterial[] {
  return faceLabels.map((label) => {
    const texture = isHidden
      ? createHiddenTexture(colors.bodyColor)
      : createDieTexture(label, colors.bodyColor, colors.numberColor)
    return new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.35,
      metalness: 0.15,
      flatShading: false
    })
  })
}

export function _createSolidMaterial(colors: DiceColors): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(colors.bodyColor),
    roughness: 0.35,
    metalness: 0.15,
    flatShading: false
  })
}

export function createWireMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: 0x3a3a5e, linewidth: 1 })
}
