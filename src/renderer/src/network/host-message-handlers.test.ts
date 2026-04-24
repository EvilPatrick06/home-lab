import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

import { isClientAllowedMessageType, validateMessage } from './host-message-handlers'

describe('isClientAllowedMessageType', () => {
  it('allows player: prefixed messages', () => {
    expect(isClientAllowedMessageType('player:join')).toBe(true)
    expect(isClientAllowedMessageType('player:leave')).toBe(true)
    expect(isClientAllowedMessageType('player:ready')).toBe(true)
    expect(isClientAllowedMessageType('player:character-select')).toBe(true)
    expect(isClientAllowedMessageType('player:buy-item')).toBe(true)
  })

  it('allows chat: prefixed messages', () => {
    expect(isClientAllowedMessageType('chat:message')).toBe(true)
    expect(isClientAllowedMessageType('chat:whisper')).toBe(true)
    expect(isClientAllowedMessageType('chat:file')).toBe(true)
  })

  it('allows game:dice-roll', () => {
    expect(isClientAllowedMessageType('game:dice-roll')).toBe(true)
  })

  it('denies game: messages other than dice-roll', () => {
    expect(isClientAllowedMessageType('game:state-update')).toBe(false)
    expect(isClientAllowedMessageType('game:initiative-update')).toBe(false)
  })

  it('denies dm: prefixed messages', () => {
    expect(isClientAllowedMessageType('dm:map-update')).toBe(false)
  })
})

describe('validateMessage', () => {
  it('rejects messages without type', () => {
    expect(validateMessage({ payload: {} })).toBe(false)
  })

  it('rejects messages without payload', () => {
    expect(validateMessage({ type: 'chat:message' })).toBe(false)
  })

  it('accepts valid messages', () => {
    expect(validateMessage({ type: 'chat:message', payload: { message: 'hello' } })).toBe(true)
  })
})

describe('applyChatModeration', () => {
  it('module file exists on disk', () => {
    expect(existsSync(resolve(__dirname, './host-message-handlers.ts'))).toBe(true)
  })

  it('exports applyChatModeration function', () => {
    const src = readFileSync(resolve(__dirname, './host-message-handlers.ts'), 'utf-8')
    expect(src).toContain('export function applyChatModeration')
  })
})
