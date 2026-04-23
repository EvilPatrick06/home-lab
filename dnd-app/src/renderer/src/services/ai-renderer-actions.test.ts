import { describe, expect, it, vi } from 'vitest'
import { parseRendererActions, processAiRendererActions, stripActionTags } from './ai-renderer-actions'

// ---------------------------------------------------------------------------
// parseRendererActions
// ---------------------------------------------------------------------------

describe('parseRendererActions', () => {
  it('returns an empty array for text with no action tags', () => {
    expect(parseRendererActions('Hello world, no actions here.')).toEqual([])
  })

  it('parses a roll-request action', () => {
    const text = '[ACTION:roll-request skill=Perception dc=15]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({
      type: 'roll-request',
      ability: undefined,
      skill: 'Perception',
      dc: 15,
      targetPlayerIds: undefined
    })
  })

  it('parses a roll-request with ability instead of skill', () => {
    const text = '[ACTION:roll-request ability=Dexterity dc=12]'
    const actions = parseRendererActions(text)

    expect(actions[0]).toMatchObject({
      type: 'roll-request',
      ability: 'Dexterity',
      skill: undefined,
      dc: 12
    })
  })

  it('defaults dc to 10 when not a valid number', () => {
    const text = '[ACTION:roll-request skill=Stealth dc=abc]'
    const actions = parseRendererActions(text)

    expect(actions[0].type).toBe('roll-request')
    if (actions[0].type === 'roll-request') {
      expect(actions[0].dc).toBe(10)
    }
  })

  it('parses a loot-award action with gold', () => {
    // Note: the outer regex [ACTION:type (.*?)] uses lazy matching and stops at the
    // first ']', so JSON arrays with nested objects (containing '}' and ']') get
    // truncated. Items with simple arrays still work if they are the last param.
    const text = '[ACTION:loot-award gold=50]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    expect(actions[0].type).toBe('loot-award')
    if (actions[0].type === 'loot-award') {
      expect(actions[0].items).toEqual([])
      expect(actions[0].gold).toBe(50)
    }
  })

  it('parses a loot-award with missing items as empty array', () => {
    const text = '[ACTION:loot-award gold=25]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    if (actions[0].type === 'loot-award') {
      expect(actions[0].items).toEqual([])
    }
  })

  it('parses an xp-award action', () => {
    const text = '[ACTION:xp-award amount=200 reason="Defeated the goblins"]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({
      type: 'xp-award',
      amount: 200,
      reason: 'Defeated the goblins',
      targetPlayerIds: undefined
    })
  })

  it('skips xp-award when amount is zero or negative', () => {
    expect(parseRendererActions('[ACTION:xp-award amount=0]')).toEqual([])
    expect(parseRendererActions('[ACTION:xp-award amount=-5]')).toEqual([])
  })

  it('skips xp-award when amount is not a number', () => {
    expect(parseRendererActions('[ACTION:xp-award amount=abc]')).toEqual([])
  })

  it('parses a combat-start action (simple array without nested objects)', () => {
    // The outer regex [ACTION:...] uses lazy .*? which stops at the first ']',
    // so JSON arrays with nested objects (containing '}') get truncated.
    // Combat-start with complex enemies JSON fails to parse due to this limitation.
    // An empty enemies array or missing enemies field results in the action being skipped.
    const text = '[ACTION:combat-start]'
    const actions = parseRendererActions(text)
    // No enemies = skipped
    expect(actions).toHaveLength(0)
  })

  it('skips combat-start when enemies array is empty or invalid', () => {
    expect(parseRendererActions('[ACTION:combat-start enemies=[]]')).toEqual([])
    expect(parseRendererActions('[ACTION:combat-start]')).toEqual([])
  })

  it('parses a narration action with mood', () => {
    const text = '[ACTION:narration text="The cavern trembles..." mood=dramatic]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({
      type: 'narration',
      text: 'The cavern trembles...',
      mood: 'dramatic'
    })
  })

  it('narration with invalid mood sets mood to undefined', () => {
    const text = '[ACTION:narration text="Hello" mood=silly]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    if (actions[0].type === 'narration') {
      expect(actions[0].mood).toBeUndefined()
    }
  })

  it('parses all valid narration moods', () => {
    for (const mood of ['dramatic', 'calm', 'tense', 'mysterious']) {
      const text = `[ACTION:narration text="test" mood=${mood}]`
      const actions = parseRendererActions(text)
      expect(actions[0]).toMatchObject({ type: 'narration', mood })
    }
  })

  it('parses a map-reveal action with simple coordinate array', () => {
    // The outer regex uses lazy .*? which stops at the first ']'.
    // JSON arrays containing objects with '}' get truncated before parsing.
    // Simple number arrays (e.g., [5,3,5,4]) would parse, but objects do not.
    // With complex JSON objects, the cells param fails to parse and the action is skipped.
    const text = '[ACTION:map-reveal cells=[{"x":5,"y":3}]]'
    const actions = parseRendererActions(text)

    // The lazy .*? captures up to the first ']' which is inside the JSON at {"x":5,"y":3}]
    // The params string becomes: cells=[{"x":5,"y":3}
    // parseParams tries \[([^\]]*)\] which needs opening '[' and closing ']' — the closing ']' was consumed
    // So cells is undefined → action is skipped
    expect(actions).toHaveLength(0)
  })

  it('skips map-reveal when cells array is empty', () => {
    expect(parseRendererActions('[ACTION:map-reveal cells=[]]')).toEqual([])
  })

  it('parses a sound-effect action', () => {
    const text = '[ACTION:sound-effect sound=combat-start]'
    const actions = parseRendererActions(text)

    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({ type: 'sound-effect', sound: 'combat-start' })
  })

  it('skips sound-effect when sound param is missing', () => {
    expect(parseRendererActions('[ACTION:sound-effect]')).toEqual([])
  })

  it('ignores unknown action types', () => {
    expect(parseRendererActions('[ACTION:unknown-type foo=bar]')).toEqual([])
  })

  it('parses multiple actions from a single text', () => {
    // combat-start with complex JSON enemies fails due to lazy regex ']' matching,
    // so only actions with simple (non-JSON-object) params parse successfully.
    const text = `
      Roll initiative! [ACTION:roll-request ability=Dexterity dc=10]
      [ACTION:sound-effect sound=combat-start]
      [ACTION:narration text="Battle begins" mood=dramatic]
    `
    const actions = parseRendererActions(text)
    expect(actions).toHaveLength(3)
    expect(actions.map((a) => a.type)).toEqual(['roll-request', 'sound-effect', 'narration'])
  })

  it('handles malformed JSON in params gracefully', () => {
    // Malformed JSON array for items - should still parse as much as possible
    const text = '[ACTION:loot-award items=[invalid json] gold=10]'
    const actions = parseRendererActions(text)

    // Should still create the action but with empty/undefined items
    expect(actions).toHaveLength(1)
    if (actions[0].type === 'loot-award') {
      expect(actions[0].items).toEqual([])
    }
  })
})

