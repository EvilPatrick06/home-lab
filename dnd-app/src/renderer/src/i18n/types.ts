/**
 * Phase 34a — translation key type. Originally a `string` stub; now backed by a
 * literal union derived from `en.json` by `scripts/i18n/gen-key-union.mjs`
 * (`npm run i18n:gen-keys`). The union (`TranslationKey`) lists every dotted key
 * in `en.json`, so editors autocomplete keys and a typo'd literal is flagged.
 *
 * `TranslationKeys` (the public alias every consumer + `useT()` imports) is the
 * union widened with `(string & {})`. The `string & {}` member is a TypeScript
 * idiom that keeps the literal-union autocomplete/suggestions while still
 * accepting arbitrary `string` keys — required because a handful of call sites
 * pass genuinely DYNAMIC keys (`t(variable)`, template literals like
 * `t(\`game.actionBar.actionLabel.\${id}\`)`, or runtime-built keys that have no
 * static en.json leaf, e.g. `compendiumModal.tabs.encounter-presets`). Those
 * can't be expressed as literals, so a pure union would reject them. The
 * `scripts/i18n/check-keys.mjs` CI gate still catches typo'd STATIC literal keys
 * at the JSON level, so the dynamic escape hatch doesn't lose coverage there.
 */
export type { TranslationKey } from './generated-keys'

import type { TranslationKey } from './generated-keys'

// `string & {}` is the canonical TS idiom for "literal-union autocomplete +
// accept any string": it keeps editor suggestions/typo-catching on the union
// while still accepting the genuinely dynamic keys above; plain `string` would
// collapse the union and lose both.
export type TranslationKeys = TranslationKey | (string & {})
