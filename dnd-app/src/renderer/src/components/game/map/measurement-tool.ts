import { type Graphics, Text, TextStyle } from 'pixi.js'
import { type DiagonalRule, gridDistanceFeet, gridDistanceFeetAlternate } from '../../../services/combat/combat-rules'
import type { GridSettings } from '../../../types/map'
import { getHexCenter, pixelToHex } from './grid-layer'

interface MeasurementOptions {
  gridType?: GridSettings['type']
  offsetX?: number
  offsetY?: number
  diagonalRule?: DiagonalRule
}

interface MeasurementResult {
  cells: number
  feet: number
  lineStart: { x: number; y: number }
  lineEnd: { x: number; y: number }
}

/**
 * Draws a measurement line between two points with distance annotation.
 * Displays distance in both grid cells and feet (1 cell = 5 ft).
 */
export function drawMeasurement(
  graphics: Graphics,
  start: { x: number; y: number },
  end: { x: number; y: number },
  cellSize: number,
  options: MeasurementOptions = {}
): void {
  graphics.clear()

  const measurement = options.gridType
    ? calculateGridMeasurement(start, end, cellSize, options)
    : calculateEuclideanMeasurement(start, end, cellSize)

  // Draw the measurement line
  graphics.moveTo(measurement.lineStart.x, measurement.lineStart.y)
  graphics.lineTo(measurement.lineEnd.x, measurement.lineEnd.y)
  graphics.stroke({ width: 2, color: 0xf59e0b, alpha: 0.9 })

  // Start and end dots
  graphics.circle(measurement.lineStart.x, measurement.lineStart.y, 4)
  graphics.fill({ color: 0xf59e0b, alpha: 1 })
  graphics.circle(measurement.lineEnd.x, measurement.lineEnd.y, 4)
  graphics.fill({ color: 0xf59e0b, alpha: 1 })

  // Label at midpoint
  const midX = (measurement.lineStart.x + measurement.lineEnd.x) / 2
  const midY = (measurement.lineStart.y + measurement.lineEnd.y) / 2

  const style = new TextStyle({
    fontFamily: 'Arial, sans-serif',
    fontSize: 14,
    fontWeight: 'bold',
    fill: 0xfbbf24,
    stroke: { color: 0x000000, width: 3 },
    align: 'center'
  })

  // Remove old children (text labels from previous draws)
  while (graphics.children.length > 0) {
    graphics.removeChildAt(0)
  }

  const label = new Text({
    text: `${measurement.cells.toFixed(1)} cells / ${measurement.feet} ft`,
    style
  })
  label.anchor.set(0.5, 1)
  label.x = midX
  label.y = midY - 8

  graphics.addChild(label)
}

function calculateEuclideanMeasurement(
  start: { x: number; y: number },
  end: { x: number; y: number },
  cellSize: number
): MeasurementResult {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const pixelDist = Math.sqrt(dx * dx + dy * dy)
  const cells = pixelDist / cellSize
  return {
    cells,
    feet: Math.round(cells * 5),
    lineStart: start,
    lineEnd: end
  }
}

function calculateGridMeasurement(
  start: { x: number; y: number },
  end: { x: number; y: number },
  cellSize: number,
  options: MeasurementOptions
): MeasurementResult {
  const gridType = options.gridType ?? 'square'
  if (gridType === 'gridless') {
    return calculateEuclideanMeasurement(start, end, cellSize)
  }
  if (gridType === 'hex' || gridType === 'hex-flat' || gridType === 'hex-pointy') {
    return calculateHexMeasurement(start, end, cellSize, options, gridType)
  }
  return calculateSquareMeasurement(start, end, cellSize, options)
}

function calculateSquareMeasurement(
  start: { x: number; y: number },
  end: { x: number; y: number },
  cellSize: number,
  options: MeasurementOptions
): MeasurementResult {
  const startCell = pointToSquareCell(start, cellSize, options.offsetX ?? 0, options.offsetY ?? 0)
  const endCell = pointToSquareCell(end, cellSize, options.offsetX ?? 0, options.offsetY ?? 0)
  const feet =
    options.diagonalRule === 'alternate'
      ? gridDistanceFeetAlternate(startCell.x, startCell.y, endCell.x, endCell.y)
      : gridDistanceFeet(startCell.x, startCell.y, endCell.x, endCell.y)

  return {
    cells: feet / 5,
    feet,
    lineStart: squareCellCenter(startCell.x, startCell.y, cellSize, options.offsetX ?? 0, options.offsetY ?? 0),
    lineEnd: squareCellCenter(endCell.x, endCell.y, cellSize, options.offsetX ?? 0, options.offsetY ?? 0)
  }
}

function calculateHexMeasurement(
  start: { x: number; y: number },
  end: { x: number; y: number },
  cellSize: number,
  options: MeasurementOptions,
  gridType: 'hex' | 'hex-flat' | 'hex-pointy'
): MeasurementResult {
  const orientation = gridType === 'hex-pointy' ? 'pointy' : 'flat'
  const offsetX = options.offsetX ?? 0
  const offsetY = options.offsetY ?? 0
  const startCell = pixelToHex(start.x, start.y, cellSize, offsetX, offsetY, orientation)
  const endCell = pixelToHex(end.x, end.y, cellSize, offsetX, offsetY, orientation)
  const cells = hexCellDistance(startCell.col, startCell.row, endCell.col, endCell.row, gridType)

  return {
    cells,
    feet: cells * 5,
    lineStart: getHexCenter(startCell.col, startCell.row, cellSize, offsetX, offsetY, orientation),
    lineEnd: getHexCenter(endCell.col, endCell.row, cellSize, offsetX, offsetY, orientation)
  }
}

function pointToSquareCell(
  point: { x: number; y: number },
  cellSize: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  const originX = offsetX % cellSize
  const originY = offsetY % cellSize
  return {
    x: Math.floor((point.x - originX) / cellSize),
    y: Math.floor((point.y - originY) / cellSize)
  }
}

function squareCellCenter(
  cellX: number,
  cellY: number,
  cellSize: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  const originX = offsetX % cellSize
  const originY = offsetY % cellSize
  return {
    x: originX + cellX * cellSize + cellSize / 2,
    y: originY + cellY * cellSize + cellSize / 2
  }
}

function hexCellDistance(
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  gridType: 'hex' | 'hex-flat' | 'hex-pointy'
): number {
  const startCube =
    gridType === 'hex-pointy' ? oddRowOffsetToCube(startCol, startRow) : oddColumnOffsetToCube(startCol, startRow)
  const endCube = gridType === 'hex-pointy' ? oddRowOffsetToCube(endCol, endRow) : oddColumnOffsetToCube(endCol, endRow)
  return (Math.abs(startCube.x - endCube.x) + Math.abs(startCube.y - endCube.y) + Math.abs(startCube.z - endCube.z)) / 2
}

function oddColumnOffsetToCube(col: number, row: number): { x: number; y: number; z: number } {
  const x = col
  const z = row - Math.floor((col - (col & 1)) / 2)
  return { x, y: -x - z, z }
}

function oddRowOffsetToCube(col: number, row: number): { x: number; y: number; z: number } {
  const x = col - Math.floor((row - (row & 1)) / 2)
  const z = row
  return { x, y: -x - z, z }
}

/**
 * Clears the measurement overlay.
 */
export function clearMeasurement(graphics: Graphics): void {
  graphics.clear()
  while (graphics.children.length > 0) {
    graphics.removeChildAt(0)
  }
}