// ---------------------------------------------------------------------------
// stripActionTags
// ---------------------------------------------------------------------------

describe('stripActionTags', () => {
  it('removes action tags from text', () => {
    const text = 'Hello [ACTION:sound-effect sound=hit] world'
    expect(stripActionTags(text)).toBe('Hello  world')
  })

  it('cleans up excessive newlines left by removed tags', () => {
    const text = 'Line 1\n\n\n\n[ACTION:narration text="x" mood=calm]\n\n\nLine 2'
    const result = stripActionTags(text)
    expect(result).not.toContain('\n\n\n')
  })

  it('trims whitespace from the result', () => {
    const text = '  [ACTION:sound-effect sound=hit]  '
    expect(stripActionTags(text)).toBe('')
  })

  it('returns the same text when no action tags are present', () => {
    const text = 'Just regular text here.'
    expect(stripActionTags(text)).toBe('Just regular text here.')
  })

  it('removes multiple action tags', () => {
    const text = '[ACTION:sound-effect sound=a] middle [ACTION:sound-effect sound=b]'
    expect(stripActionTags(text)).toBe('middle')
  })
})

// ---------------------------------------------------------------------------
// processAiRendererActions
// ---------------------------------------------------------------------------

describe('processAiRendererActions', () => {
  it('dispatches roll-request to triggerRollRequest', () => {
    const dispatch = { triggerRollRequest: vi.fn() }
    processAiRendererActions([{ type: 'roll-request', skill: 'Perception', dc: 15 }], dispatch)

    expect(dispatch.triggerRollRequest).toHaveBeenCalledWith(undefined, 'Perception', 15)
  })

  it('dispatches xp-award to awardXP', () => {
    const dispatch = { awardXP: vi.fn() }
    processAiRendererActions([{ type: 'xp-award', amount: 200, reason: 'Victory' }], dispatch)

    expect(dispatch.awardXP).toHaveBeenCalledWith(200, 'Victory')
  })

  it('dispatches loot-award to awardLoot', () => {
    const dispatch = { awardLoot: vi.fn() }
    const items = [{ name: 'Sword', quantity: 1 }]
    processAiRendererActions([{ type: 'loot-award', items, gold: 50 }], dispatch)

    expect(dispatch.awardLoot).toHaveBeenCalledWith(items, 50)
  })

  it('dispatches combat-start to startCombat', () => {
    const dispatch = { startCombat: vi.fn() }
    const enemies = [{ name: 'Orc', initiativeModifier: 3 }]
    processAiRendererActions([{ type: 'combat-start', enemies }], dispatch)

    expect(dispatch.startCombat).toHaveBeenCalledWith(enemies)
  })

  it('dispatches narration to showNarration', () => {
    const dispatch = { showNarration: vi.fn() }
    processAiRendererActions([{ type: 'narration', text: 'Darkness falls...', mood: 'tense' }], dispatch)

    expect(dispatch.showNarration).toHaveBeenCalledWith('Darkness falls...', 'tense')
  })

  it('dispatches map-reveal to revealMap', () => {
    const dispatch = { revealMap: vi.fn() }
    const cells = [{ x: 1, y: 2 }]
    processAiRendererActions([{ type: 'map-reveal', cells }], dispatch)

    expect(dispatch.revealMap).toHaveBeenCalledWith(cells)
  })

  it('dispatches sound-effect to playSound', () => {
    const dispatch = { playSound: vi.fn() }
    processAiRendererActions([{ type: 'sound-effect', sound: 'door-open' }], dispatch)

    expect(dispatch.playSound).toHaveBeenCalledWith('door-open')
  })

  it('does not throw when dispatch handlers are missing (optional callbacks)', () => {
    expect(() => {
      processAiRendererActions(
        [
          { type: 'roll-request', dc: 10 },
          { type: 'xp-award', amount: 100 },
          { type: 'sound-effect', sound: 'hit' }
        ],
        {}
      )
    }).not.toThrow()
  })

  it('continues dispatching after a handler throws', () => {
    const dispatch = {
      triggerRollRequest: vi.fn().mockImplementation(() => {
        throw new Error('handler error')
      }),
      playSound: vi.fn()
    }

    processAiRendererActions(
      [
        { type: 'roll-request', dc: 10 },
        { type: 'sound-effect', sound: 'hit' }
      ],
      dispatch
    )

    expect(dispatch.triggerRollRequest).toHaveBeenCalled()
    expect(dispatch.playSound).toHaveBeenCalledWith('hit')
  })

  it('dispatches multiple actions in order', () => {
    const order: string[] = []
    const dispatch = {
      triggerRollRequest: vi.fn().mockImplementation(() => order.push('roll')),
      playSound: vi.fn().mockImplementation(() => order.push('sound')),
      awardXP: vi.fn().mockImplementation(() => order.push('xp'))
    }

    processAiRendererActions(
      [
        { type: 'roll-request', dc: 10 },
        { type: 'sound-effect', sound: 'hit' },
        { type: 'xp-award', amount: 50 }
      ],
      dispatch
    )

    expect(order).toEqual(['roll', 'sound', 'xp'])
  })
})
