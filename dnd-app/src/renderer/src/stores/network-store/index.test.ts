import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

describe('network store index', () => {
  it('can be imported', async () => {
    const mod = await import('./index')
    expect(mod).toBeDefined()
  })

  it('exports useNetworkStore', async () => {
    const mod = await import('./index')
    expect(mod.useNetworkStore).toBeDefined()
    expect(typeof mod.useNetworkStore).toBe('function')
  })

  it('exports NetworkState type (via store shape)', async () => {
    const { useNetworkStore } = await import('./index')
    const state = useNetworkStore.getState()
    expect(state).toHaveProperty('role')
    expect(state).toHaveProperty('connectionState')
    expect(state).toHaveProperty('inviteCode')
    expect(state).toHaveProperty('campaignId')
    expect(state).toHaveProperty('localPeerId')
    expect(state).toHaveProperty('displayName')
    expect(state).toHaveProperty('peers')
    expect(state).toHaveProperty('error')
    expect(state).toHaveProperty('disconnectReason')
    expect(state).toHaveProperty('latencyMs')
  })

  it('store has initial state values', async () => {
    const { useNetworkStore } = await import('./index')
    const state = useNetworkStore.getState()
    expect(state.role).toBe('none')
    expect(state.connectionState).toBe('disconnected')
    expect(state.inviteCode).toBeNull()
    expect(state.campaignId).toBeNull()
    expect(state.localPeerId).toBeNull()
    expect(state.displayName).toBe('')
    expect(Array.isArray(state.peers)).toBe(true)
    expect(state.peers).toHaveLength(0)
    expect(state.error).toBeNull()
    expect(state.disconnectReason).toBeNull()
    expect(state.latencyMs).toBeNull()
  })

  it('store has action methods', async () => {
    const { useNetworkStore } = await import('./index')
    const state = useNetworkStore.getState()
    expect(typeof state.hostGame).toBe('function')
    expect(typeof state.stopHosting).toBe('function')
    expect(typeof state.kickPlayer).toBe('function')
    expect(typeof state.joinGame).toBe('function')
    expect(typeof state.disconnect).toBe('function')
    expect(typeof state.sendMessage).toBe('function')
    expect(typeof state.setDisplayName).toBe('function')
    expect(typeof state.updatePeer).toBe('function')
    expect(typeof state.removePeer).toBe('function')
    expect(typeof state.addPeer).toBe('function')
    expect(typeof state.setConnectionState).toBe('function')
    expect(typeof state.setError).toBe('function')
    expect(typeof state.clearDisconnectReason).toBe('function')
  })
})

