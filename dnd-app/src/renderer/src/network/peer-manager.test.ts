import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// PeerJS touches browser/WebRTC globals at construction; stub it so the module
// (and its pure ICE-config helpers) import cleanly in the node test env.
vi.mock('peerjs', () => ({ default: class MockPeer {} }))

import { CLOUD_ICE_SERVERS } from '../constants'
import { configureForP2P, getIceConfig, resetToDefaults } from './peer-manager'

describe('peer-manager (source surface)', () => {
  const srcPath = resolve(__dirname, './peer-manager.ts')
  const src = readFileSync(srcPath, 'utf-8')

  it('module file exists', () => {
    expect(existsSync(srcPath)).toBe(true)
  })

  it('exports createPeer function', () => {
    expect(src).toContain('export function createPeer')
  })

  it('exports destroyPeer function', () => {
    expect(src).toContain('export function destroyPeer')
  })

  it('exports getPeer function', () => {
    expect(src).toContain('export function getPeer')
  })

  it('exports getPeerId function', () => {
    expect(src).toContain('export function getPeerId')
  })

  it('exports getIceConfig function', () => {
    expect(src).toContain('export function getIceConfig')
  })

  it('exports setIceConfig function', () => {
    expect(src).toContain('export function setIceConfig')
  })

  it('exports setSignalingServer function', () => {
    expect(src).toContain('export function setSignalingServer')
  })

  it('exports generateInviteCode re-export', () => {
    expect(src).toContain('export { generateInviteCode }')
  })
})

const allUrls = (servers: RTCIceServer[]): string[] =>
  servers.flatMap((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]))

describe('peer-manager ICE config — LAN self-host drops unresolvable public STUN', () => {
  beforeEach(() => resetToDefaults())

  it('LAN self-host (http base) uses ONLY the Pi STUN by IP — no public STUN hostnames', () => {
    configureForP2P('http://10.0.0.5:5000')
    const ice = getIceConfig()
    expect(ice).toEqual([{ urls: 'stun:10.0.0.5:3478' }])
    // Regression: the public STUN servers are hostnames that a broken WebRTC
    // resolver can't reach (-105). They must not be configured on the LAN, where
    // direct host candidates + the Pi STUN-by-IP are enough.
    const urls = allUrls(ice)
    expect(urls.some((u) => u.includes('stun.l.google.com'))).toBe(false)
    expect(urls.some((u) => u.includes('stun.cloudflare.com'))).toBe(false)
  })

  it('off-LAN self-host (https tunnel base) KEEPS public STUN for NAT traversal', () => {
    configureForP2P('https://bmo.example.com')
    const ice = getIceConfig()
    expect(ice).toContainEqual({ urls: 'stun:bmo.example.com:3478' })
    for (const server of CLOUD_ICE_SERVERS) {
      expect(ice).toContainEqual(server)
    }
  })

  it('no Pi configured falls back to the public cloud STUN set', () => {
    configureForP2P(null)
    expect(getIceConfig()).toEqual(CLOUD_ICE_SERVERS)
  })
})
