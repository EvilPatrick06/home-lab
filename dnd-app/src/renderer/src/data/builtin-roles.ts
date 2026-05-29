import type { Role } from '../types/campaign'
import { ALL_PERMISSIONS, type Permission } from '../types/permissions'

/**
 * Phase 29b — built-in role defaults (stable ids). A new/migrated campaign gets
 * a per-campaign `structuredClone(BUILTIN_ROLES)` so the DM can edit them
 * without affecting other campaigns. Built-ins are editable but not deletable.
 */

// CoDM = everything except host-management / destructive moderation.
const CODM_EXCLUDED: Permission[] = [
  'promote_codm',
  'demote_codm',
  'transfer_host',
  'ban_player',
  'end_session',
  'edit_campaign_settings'
]

const PLAYER_PERMISSIONS: Permission[] = [
  'move_own_token',
  'edit_own_sheet',
  'view_any_sheet',
  'roll_dice',
  'chat_send',
  'chat_whisper',
  'draw_visible',
  'end_turn_own'
]

const SPECTATOR_PERMISSIONS: Permission[] = ['chat_send', 'chat_whisper', 'roll_dice', 'view_any_sheet']

export const BUILTIN_ROLES: Role[] = [
  {
    id: 'role-dm',
    name: 'Dungeon Master',
    description: 'Full control over the campaign.',
    color: '#f59e0b',
    isBuiltIn: true,
    permissions: [...ALL_PERMISSIONS]
  },
  {
    id: 'role-codm',
    name: 'Co-DM',
    description: 'Full gameplay control minus host management.',
    color: '#a78bfa',
    isBuiltIn: true,
    permissions: ALL_PERMISSIONS.filter((p) => !CODM_EXCLUDED.includes(p))
  },
  {
    id: 'role-player',
    name: 'Player',
    description: 'Controls their own character.',
    color: '#60a5fa',
    isBuiltIn: true,
    permissions: [...PLAYER_PERMISSIONS]
  },
  {
    id: 'role-spectator',
    name: 'Spectator',
    description: 'Watches and chats; no write actions.',
    color: '#9ca3af',
    isBuiltIn: true,
    permissions: [...SPECTATOR_PERMISSIONS]
  }
]
