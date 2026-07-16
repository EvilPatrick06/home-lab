import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { create as tarCreate, extract as tarExtract } from 'tar'
import { afterEach, describe, expect, it } from 'vitest'
import { isCampaignScopedTarEntry, isSafeRestoreTarEntry } from './cloud-sync'

const CID = 'camp-123'

describe('isCampaignScopedTarEntry', () => {
  it('accepts the four campaign-scoped prefixes (and their children)', () => {
    for (const p of [
      `campaigns/${CID}.json`,
      `game-states/${CID}.json`,
      `ai-conversations/${CID}.json`,
      `campaigns/${CID}`,
      `campaigns/${CID}/maps/dungeon.png`,
      `./campaigns/${CID}.json` // leading ./ as tar sometimes emits
    ]) {
      expect(isCampaignScopedTarEntry(p, CID), p).toBe(true)
    }
  })

  it('rejects sibling userData files a poisoned archive could target', () => {
    for (const p of [
      'settings.json', // bmoApiKey + TURN creds live here
      'discord/config.json',
      'plugins/evil/index.js',
      'campaigns/OTHER-id.json',
      'campaigns/OTHER-id/assets.bin',
      'game-states/OTHER-id.json',
      `campaigns/${CID}x/escape-by-prefix.json`, // prefix must be boundary-exact
      `campaigns/${CID}.json.bak`,
      ''
    ]) {
      expect(isCampaignScopedTarEntry(p, CID), p).toBe(false)
    }
  })
})

describe('restore extraction confinement (tar round-trip)', () => {
  let dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
    dirs = []
  })

  it('extracts only campaign-scoped members; poisoned members are skipped', async () => {
    const src = await mkdtemp(join(tmpdir(), 'vtt-tar-src-'))
    const dest = await mkdtemp(join(tmpdir(), 'vtt-tar-dest-'))
    dirs.push(src, dest)

    // Build an archive mixing legitimate campaign files with poisoned members
    // (the shapes a tampered Drive backup or mismatched campaignId would carry).
    await mkdir(join(src, 'campaigns', CID), { recursive: true })
    await mkdir(join(src, 'discord'), { recursive: true })
    await writeFile(join(src, 'campaigns', `${CID}.json`), '{"ok":true}')
    await writeFile(join(src, 'campaigns', CID, 'map.json'), '{}')
    await writeFile(join(src, 'settings.json'), '{"bmoApiKey":"EVIL"}')
    await writeFile(join(src, 'discord', 'config.json'), '{"token":"EVIL"}')
    await writeFile(join(src, 'campaigns', 'OTHER.json'), '{"clobbered":true}')
    const archive = join(src, 'poisoned.tar.gz')
    await tarCreate({ file: archive, cwd: src, gzip: true }, [
      `campaigns/${CID}.json`,
      `campaigns/${CID}/map.json`,
      'settings.json',
      'discord/config.json',
      'campaigns/OTHER.json'
    ])

    // Same filter wiring restoreCampaignFromDrive uses.
    await tarExtract({
      file: archive,
      cwd: dest,
      preservePaths: false,
      filter: (entryPath, entry) =>
        isSafeRestoreTarEntry(entryPath, entry && 'type' in entry ? entry.type : undefined, CID)
    })

    expect(existsSync(join(dest, 'campaigns', `${CID}.json`))).toBe(true)
    expect(existsSync(join(dest, 'campaigns', CID, 'map.json'))).toBe(true)
    expect(existsSync(join(dest, 'settings.json'))).toBe(false)
    expect(existsSync(join(dest, 'discord', 'config.json'))).toBe(false)
    expect(existsSync(join(dest, 'campaigns', 'OTHER.json'))).toBe(false)
  })
})

describe('isSafeRestoreTarEntry — symlink/hardlink rejection (SECURITY-LOG 2026-07-15)', () => {
  it('rejects symlink and hardlink entries even when the entry path is campaign-scoped', () => {
    const scoped = `campaigns/${CID}/notes.txt`
    expect(isSafeRestoreTarEntry(scoped, 'File', CID)).toBe(true)
    expect(isSafeRestoreTarEntry(scoped, 'SymbolicLink', CID)).toBe(false)
    expect(isSafeRestoreTarEntry(scoped, 'Link', CID)).toBe(false)
  })

  let dirs: string[] = []
  afterEach(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })))
    dirs = []
  })

  it('does not extract a campaign-scoped symlink whose target escapes userData', async () => {
    const src = await mkdtemp(join(tmpdir(), 'vtt-tar-sym-src-'))
    const dest = await mkdtemp(join(tmpdir(), 'vtt-tar-sym-dest-'))
    dirs.push(src, dest)

    await mkdir(join(src, 'campaigns', CID), { recursive: true })
    await writeFile(join(src, 'campaigns', `${CID}.json`), '{"ok":true}')
    // A symlink inside the campaign subtree pointing at a sibling secret file.
    await symlink('../../settings.json', join(src, 'campaigns', CID, 'leak.txt'))

    const archive = join(src, 'symlink.tar.gz')
    await tarCreate({ file: archive, cwd: src, gzip: true }, [`campaigns/${CID}.json`, `campaigns/${CID}/leak.txt`])

    await tarExtract({
      file: archive,
      cwd: dest,
      preservePaths: false,
      filter: (entryPath, entry) =>
        isSafeRestoreTarEntry(entryPath, entry && 'type' in entry ? entry.type : undefined, CID)
    })

    expect(existsSync(join(dest, 'campaigns', `${CID}.json`))).toBe(true)
    // The symlink entry must have been skipped, not planted in the campaign dir.
    expect(existsSync(join(dest, 'campaigns', CID, 'leak.txt'))).toBe(false)
  })
})
