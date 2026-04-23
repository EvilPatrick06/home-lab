import { beforeEach, describe, expect, it } from 'vitest'
import { pluginEventBus } from './event-bus'

describe('PluginEventBus', () => {
  beforeEach(() => {
    pluginEventBus.clear()
  })

  it('should emit and receive synchronous events', () => {
    let received = ''
    pluginEventBus.on<string>('test', 'plugin-a', (payload) => {
      received = payload
    })
    pluginEventBus.emit('test', 'hello')
    expect(received).toBe('hello')
  })

  it('should support filter hooks that modify payload', () => {
    pluginEventBus.on<number>('calc', 'plugin-a', (val) => val + 10)
    pluginEventBus.on<number>('calc', 'plugin-b', (val) => val * 2)
    const result = pluginEventBus.emit('calc', 5)
    expect(result).toBe(30) // (5 + 10) * 2
  })

  it('should respect priority ordering', () => {
    const order: string[] = []
    pluginEventBus.on(
      'order',
      'plugin-b',
      () => {
        order.push('b')
      },
      200
    )
    pluginEventBus.on(
      'order',
      'plugin-a',
      () => {
        order.push('a')
      },
      50
    )
    pluginEventBus.on(
      'order',
      'plugin-c',
      () => {
        order.push('c')
      },
      100
    )
    pluginEventBus.emit('order', null)
    expect(order).toEqual(['a', 'c', 'b'])
  })

  it('should report hasSubscribers correctly', () => {
    expect(pluginEventBus.hasSubscribers('missing')).toBe(false)
    pluginEventBus.on('test', 'p', () => {})
    expect(pluginEventBus.hasSubscribers('test')).toBe(true)
  })

  it('should remove all subscriptions for a plugin', () => {
    let count = 0
    pluginEventBus.on('a', 'plugin-x', () => {
      count++
    })
    pluginEventBus.on('b', 'plugin-x', () => {
      count++
    })
    pluginEventBus.on('a', 'plugin-y', () => {
      count++
    })
    pluginEventBus.removePlugin('plugin-x')
    pluginEventBus.emit('a', null)
    pluginEventBus.emit('b', null)
    expect(count).toBe(1) // only plugin-y's handler on 'a'
  })

  it('should handle errors in handlers gracefully', () => {
    pluginEventBus.on<number>('err', 'plugin-a', () => {
      throw new Error('boom')
    })
    pluginEventBus.on<number>('err', 'plugin-b', (val) => val + 1)
    const result = pluginEventBus.emit('err', 5)
    expect(result).toBe(6) // plugin-a throws but plugin-b still runs
  })

  it('should support async events', async () => {
    pluginEventBus.onAsync<number>('async-test', 'plugin-a', async (val) => {
      return val + 100
    })
    const result = await pluginEventBus.emitAsync('async-test', 5)
    expect(result).toBe(105)
  })

  it('should return original payload when no subscribers', () => {
    const result = pluginEventBus.emit('nope', { data: 42 })
    expect(result).toEqual({ data: 42 })
  })
})
