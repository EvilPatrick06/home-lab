import { describe, expect, it } from 'vitest'
import { bmoCspConnectFragmentForBaseUrl } from './bmo-csp'

describe('bmoCspConnectFragmentForBaseUrl', () => {
  it('uses default bmo.local when undefined (same default as bmo-bridge)', () => {
    const f = bmoCspConnectFragmentForBaseUrl(undefined)
    expect(f).toBe(' ws://bmo.local:* http://bmo.local:*')
  })

  it('derives http and ws hosts with port wildcard for LAN IP', () => {
    const f = bmoCspConnectFragmentForBaseUrl('http://192.168.1.100:5000')
    expect(f).toBe(' ws://192.168.1.100:* http://192.168.1.100:*')
  })

  it('uses wss and https for https base URL', () => {
    const f = bmoCspConnectFragmentForBaseUrl('https://pi.example.com:443')
    expect(f).toBe(' wss://pi.example.com:* https://pi.example.com:*')
  })

  it('formats IPv6 host with brackets', () => {
    const f = bmoCspConnectFragmentForBaseUrl('http://[::1]:5000')
    expect(f).toBe(' ws://[::1]:* http://[::1]:*')
  })

  it('returns empty string for invalid URL', () => {
    expect(bmoCspConnectFragmentForBaseUrl('not-a-url')).toBe('')
  })

  it('returns empty string for non-http(s) scheme', () => {
    expect(bmoCspConnectFragmentForBaseUrl('ftp://bmo.local:5000')).toBe('')
  })
})
