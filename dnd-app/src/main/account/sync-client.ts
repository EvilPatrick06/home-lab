/**
 * Main-process transport for the per-user cloud-sync engine.
 *
 * The renderer sync engine (shared with the web build) calls `window.api.sync.*`;
 * on desktop those route here, where the held bearer token (account-session) +
 * the CF Access service-token headers authorize the call to the Pi `/api/sync/*`.
 * The renderer never sees the token.
 */

import { getBmoAccessHeaders, getBmoSecretBaseUrl } from '../bmo-config'
import * as session from './account-session'

export interface SyncObjectMeta {
  domain: string
  id: string
  hash: string | null
  version: number
  mtime: number
  size: number
  deleted: boolean
}

export interface SyncPutResult {
  accepted: boolean
  winner?: SyncObjectMeta
}

function authHeaders(): Record<string, string> {
  const token = session.getToken()
  return { ...getBmoAccessHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) }
}

export async function getManifest(): Promise<SyncObjectMeta[]> {
  const res = await fetch(`${getBmoSecretBaseUrl()}/api/sync/manifest`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`sync manifest → ${res.status}`)
  const body = (await res.json()) as { objects?: SyncObjectMeta[] }
  return body.objects ?? []
}

export async function getObject(domain: string, id: string): Promise<ArrayBuffer | null> {
  const url = `${getBmoSecretBaseUrl()}/api/sync/object?domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}`
  const res = await fetch(url, { headers: authHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`sync get → ${res.status}`)
  return await res.arrayBuffer()
}

export async function putObject(
  domain: string,
  id: string,
  version: number,
  mtime: number,
  hash: string | null,
  bytes: ArrayBuffer
): Promise<SyncPutResult> {
  const form = new FormData()
  form.set('domain', domain)
  form.set('id', id)
  form.set('version', String(version))
  form.set('mtime', String(mtime))
  form.set('hash', hash ?? '')
  form.set('blob', new Blob([bytes]), 'blob.bin')
  const res = await fetch(`${getBmoSecretBaseUrl()}/api/sync/object`, {
    method: 'POST',
    headers: authHeaders(),
    body: form
  })
  if (res.status === 413) return { accepted: false } // quota / too large
  if (!res.ok) throw new Error(`sync put → ${res.status}`)
  return (await res.json()) as SyncPutResult
}

export async function deleteObject(domain: string, id: string, version: number): Promise<SyncPutResult> {
  const url =
    `${getBmoSecretBaseUrl()}/api/sync/object?domain=${encodeURIComponent(domain)}` +
    `&id=${encodeURIComponent(id)}&version=${version}`
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() })
  if (!res.ok) throw new Error(`sync delete → ${res.status}`)
  return (await res.json()) as SyncPutResult
}
