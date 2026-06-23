import { useMemo, useState } from 'react'
import { BUILTIN_ROLES } from '../../data/builtin-roles'
import { useT } from '../../i18n'
import { useCampaignStore } from '../../stores/use-campaign-store'
import type { Campaign, Role } from '../../types/campaign'
import {
  ALL_PERMISSIONS,
  getPermissionLabel,
  PERMISSION_GROUPS,
  type Permission,
  type PermissionCategory
} from '../../types/permissions'

/**
 * Phase 29g — campaign permissions editor. Lists roles with a permission count;
 * expanding a role shows a category-grouped checkbox matrix with per-category
 * bulk grant/deny, reset-to-defaults, and a search filter. Built-in roles are
 * editable except they cannot be deleted (the store guards that).
 */
export default function PermissionsEditor({ campaign }: { campaign: Campaign }): JSX.Element {
  const { t } = useT()
  const addRole = useCampaignStore((s) => s.addRole)
  const updateRole = useCampaignStore((s) => s.updateRole)
  const deleteRole = useCampaignStore((s) => s.deleteRole)
  const duplicateRole = useCampaignStore((s) => s.duplicateRole)

  const roles = campaign.permissions?.roles ?? BUILTIN_ROLES
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [newRoleName, setNewRoleName] = useState('')

  const handleCreate = (): void => {
    const name = newRoleName.trim()
    if (!name) return
    addRole(campaign.id, {
      id: `role-${crypto.randomUUID().slice(0, 8)}`,
      name,
      isBuiltIn: false,
      permissions: []
    })
    setNewRoleName('')
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          name="new-role-name"
          value={newRoleName}
          onChange={(e) => setNewRoleName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={t('campaign.permissionsEditor.newRolePlaceholder')}
          className="flex-1 min-w-0 px-3 py-1.5 text-sm bg-surface-2 border border-border rounded text-fg placeholder-gray-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={!newRoleName.trim()}
          className="px-3 py-1.5 text-sm rounded bg-amber-600 hover:bg-accent-strong text-white font-semibold cursor-pointer disabled:opacity-50"
        >
          {t('campaign.permissionsEditor.addRole')}
        </button>
      </div>

      {roles.map((role) => (
        <RoleRow
          key={role.id}
          campaignId={campaign.id}
          role={role}
          expanded={expandedId === role.id}
          search={search}
          onToggle={() => setExpandedId(expandedId === role.id ? null : role.id)}
          onSearchChange={setSearch}
          onUpdate={updateRole}
          onDelete={deleteRole}
          onDuplicate={duplicateRole}
        />
      ))}
    </div>
  )
}

function RoleRow({
  campaignId,
  role,
  expanded,
  search,
  onToggle,
  onSearchChange,
  onUpdate,
  onDelete,
  onDuplicate
}: {
  campaignId: string
  role: Role
  expanded: boolean
  search: string
  onToggle: () => void
  onSearchChange: (s: string) => void
  onUpdate: (campaignId: string, roleId: string, updates: Partial<Role>) => void
  onDelete: (campaignId: string, roleId: string) => void
  onDuplicate: (campaignId: string, roleId: string) => void
}): JSX.Element {
  const { t } = useT()
  const granted = useMemo(() => new Set(role.permissions), [role.permissions])

  const setPermission = (key: Permission, on: boolean): void => {
    const next = on ? [...new Set([...role.permissions, key])] : role.permissions.filter((p) => p !== key)
    onUpdate(campaignId, role.id, { permissions: next })
  }

  const setCategory = (category: PermissionCategory, on: boolean): void => {
    const keys = PERMISSION_GROUPS[category] as readonly Permission[]
    const next = on ? [...new Set([...role.permissions, ...keys])] : role.permissions.filter((p) => !keys.includes(p))
    onUpdate(campaignId, role.id, { permissions: next })
  }

  const resetDefaults = (): void => {
    const builtin = BUILTIN_ROLES.find((r) => r.id === role.id)
    onUpdate(campaignId, role.id, { permissions: builtin ? [...builtin.permissions] : [] })
  }

  const q = search.trim().toLowerCase()

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-2/60">
        <button type="button" onClick={onToggle} className="text-muted hover:text-amber-300 cursor-pointer text-sm">
          {expanded ? '▼' : '▶'}
        </button>
        <span className="text-sm font-semibold text-fg">{role.name}</span>
        {role.isBuiltIn && (
          <span className="text-[10px] text-gray-500 border border-gray-600 rounded px-1">
            {t('campaign.permissionsEditor.builtIn')}
          </span>
        )}
        <span className="text-xs text-gray-500">
          {role.permissions.length}/{ALL_PERMISSIONS.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDuplicate(campaignId, role.id)}
            className="text-xs text-muted hover:text-amber-300 cursor-pointer"
          >
            {t('campaign.permissionsEditor.duplicate')}
          </button>
          <button
            type="button"
            onClick={resetDefaults}
            className="text-xs text-muted hover:text-amber-300 cursor-pointer"
          >
            {t('campaign.permissionsEditor.reset')}
          </button>
          {!role.isBuiltIn && (
            <button
              type="button"
              onClick={() => onDelete(campaignId, role.id)}
              className="text-xs text-red-400 hover:text-red-300 cursor-pointer"
            >
              {t('common.actions.delete')}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3">
          <input
            type="text"
            name="permission-filter"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('campaign.permissionsEditor.filterPlaceholder')}
            className="w-full px-2 py-1 text-xs bg-surface-2 border border-border rounded text-gray-200 placeholder-gray-500"
          />
          {(Object.keys(PERMISSION_GROUPS) as PermissionCategory[]).map((category) => {
            const keys = (PERMISSION_GROUPS[category] as readonly Permission[]).filter(
              (k) => !q || getPermissionLabel(k).toLowerCase().includes(q) || k.includes(q)
            )
            if (keys.length === 0) return null
            const allOn = keys.every((k) => granted.has(k))
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-accent uppercase tracking-wide capitalize">
                    {category}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategory(category, !allOn)}
                    className="text-[10px] text-gray-500 hover:text-amber-300 cursor-pointer"
                  >
                    {allOn ? t('campaign.permissionsEditor.denyAll') : t('campaign.permissionsEditor.grantAll')}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {keys.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        name="permission"
                        checked={granted.has(key)}
                        onChange={(e) => setPermission(key, e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-gray-600 bg-surface-2 text-accent-strong"
                      />
                      <span>{getPermissionLabel(key)}</span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
