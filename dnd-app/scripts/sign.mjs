/**
 * scripts/sign.mjs
 * Phase 19d — conditional Windows code-signing hook for electron-builder.
 *
 * electron-builder invokes this `sign` hook for each signable artifact. When no
 * signing certificate is configured (`CSC_LINK` unset — the normal case for
 * local/dev builds and CI without secrets) we skip signing entirely so the
 * build still succeeds (it just produces an unsigned installer that triggers a
 * SmartScreen prompt). When `CSC_LINK` IS set, we sign with the Windows SDK
 * `signtool` using the configured cert.
 *
 * Configure via .env.signing (see .env.signing.template):
 *   CSC_LINK          path to the .pfx certificate
 *   CSC_KEY_PASSWORD  certificate password
 *
 * @param {{ path: string, hash?: string }} configuration
 */
export default async function sign(configuration) {
  if (!process.env.CSC_LINK) {
    console.log(`[sign] CSC_LINK not set — skipping code signing for ${configuration.path}`)
    return
  }

  // A cert is present — sign with the Windows SDK signtool. This path only runs
  // on a Windows builder with the SDK installed; importing lazily keeps the
  // module loadable everywhere else (tests never invoke signing).
  const { execFileSync } = await import('node:child_process')
  const cert = process.env.CSC_LINK
  const password = process.env.CSC_KEY_PASSWORD ?? ''
  const args = [
    'sign',
    '/fd',
    'sha256',
    '/f',
    cert,
    ...(password ? ['/p', password] : []),
    '/tr',
    'http://timestamp.digicert.com',
    '/td',
    'sha256',
    configuration.path
  ]
  execFileSync('signtool', args, { stdio: 'inherit' })
  console.log(`[sign] signed ${configuration.path}`)
}