describe('filterGameStateForRole', () => {
  // Minimal NetworkGameState shape — most fields are pass-through and irrelevant to the filter
  const baseState = {
    activeMapId: 'map-1',
    maps: [],
    turnMode: 'free' as const,
    initiative: null,
    round: 0,
    conditions: [],
    isPaused: false,
    turnStates: {},
    underwaterCombat: false,
    flankingEnabled: false,
    groupInitiativeEnabled: false,
    ambientLight: 'bright' as const,
    diagonalRule: 'standard' as const,
    travelPace: null,
    marchingOrder: [],
    inGameTime: null,
    allies: [],
    enemies: [],
    places: [],
    handouts: []
  }

  it('returns state unchanged when isDM=true', async () => {
    const { filterGameStateForRole } = await import('./index')
    const out = filterGameStateForRole(baseState, true)
    expect(out).toEqual(baseState)
  })

  it('strips hidden tokens from each map for non-DM', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = {
      ...baseState,
      maps: [
        {
          id: 'm1',
          name: 'Map',
          campaignId: 'c',
          imagePath: '',
          width: 100,
          height: 100,
          grid: null,
          tokens: [
            { id: 't-visible', name: 'Goblin', isHidden: false },
            { id: 't-hidden', name: 'Lurker', isHidden: true },
            { id: 't-default', name: 'NoFlag' }
          ],
          fogOfWar: null,
          terrain: [],
          createdAt: '2026-01-01'
        }
      ]
    }
    const out = filterGameStateForRole(state, false)
    const tokens = (out.maps[0].tokens as Array<{ id: string }>).map((t) => t.id)
    expect(tokens).toEqual(['t-visible', 't-default'])
  })

  it('strips DM-only sidebar entries and `notes` field for non-DM', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = {
      ...baseState,
      enemies: [
        { id: 'e1', name: 'Goblin', visibleToPlayers: true, notes: 'tactics: ambush' },
        { id: 'e2', name: 'Hidden Boss', visibleToPlayers: false, notes: 'spoiler' }
      ]
    }
    const out = filterGameStateForRole(state, false)
    expect(out.enemies).toHaveLength(1)
    expect(out.enemies[0]).not.toHaveProperty('notes')
    expect((out.enemies[0] as { id: string }).id).toBe('e1')
  })

  it('strips `visibility: dm-only` handouts and dmOnly pages for non-DM', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = {
      ...baseState,
      handouts: [
        {
          id: 'h1',
          visibility: 'all',
          pages: [
            { id: 'p1', dmOnly: false },
            { id: 'p2', dmOnly: true }
          ]
        },
        { id: 'h2', visibility: 'dm-only' }
      ]
    }
    const out = filterGameStateForRole(state, false)
    expect(out.handouts).toHaveLength(1)
    const h = out.handouts[0] as { id: string; pages: Array<{ id: string }> }
    expect(h.id).toBe('h1')
    expect(h.pages.map((p) => p.id)).toEqual(['p1'])
  })

  it('strips unrevealed traps for non-DM', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = {
      ...baseState,
      placedTraps: [
        { id: 'tr1', revealed: true },
        { id: 'tr2', revealed: false },
        { id: 'tr3' }
      ]
    }
    const out = filterGameStateForRole(state, false)
    expect((out.placedTraps as Array<{ id: string }>).map((t) => t.id)).toEqual(['tr1'])
  })

  it('does not mutate the input state', async () => {
    const { filterGameStateForRole } = await import('./index')
    const tokens = [
      { id: 'a', isHidden: false },
      { id: 'b', isHidden: true }
    ]
    const state = {
      ...baseState,
      maps: [
        {
          id: 'm1',
          name: 'Map',
          campaignId: 'c',
          imagePath: '',
          width: 100,
          height: 100,
          grid: null,
          tokens,
          fogOfWar: null,
          terrain: [],
          createdAt: '2026-01-01'
        }
      ]
    }
    filterGameStateForRole(state, false)
    expect(tokens).toHaveLength(2)
    expect(state.maps[0].tokens).toBe(tokens)
  })

  // --- Tradeoff-closer tests: collateral state keyed by hidden entity ids ---

  function withHiddenToken(extra: Partial<typeof baseState>): typeof baseState {
    return {
      ...baseState,
      maps: [
        {
          id: 'm1',
          name: 'Map',
          campaignId: 'c',
          imagePath: '',
          width: 100,
          height: 100,
          grid: null,
          tokens: [
            { id: 'visible-1', isHidden: false },
            { id: 'hidden-1', isHidden: true }
          ],
          fogOfWar: null,
          terrain: [],
          createdAt: '2026-01-01'
        }
      ],
      ...extra
    }
  }

  it('strips initiative.entries whose entityId is a hidden token', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = withHiddenToken({
      initiative: {
        entries: [
          { id: 'e1', entityId: 'visible-1', total: 14 },
          { id: 'e2', entityId: 'hidden-1', total: 17 }
        ],
        currentIndex: 0,
        round: 1
      }
    })
    const out = filterGameStateForRole(state, false)
    const init = out.initiative as { entries: Array<{ id: string }> }
    expect(init.entries.map((e) => e.id)).toEqual(['e1'])
  })

  it('strips turnStates keys for hidden tokens', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = withHiddenToken({
      turnStates: {
        'visible-1': { actionUsed: false },
        'hidden-1': { actionUsed: false, isHidden: true }
      }
    })
    const out = filterGameStateForRole(state, false)
    expect(Object.keys(out.turnStates)).toEqual(['visible-1'])
  })

  it('strips conditions whose entityId is a hidden token', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = withHiddenToken({
      conditions: [
        { id: 'c1', entityId: 'visible-1', condition: 'Stunned' },
        { id: 'c2', entityId: 'hidden-1', condition: 'Frightened' }
      ]
    })
    const out = filterGameStateForRole(state, false)
    expect((out.conditions as Array<{ id: string }>).map((c) => c.id)).toEqual(['c1'])
  })

  it('strips customEffects whose targetEntityId is a hidden token', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = withHiddenToken({
      customEffects: [
        { id: 'fx1', targetEntityId: 'visible-1' },
        { id: 'fx2', targetEntityId: 'hidden-1' }
      ]
    })
    const out = filterGameStateForRole(state, false)
    expect((out.customEffects as Array<{ id: string }>).map((c) => c.id)).toEqual(['fx1'])
  })

  it('strips marchingOrder ids for hidden tokens', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = withHiddenToken({
      marchingOrder: ['visible-1', 'hidden-1', 'visible-2']
    })
    const out = filterGameStateForRole(state, false)
    expect(out.marchingOrder).toEqual(['visible-1', 'visible-2'])
  })

  it('strips DM-only stat-block pointers from sidebar entries on top of `notes`', async () => {
    const { filterGameStateForRole } = await import('./index')
    const state = {
      ...baseState,
      enemies: [
        {
          id: 'e1',
          name: 'Goblin',
          visibleToPlayers: true,
          notes: 'tactics',
          monsterStatBlockId: 'mon-goblin',
          linkedMonsterId: 'mon-goblin',
          statBlock: { ac: 15, hp: 7 }
        }
      ]
    }
    const out = filterGameStateForRole(state, false)
    expect(out.enemies).toHaveLength(1)
    const e = out.enemies[0] as Record<string, unknown>
    expect(e).not.toHaveProperty('notes')
    expect(e).not.toHaveProperty('monsterStatBlockId')
    expect(e).not.toHaveProperty('linkedMonsterId')
    expect(e).not.toHaveProperty('statBlock')
    expect(e.id).toBe('e1')
    expect(e.name).toBe('Goblin')
  })
})

