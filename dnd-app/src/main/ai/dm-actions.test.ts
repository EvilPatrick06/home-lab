import { describe, expect, it } from 'vitest'
import { parseDmActions, stripDmActions } from './dm-actions'

describe('dm-actions', () => {
  // ── parseDmActions ──

  describe('parseDmActions', () => {
    it('returns empty array when no DM_ACTIONS block exists', () => {
      expect(parseDmActions('Just some narrative text.')).toEqual([])
    })

    it('parses a single action', () => {
      const response = `The goblins attack!
[DM_ACTIONS]
{"actions": [{"action": "place_token", "label": "Goblin 1", "entityType": "enemy", "gridX": 5, "gridY": 3}]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(1)
      expect(actions[0].action).toBe('place_token')
      expect((actions[0] as any).label).toBe('Goblin 1')
      expect((actions[0] as any).gridX).toBe(5)
    })

    it('parses multiple actions', () => {
      const response = `Combat begins!
[DM_ACTIONS]
{"actions": [
  {"action": "place_token", "label": "Goblin 1", "entityType": "enemy", "gridX": 10, "gridY": 5, "hp": 7, "ac": 15},
  {"action": "place_token", "label": "Goblin 2", "entityType": "enemy", "gridX": 11, "gridY": 6, "hp": 7, "ac": 15},
  {"action": "set_ambient_light", "level": "dim"},
  {"action": "start_initiative", "entries": [
    {"label": "Goblin 1", "roll": 14, "modifier": 2, "entityType": "enemy"},
    {"label": "Goblin 2", "roll": 8, "modifier": 2, "entityType": "enemy"}
  ]}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(4)
      expect(actions[0].action).toBe('place_token')
      expect(actions[1].action).toBe('place_token')
      expect(actions[2].action).toBe('set_ambient_light')
      expect(actions[3].action).toBe('start_initiative')
    })

    it('filters out entries without an action property', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "next_turn"},
  {"notAnAction": true},
  {"action": "end_initiative"}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(2)
      expect(actions[0].action).toBe('next_turn')
      expect(actions[1].action).toBe('end_initiative')
    })

    it('returns empty array for malformed JSON', () => {
      const response = `[DM_ACTIONS]
this is not valid json
[/DM_ACTIONS]`

      expect(parseDmActions(response)).toEqual([])
    })

    it('returns empty array when actions is not an array', () => {
      const response = `[DM_ACTIONS]
{"actions": "not an array"}
[/DM_ACTIONS]`

      expect(parseDmActions(response)).toEqual([])
    })

    it('returns empty array when parsed object has no actions key', () => {
      const response = `[DM_ACTIONS]
{"data": [{"action": "test"}]}
[/DM_ACTIONS]`

      expect(parseDmActions(response)).toEqual([])
    })

    it('handles all token management actions', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "move_token", "label": "Goblin 1", "gridX": 5, "gridY": 5},
  {"action": "remove_token", "label": "Goblin 1"},
  {"action": "update_token", "label": "Goblin 2", "hp": 3, "conditions": ["poisoned"]}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(3)
      expect(actions[0].action).toBe('move_token')
      expect(actions[1].action).toBe('remove_token')
      expect(actions[2].action).toBe('update_token')
    })

    it('handles environment actions', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "set_ambient_light", "level": "darkness"},
  {"action": "set_underwater_combat", "enabled": true},
  {"action": "set_travel_pace", "pace": "slow"}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(3)
    })

    it('handles shop actions', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "open_shop", "name": "Ye Olde Shoppe", "items": [
    {"name": "Longsword", "category": "weapon", "price": {"gp": 15}, "quantity": 3}
  ]},
  {"action": "add_shop_item", "name": "Shield", "category": "armor", "price": {"gp": 10}, "quantity": 1},
  {"action": "remove_shop_item", "name": "Longsword"},
  {"action": "close_shop"}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(4)
    })

    it('handles time management actions', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "advance_time", "hours": 8},
  {"action": "set_time", "hour": 6, "minute": 0},
  {"action": "share_time", "target": "all", "message": "Dawn breaks"}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(3)
    })

    it('handles sound actions', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "sound_effect", "sound": "creature-dragon"},
  {"action": "play_ambient", "loop": "ambient-dungeon"},
  {"action": "stop_ambient"}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(3)
    })

    it('handles rest actions', () => {
      const response = `[DM_ACTIONS]
{"actions": [
  {"action": "short_rest", "characterNames": ["Aragorn", "Legolas"]},
  {"action": "long_rest", "characterNames": ["Gimli"]}
]}
[/DM_ACTIONS]`

      const actions = parseDmActions(response)
      expect(actions).toHaveLength(2)
    })
  })

  // ── stripDmActions ──

  describe('stripDmActions', () => {
    it('removes DM_ACTIONS block from text', () => {
      const response = `The goblin falls!
[DM_ACTIONS]
{"actions": [{"action": "remove_token", "label": "Goblin 1"}]}
[/DM_ACTIONS]`

      expect(stripDmActions(response)).toBe('The goblin falls!')
    })

    it('returns original text when no DM_ACTIONS block', () => {
      const text = 'Just a regular narrative response.'
      expect(stripDmActions(text)).toBe(text)
    })

    it('removes DM_ACTIONS block in middle of text', () => {
      const response = `First part.
[DM_ACTIONS]
{"actions": [{"action": "next_turn"}]}
[/DM_ACTIONS]
Second part.`

      const stripped = stripDmActions(response)
      expect(stripped).toContain('First part.')
      expect(stripped).toContain('Second part.')
      expect(stripped).not.toContain('DM_ACTIONS')
    })

    it('handles multiple DM_ACTIONS blocks', () => {
      const response = `Part 1
[DM_ACTIONS]{"actions":[{"action":"a"}]}[/DM_ACTIONS]
Part 2
[DM_ACTIONS]{"actions":[{"action":"b"}]}[/DM_ACTIONS]`

      const stripped = stripDmActions(response)
      expect(stripped).toContain('Part 1')
      expect(stripped).toContain('Part 2')
      expect(stripped).not.toContain('DM_ACTIONS')
    })

    it('trims whitespace from result', () => {
      const response = `   Text
[DM_ACTIONS]{"actions":[]}[/DM_ACTIONS]   `

      expect(stripDmActions(response)).toBe('Text')
    })
  })
})
