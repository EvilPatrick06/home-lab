import type { Shard } from './shard'

/**
 * Phase 31a — module-level shard registry. Features register their shard at
 * import time (31e+); the broadcaster/applier iterate `getShards()`.
 */
const shards: Shard[] = []

export function registerShard<T>(shard: Shard<T>): void {
  if (shards.some((s) => s.name === shard.name)) return
  shards.push(shard as Shard)
}

export function getShards(): Shard[] {
  return shards
}

export function findShard(name: string): Shard | undefined {
  return shards.find((s) => s.name === name)
}