describe('transformUpdatePayloadForPeer', () => {
  // Test-only token lookup — accepts a fixture map of tokens
  function makeLookup(tokens: Record<string, { isHidden?: boolean }>) {
    return (_mapId: string, tokenId: string) => tokens[tokenId] ?? null
  }

  it('passes through every payload unchanged when isDM=true', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const payloads: unknown[] = [
      { addToken: { mapId: 'm', token: { id: 't', isHidden: true } } },
      { updateToken: { mapId: 'm', tokenId: 't', updates: { isHidden: true } } },
      { addMap: { id: 'm', tokens: [{ id: 'a', isHidden: true }] } },
      { mapsWithImages: [{ id: 'm', tokens: [{ id: 'a', isHidden: true }] }] }
    ]
    for (const p of payloads) {
      expect(transformUpdatePayloadForPeer(p, true, lookup)).toBe(p)
    }
  })

  it('passes through unrelated payloads for non-DM', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const out = transformUpdatePayloadForPeer({ initiative: { round: 3 } }, false, lookup)
    expect(out).toEqual({ initiative: { round: 3 } })
  })

  it('returns null when addToken targets a hidden token', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const out = transformUpdatePayloadForPeer(
      { addToken: { mapId: 'm', token: { id: 't', isHidden: true } } },
      false,
      lookup
    )
    expect(out).toBeNull()
  })

  it('passes through addToken when the token is not hidden', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const payload = { addToken: { mapId: 'm', token: { id: 't', isHidden: false } } }
    const out = transformUpdatePayloadForPeer(payload, false, lookup)
    expect(out).toEqual(payload)
  })

  it('rewrites updateToken with isHidden=true to removeToken (host hides a visible token)', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({ t: { isHidden: true } })
    const out = transformUpdatePayloadForPeer(
      { updateToken: { mapId: 'm1', tokenId: 't', updates: { isHidden: true, currentHP: 10 } } },
      false,
      lookup
    )
    expect(out).toEqual({ removeToken: { mapId: 'm1', tokenId: 't' } })
  })

  it('rewrites updateToken with isHidden=false to addToken (host reveals a hidden token)', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    // After the host applies the reveal locally, `lookupToken` returns the token
    // with isHidden=false. Tests model that post-update view.
    const fullToken = { id: 't', name: 'Goblin', isHidden: false, currentHP: 7 }
    const lookup = makeLookup({ t: fullToken })
    const out = transformUpdatePayloadForPeer(
      { updateToken: { mapId: 'm1', tokenId: 't', updates: { isHidden: false } } },
      false,
      lookup
    )
    expect(out).toEqual({ addToken: { mapId: 'm1', token: fullToken } })
  })

  it('returns null when revealing a token that does not exist in host state', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({}) // no tokens
    const out = transformUpdatePayloadForPeer(
      { updateToken: { mapId: 'm1', tokenId: 'gone', updates: { isHidden: false } } },
      false,
      lookup
    )
    expect(out).toBeNull()
  })

  it('suppresses non-visibility updates on a currently-hidden token', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({ t: { isHidden: true } })
    const out = transformUpdatePayloadForPeer(
      { updateToken: { mapId: 'm1', tokenId: 't', updates: { currentHP: 5 } } },
      false,
      lookup
    )
    expect(out).toBeNull()
  })

  it('passes through non-visibility updates on a currently-visible token', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({ t: { isHidden: false } })
    const payload = { updateToken: { mapId: 'm1', tokenId: 't', updates: { currentHP: 5 } } }
    const out = transformUpdatePayloadForPeer(payload, false, lookup)
    expect(out).toEqual(payload)
  })

  it('strips hidden tokens from addMap.tokens', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const out = transformUpdatePayloadForPeer(
      {
        addMap: {
          id: 'm',
          tokens: [
            { id: 'a', isHidden: false },
            { id: 'b', isHidden: true },
            { id: 'c' }
          ]
        }
      },
      false,
      lookup
    ) as { addMap: { tokens: Array<{ id: string }> } }
    expect(out.addMap.tokens.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('strips hidden tokens from each map in mapsWithImages', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const out = transformUpdatePayloadForPeer(
      {
        mapsWithImages: [
          {
            id: 'm1',
            tokens: [
              { id: 'a', isHidden: false },
              { id: 'b', isHidden: true }
            ]
          },
          {
            id: 'm2',
            tokens: [{ id: 'c', isHidden: true }]
          }
        ]
      },
      false,
      lookup
    ) as { mapsWithImages: Array<{ id: string; tokens: Array<{ id: string }> }> }
    expect(out.mapsWithImages[0].tokens.map((t) => t.id)).toEqual(['a'])
    expect(out.mapsWithImages[1].tokens).toHaveLength(0)
  })

  it('does not mutate the input payload', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    const original = {
      addMap: {
        id: 'm',
        tokens: [
          { id: 'a', isHidden: false },
          { id: 'b', isHidden: true }
        ]
      }
    }
    transformUpdatePayloadForPeer(original, false, lookup)
    expect(original.addMap.tokens).toHaveLength(2)
  })

  it('handles non-object payloads gracefully (non-DM)', async () => {
    const { transformUpdatePayloadForPeer } = await import('./index')
    const lookup = makeLookup({})
    expect(transformUpdatePayloadForPeer(null, false, lookup)).toBeNull()
    expect(transformUpdatePayloadForPeer(undefined, false, lookup)).toBeUndefined()
    expect(transformUpdatePayloadForPeer('not-object', false, lookup)).toBe('not-object')
  })
})
