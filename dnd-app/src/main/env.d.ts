// Build-time defines injected by electron.vite.config.ts (`main.define`).
// Replaced with string literals at build; guard reads with
// `typeof __X__ !== 'undefined'` since they are not assigned in dev/test.

/** Cloudflare Access service-token client id (off-LAN Pi auth). '' when unset. */
declare const __CF_ACCESS_CLIENT_ID__: string
/** Cloudflare Access service-token client secret (off-LAN Pi auth). '' when unset. */
declare const __CF_ACCESS_CLIENT_SECRET__: string
