import { supabase } from './supabase.js';
import { CURRENT_SCHEMA_VER } from './persistence.js';

/**
 * Pull the current cloud save for a user.
 * Returns { data, updatedAt, schemaVer } or null if no row exists.
 */
export async function pullSave(userId) {
  const { data, error } = await supabase
    .from('saves')
    .select('data, updated_at, schema_ver')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { data: data.data, updatedAt: data.updated_at, schemaVer: data.schema_ver };
}

/**
 * Upsert the player state for a user. Caller is responsible for
 * ensuring `userId` matches the authenticated user.
 */
export async function pushSave(userId, blob) {
  const { error } = await supabase.from('saves').upsert({
    user_id: userId,
    data: blob,
    updated_at: new Date().toISOString(),
    schema_ver: CURRENT_SCHEMA_VER,
  });
  if (error) throw error;
}

/** Delete only the cloud save row. Profile remains. */
export async function deleteCloudSave(userId) {
  const { error } = await supabase.from('saves').delete().eq('user_id', userId);
  if (error) throw error;
}

/** Delete both rows for the user (account deletion). */
export async function deleteAccount(userId) {
  const { error: e1 } = await supabase.from('saves').delete().eq('user_id', userId);
  const { error: e2 } = await supabase.from('profiles').delete().eq('id', userId);
  if (e1) throw e1;
  if (e2) throw e2;
}

/** Upsert a profile row from the user's GitHub metadata (idempotent). */
export async function upsertProfile(userId, githubLogin, avatarUrl) {
  const { error } = await supabase.from('profiles').upsert({
    id: userId,
    github_login: githubLogin,
    avatar_url: avatarUrl,
  });
  if (error) throw error;
}
