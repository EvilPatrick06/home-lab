import { ChevronDown, ChevronUp } from 'lucide-react'
import { usePanelResize } from '../../../hooks/use-panel-resize'
import { useT } from '../../../i18n'
import { useNetworkStore } from '../../../stores/network-store'
import { useMacroStore } from '../../../stores/use-macro-store'
import type { Campaign } from '../../../types/campaign'
import ResizeHandle from '../ResizeHandle'
import ChatPanel from './ChatPanel'
import DMTabPanel from './DMTabPanel'

interface DMBottomBarProps {
  onEditMap: () => void
  playerName: string
  campaign: Campaign
  collapsed?: boolean
  onToggleCollapse?: () => void
  onOpenModal?: (modal: string) => void
  onDispute?: (ruling: string) => void
  onLinkClick?: (category: string, name: string) => void
}

export default function DMBottomBar({
  onEditMap,
  playerName,
  campaign,
  collapsed,
  onToggleCollapse,
  onOpenModal,
  onDispute,
  onLinkClick
}: DMBottomBarProps): JSX.Element {
  const { t } = useT()
  const handleOpenModal = (modal: string): void => {
    onOpenModal?.(modal)
  }

  // Panel resize hook provides sidebar (tab panel) resize capabilities
  const {
    sidebarWidth: tabPanelWidth,
    handleSidebarResize: handleTabResize,
    handleSidebarDoubleClick: handleTabDoubleClick
  } = usePanelResize()

  return (
    <div className="min-h-0 h-full bg-base/90 backdrop-blur-sm border-t border-amber-900/30 flex min-w-0 relative">
      {/* Collapse toggle + Share Macros */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 flex-wrap justify-center max-w-xs">
        <button
          onClick={onToggleCollapse}
          className="px-3 py-1
            bg-surface-2 border border-border/50 rounded-t-lg text-muted hover:text-gray-200
            cursor-pointer transition-colors"
          title={collapsed ? t('game.dmBottomBar.expand') : t('game.dmBottomBar.collapse')}
          aria-label={collapsed ? t('game.dmBottomBar.expand') : t('game.dmBottomBar.collapse')}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          onClick={() => {
            const macros = useMacroStore.getState().macros
            if (macros.length === 0) return
            useNetworkStore.getState().sendMessage('dm:push-macros', { macros })
          }}
          className="px-2 py-0.5 text-xs
            bg-surface-2 border border-border/50 rounded-t-lg text-muted hover:text-amber-300
            cursor-pointer transition-colors"
          title={t('game.dmBottomBar.shareMacrosTitle')}
        >
          {t('game.dmBottomBar.shareMacros')}
        </button>
      </div>

      {collapsed ? (
        <div className="flex-1 px-3 py-1.5">
          <ChatPanel
            isDM={true}
            playerName={playerName}
            campaign={campaign}
            collapsed
            onOpenModal={onOpenModal}
            onDispute={onDispute}
            onLinkClick={onLinkClick}
          />
        </div>
      ) : (
        <>
          {/* Left: Tab panel with resizable width */}
          <div
            className="shrink-0 flex flex-col min-h-0 border-r border-border/50 overflow-hidden"
            style={{ width: tabPanelWidth }}
          >
            <DMTabPanel onOpenModal={handleOpenModal} campaign={campaign} onDispute={onDispute} onEditMap={onEditMap} />
          </div>

          {/* Resize handle between tab panel and chat */}
          <ResizeHandle direction="horizontal" onResize={handleTabResize} onDoubleClick={handleTabDoubleClick} />

          {/* Right: chat panel */}
          <ChatPanel
            isDM={true}
            playerName={playerName}
            campaign={campaign}
            onOpenModal={onOpenModal}
            onDispute={onDispute}
            onLinkClick={onLinkClick}
          />
        </>
      )}
    </div>
  )
}
