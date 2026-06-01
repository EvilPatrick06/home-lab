import { Circle, Pencil, Ruler, Square, Type } from 'lucide-react'
import { Z } from '../../../constants'
import { useT } from '../../../i18n'
import { Tooltip } from '../../ui'
import type { MapTool } from './types'

interface DrawingToolPickerProps {
  /** Selects a drawing tool (draw-free / draw-line / draw-rect / draw-circle / draw-text). */
  onSetTool: (tool: MapTool) => void
}

/**
 * DM-only drawing-tool launcher column, shown when activeTool === 'select'.
 * Extracted verbatim from GameLayout — same markup, labels, and hotkey hints.
 * Phase 14b (D2): the caller still gates rendering on effectiveIsDM.
 */
export default function DrawingToolPicker({ onSetTool }: DrawingToolPickerProps): JSX.Element {
  const { t } = useT()
  return (
    <div
      className="absolute top-16 right-4 flex flex-col gap-1 bg-surface/90 backdrop-blur-sm border border-border/50 rounded-xl p-2 shadow-xl"
      style={{ zIndex: Z.TOOLBAR }}
      role="toolbar"
      aria-label={t('game.drawingToolPicker.toolbarLabel')}
    >
      <p className="text-xs text-gray-500 uppercase tracking-wider text-center mb-1">
        {t('game.drawingToolPicker.drawing')}
      </p>
      <Tooltip text={t('game.drawingToolPicker.freeDrawTip')}>
        <button
          onClick={() => onSetTool('draw-free')}
          aria-label={t('game.drawingToolPicker.freeDraw')}
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Pencil className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text={t('game.drawingToolPicker.drawLineTip')}>
        <button
          onClick={() => onSetTool('draw-line')}
          aria-label={t('game.drawingToolPicker.drawLine')}
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Ruler className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text={t('game.drawingToolPicker.drawRectTip')}>
        <button
          onClick={() => onSetTool('draw-rect')}
          aria-label={t('game.drawingToolPicker.drawRect')}
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Square className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text={t('game.drawingToolPicker.drawCircleTip')}>
        <button
          onClick={() => onSetTool('draw-circle')}
          aria-label={t('game.drawingToolPicker.drawCircle')}
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Circle className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
      <Tooltip text={t('game.drawingToolPicker.addTextTip')}>
        <button
          onClick={() => onSetTool('draw-text')}
          aria-label={t('game.drawingToolPicker.addText')}
          className="w-11 h-11 p-2 rounded-lg flex items-center justify-center bg-surface-2 text-gray-300 hover:bg-gray-700 cursor-pointer"
        >
          <Type className="w-5 h-5" aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  )
}
