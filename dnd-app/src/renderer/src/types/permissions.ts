/**
 * Phase 29a — data-driven permission key universe.
 *
 * Every gameplay gate resolves to one of these keys via
 * `services/permissions/has-permission.ts`. Keys are grouped by category for the
 * permissions-editor matrix UI (Phase 29g).
 */

export type PermissionCategory = 'view' | 'token' | 'chat' | 'map' | 'combat' | 'npc' | 'tools' | 'moderation'

export const PERMISSION_GROUPS = {
  view: [
    'view_hidden_tokens',
    'view_dm_only_stats',
    'view_full_fog',
    'view_hidden_npcs',
    'view_dm_journal_entries',
    'view_secret_handouts'
  ],
  token: [
    'move_own_token',
    'move_any_token',
    'add_token',
    'remove_token',
    'change_token_visibility',
    'edit_token_hp',
    'edit_token_conditions',
    'edit_own_sheet',
    'edit_any_sheet',
    'view_any_sheet'
  ],
  chat: [
    'roll_dice',
    'roll_hidden_dice',
    'see_hidden_dice',
    'chat_send',
    'chat_whisper',
    'chat_clear',
    'chat_file_upload'
  ],
  map: [
    'draw_visible',
    'draw_dm_only',
    'clear_drawings',
    'place_pin',
    'edit_fog',
    'change_active_map',
    'edit_map',
    'edit_grid',
    'edit_walls'
  ],
  combat: [
    'manage_initiative',
    'end_turn_any',
    'end_turn_own',
    'start_combat',
    'end_combat',
    'add_condition_any',
    'remove_condition_any'
  ],
  npc: [
    'add_npc',
    'edit_npc',
    'reveal_npc_field',
    'manage_sidebar_entries',
    'edit_party_inventory',
    'edit_handouts',
    'manage_journal'
  ],
  tools: [
    'use_dm_tools',
    'use_ai_dm',
    'edit_campaign_settings',
    'manage_homebrew',
    'manage_audio',
    'manage_calendar',
    'manage_weather'
  ],
  moderation: [
    'kick_player',
    'ban_player',
    'timeout_player',
    'mute_player_chat',
    'promote_codm',
    'demote_codm',
    'change_player_role',
    'transfer_host',
    'end_session'
  ]
} as const satisfies Record<PermissionCategory, readonly string[]>

export type Permission = (typeof PERMISSION_GROUPS)[PermissionCategory][number]

/** Flat list of every permission key. */
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSION_GROUPS).flat() as Permission[]

/** Human-readable label (Title Case from the snake_case key). */
export function getPermissionLabel(key: Permission): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
