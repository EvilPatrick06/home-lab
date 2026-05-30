/**
 * Phase 31e — shard barrel.
 *
 * Importing this module runs each shard module's top-level `registerShard`
 * call, so the broadcaster/applier see every migrated feature. The network
 * store imports this once at module load to populate the registry before the
 * host broadcaster or client applier start.
 *
 * Add a new feature shard here when migrating it onto the pipeline (31f+).
 */
import './conditions-shard'
import './fog-shard'
import './initiative-shard'
