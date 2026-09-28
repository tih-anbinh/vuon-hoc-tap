// Author: Huy Tran
// Company: Cadence Design Systems Vietnam
// Email: huytran@cadence.com
// Created: 2026-09-27
//
// Optional Supabase sync for the progress store (settings, progress, attempts, ledger, observations).
// Rules (spec 1, 8.1, D03/D07): local-first; nothing leaves the device until a parent signs in on parent.html
// AND turns on "Cloud sync"; the store carries no child name/birth date/voice; recordings are never synced.
// One row per signed-in parent account: ro_progress(id = auth.uid(), store jsonb, updated_at). Merge is the
// same dedup merge used by backup import, so replaying a push can never duplicate stars or attempts (D01).

import { SUPA_URL, SUPA_ANON, SUPA_JS_URL, SYNC_TABLE } from './config.mjs';
import { mergeStores, migrate, STORE_VERSION } from './progress-store.mjs';

let client = null;
let pushTimer = null;
const listeners = new Set();
export const syncState = { status: 'off', user: null, lastPush: null, lastPull: null, error: null };

function emit() { for (const fn of listeners) fn(syncState); }
export function onSyncChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setState(patch) { Object.assign(syncState, patch); emit(); }

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.supabase?.createClient) return res();
    const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(); s.onerror = () => rej(new Error('could not load supabase-js'));
    document.head.append(s);
  });
}

/** Create the client lazily (loads the SDK from CDN only when called). */
export async function getClient() {
  if (client) return client;
  if (!navigator.onLine) throw new Error('offline');
  await loadScript(SUPA_JS_URL);
  client = window.supabase.createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

/** Returns the signed-in user without loading the SDK if no session is cached (cheap check for the child app). */
export function cachedSessionUser() {
  try {
    const ref = new URL(SUPA_URL).host.split('.')[0];
    const raw = localStorage.getItem(`sb-${ref}-auth-token`); if (!raw) return null;
    const j = JSON.parse(raw); const u = j?.user || j?.currentSession?.user; return u ? { id: u.id, email: u.email } : null;
  } catch { return null; }
}

export async function signIn(email, password) {
  const c = await getClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  setState({ user: { id: data.user.id, email: data.user.email }, error: null });
  return syncState.user;
}
export async function signUp(email, password) {
  const c = await getClient();
  const { error } = await c.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
}
export async function signOut() {
  try { const c = await getClient(); await c.auth.signOut(); } catch { /* ignore */ }
  setState({ user: null, status: 'off' });
}

/**
 * Attach sync to a ProgressStore. Pull-merge-push on start, debounced push on every change.
 * Only runs when settings.cloud_sync_enabled is true and a session exists.
 */
export async function attachSync(store, { debounceMs = 4000 } = {}) {
  if (!store.data.settings.cloud_sync_enabled) { setState({ status: 'off' }); return false; }
  const cached = cachedSessionUser();
  if (!cached) { setState({ status: 'signed_out' }); return false; }
  try {
    const c = await getClient();
    const { data: { session } } = await c.auth.getSession();
    if (!session) { setState({ status: 'signed_out', user: null }); return false; }
    setState({ user: { id: session.user.id, email: session.user.email }, status: 'syncing' });
    await pull(store);
    await push(store);
    store.onChange(() => { if (!store.data.settings.cloud_sync_enabled) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => push(store), debounceMs); });
    window.addEventListener('online', () => push(store));
    setState({ status: 'on', error: null });
    return true;
  } catch (e) {
    setState({ status: 'error', error: e.message || String(e) });
    return false;
  }
}

export async function pull(store) {
  const c = await getClient(); const uid = syncState.user?.id; if (!uid) return null;
  const { data, error } = await c.from(SYNC_TABLE).select('store, store_version, updated_at').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.store) return null;
  if ((data.store_version || 1) > STORE_VERSION) throw new Error(`cloud data is from a newer app version (${data.store_version})`);
  const remote = migrate(data.store);
  // Newer side wins for settings; lists are deduped by id/key; per-book progress keeps the latest last_seen_at.
  const localNewer = (store.data.updated_at || '') > (data.updated_at || '');
  store.data = localNewer ? mergeStores(remote, store.data) : mergeStores(store.data, remote);
  store.save();
  setState({ lastPull: new Date().toISOString() });
  return remote;
}

export async function push(store) {
  if (!navigator.onLine) return false;
  try {
    const c = await getClient(); const uid = syncState.user?.id; if (!uid) return false;
    store.data.updated_at = new Date().toISOString();
    const row = { id: uid, store: store.data, store_version: STORE_VERSION, updated_at: store.data.updated_at };
    const { error } = await c.from(SYNC_TABLE).upsert(row);
    if (error) throw new Error(error.message);
    setState({ lastPush: row.updated_at, error: null, status: 'on' });
    return true;
  } catch (e) { setState({ status: 'error', error: e.message || String(e) }); return false; }
}
